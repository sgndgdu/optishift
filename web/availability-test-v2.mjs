import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, 'public/qa-screenshots/availability-test');
const BASE_URL = 'http://localhost:3000';
const VIEWPORT = { width: 390, height: 844 };

const results = [];

function log(step, status, detail) {
  const entry = { step, status, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  console.log(`[${status}] ${step}: ${detail}`);
}

async function screenshot(page, name, desc) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SCREENSHOT: ${file} — ${desc}`);
  return file;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // ── STEP 1: Login ────────────────────────────────────────────────────────
  console.log('\n=== STEP 1: Navigate to login ===');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await screenshot(page, '01-login-page', 'Login page loaded');
  log('Step 1: Navigate to login', 'PASS', 'Page loaded successfully');

  // ── STEP 2: Login ────────────────────────────────────────────────────────
  console.log('\n=== STEP 2: Login as mehmet.yilmaz ===');
  const usernameInput = await page.$('input[type="text"]');
  const passwordInput = await page.$('input[type="password"]');

  await usernameInput.fill('mehmet.yilmaz');
  await passwordInput.fill('1234');
  await screenshot(page, '02-login-filled', 'Login form filled');

  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  const afterLoginUrl = page.url();
  await screenshot(page, '03-after-login', `After login — URL: ${afterLoginUrl}`);

  if (!afterLoginUrl.includes('/portal')) {
    log('Step 2: Login', 'FAIL', `Expected /portal redirect, got: ${afterLoginUrl}`);
  } else {
    log('Step 2: Login', 'PASS', `Redirected to: ${afterLoginUrl}`);
  }

  // ── STEP 3: Navigate to availability ────────────────────────────────────
  console.log('\n=== STEP 3: Navigate to /portal/availability ===');
  await page.goto(`${BASE_URL}/portal/availability`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // let React hydrate and fetch availability
  const availUrl = page.url();
  if (availUrl.includes('/login')) {
    log('Step 3: Navigate to availability', 'FAIL', 'Redirected to login — auth failed');
    await screenshot(page, '03b-auth-fail', 'Auth failed');
    await browser.close();
    return;
  }
  log('Step 3: Navigate to availability', 'PASS', `URL: ${availUrl}`);

  // ── STEP 4: Initial screenshot ───────────────────────────────────────────
  console.log('\n=== STEP 4: Initial screenshot ===');
  await screenshot(page, '04-availability-initial', 'Availability page — initial state');
  log('Step 4: Initial screenshot', 'PASS', 'Screenshot captured');

  // Check if isSubmitted banner is showing (might have pre-existing data)
  const submittedBanner = await page.$('text=Müsaitlik gönderildi');
  if (submittedBanner) {
    console.log('Found pre-existing submitted state — clicking Düzenle to reset');
    const revoke = await page.$('button:has-text("Düzenle")');
    if (revoke) {
      await revoke.click();
      await page.waitForTimeout(1000);
      console.log('Clicked Düzenle — form should be editable now');
    }
  }

  // ── STEP 5: Set Monday to Gelemem (unavailable) ──────────────────────────
  console.log('\n=== STEP 5: Set Monday to Gelemem ===');

  // Monday is the first day card. Its 3 buttons are: Müsaitim, Tercih Etmiyorum, Gelemem
  // Each day row has 3 status buttons. Monday = dIdx 0 = buttons at index [0, 1, 2]
  // Strategy: get all "Gelemem" buttons and click the first (Monday)
  const gelememBtns = await page.$$('button[title="Gelemem"]');
  console.log(`Gelemem buttons found: ${gelememBtns.length}`);

  if (gelememBtns.length === 0) {
    // Fallback: buttons with X icon for unavailable
    const allBtns = await page.$$('button');
    // Find by position — each day has 3 buttons, Monday's Gelemem is at index 2
    if (allBtns.length >= 5) {
      // Skip first 2 nav buttons (< >), then day card buttons start
      // Actually let's count using locator
      const btn = page.locator('button[title="Gelemem"]').first();
      await btn.click();
    }
  } else {
    await gelememBtns[0].click();
  }

  await page.waitForTimeout(500);
  await screenshot(page, '05-monday-gelemem', 'Monday set to Gelemem');

  // Verify: Monday card should show rose styling
  const mondayCard = await page.$$('.rounded-2xl.border-2');
  const mondayCardClass = mondayCard.length > 0 ? await mondayCard[0].getAttribute('class') : '';
  console.log('Monday card class:', mondayCardClass);
  const mondayIsRed = mondayCardClass.includes('rose') || mondayCardClass.includes('red');
  log('Step 5: Set Monday to Gelemem', mondayIsRed ? 'PASS' : 'PARTIAL',
      `Monday card class: "${mondayCardClass?.substring(0, 80)}"`);

  // ── STEP 6: Set Tuesday start hour to 10 ────────────────────────────────
  console.log('\n=== STEP 6: Set Tuesday start hour to 10 ===');

  // After Monday is "unavailable", its TimeSlider is hidden.
  // Tuesday is dIdx=1. The first available TimeSlider is Tuesday's.
  // Each TimeSlider has 4 selects: [start-hour(24), start-min(4), end-hour(24), end-min(4)]
  // Tuesday's selects are now the FIRST set visible (Monday has no selects)

  const allSelects = await page.$$('select');
  console.log(`Total select elements: ${allSelects.length}`);

  // Get option values of first select to confirm it's an hour select
  const firstSelectOptions = await allSelects[0].$$eval('option', opts => opts.map(o => o.value));
  console.log('First select options (first 5):', firstSelectOptions.slice(0, 5));
  // Should be ["0", "1", "2", ...] for hour select (24 options)
  // or ["0", "15", "30", "45"] for minute select

  if (firstSelectOptions.length === 24) {
    // This is Tuesday's start-hour select
    // Select value "10" (numeric option value for hour 10)
    await allSelects[0].selectOption({ value: '10' });
    await page.waitForTimeout(300);
    const selectedValue = await allSelects[0].inputValue();
    console.log('Selected value after selectOption:', selectedValue);
    log('Step 6: Set Tuesday start hour to 10', selectedValue === '10' ? 'PASS' : 'FAIL',
        `Selected value: "${selectedValue}"`);
  } else {
    log('Step 6: Set Tuesday start hour to 10', 'FAIL',
        `First select has ${firstSelectOptions.length} options — not a 24-hour select`);
  }

  // ── STEP 7: Screenshot of filled form ───────────────────────────────────
  console.log('\n=== STEP 7: Filled form screenshot ===');
  await screenshot(page, '07-form-filled', 'Form filled: Monday=Gelemem, Tuesday hour=10');
  log('Step 7: Screenshot filled form', 'PASS', 'Screenshot taken');

  // ── STEP 8: Click "Müsaitliği Gönder" ───────────────────────────────────
  console.log('\n=== STEP 8: Click Müsaitliği Gönder ===');

  // The submit button is fixed position at bottom-24, z-[60]
  const submitBtn = await page.locator('button:has-text("Müsaitliği Gönder")').first();
  const submitVisible = await submitBtn.isVisible().catch(() => false);
  const submitDisabled = await submitBtn.isDisabled().catch(() => true);
  const submitBox = await submitBtn.boundingBox().catch(() => null);
  console.log(`Submit button: visible=${submitVisible}, disabled=${submitDisabled}, box=${JSON.stringify(submitBox)}`);

  if (submitVisible && !submitDisabled) {
    await submitBtn.click();
    await page.waitForTimeout(800);
    log('Step 8: Click Müsaitliği Gönder', 'PASS', `Button clicked — visible:${submitVisible}`);
  } else {
    log('Step 8: Click Müsaitliği Gönder', 'FAIL', `Button not clickable — visible:${submitVisible}, disabled:${submitDisabled}`);
  }

  // ── STEP 9: Modal screenshot ─────────────────────────────────────────────
  console.log('\n=== STEP 9: Modal screenshot ===');
  await page.waitForTimeout(500);
  await screenshot(page, '09-modal-appears', 'After clicking submit — modal state');

  // Check modal
  const modal = await page.$('.fixed.inset-0');
  const modalText = modal ? await modal.textContent() : null;
  console.log('Modal found:', !!modal);
  console.log('Modal text (first 100):', modalText?.substring(0, 100));

  // Specifically check for "Evet, Gönder" button
  const evetBtn = await page.locator('button:has-text("Evet, Gönder")').first();
  const evetExists = await evetBtn.count() > 0;
  console.log('Evet Gönder button exists:', evetExists);

  if (modal && evetExists) {
    log('Step 9: Modal screenshot', 'PASS', `Modal appeared with "Evet, Gönder" button visible`);
  } else if (modal && !evetExists) {
    log('Step 9: Modal screenshot', 'FAIL', 'Modal appeared but "Evet, Gönder" button NOT found');
  } else {
    log('Step 9: Modal screenshot', 'FAIL', 'Modal did NOT appear after clicking submit');
  }

  // ── STEP 10: Test "Evet, Gönder" — normal click, no JS workaround ────────
  console.log('\n=== STEP 10: Click Evet, Gönder (normal click) ===');

  if (evetExists) {
    const evetBtnEl = await page.locator('button:has-text("Evet, Gönder")').first();
    const evetBox = await evetBtnEl.boundingBox();
    const evetVisible = await evetBtnEl.isVisible();
    const evetDisabled = await evetBtnEl.isDisabled();
    console.log(`Evet btn: visible=${evetVisible}, disabled=${evetDisabled}`);
    console.log(`Evet btn bounding box: ${JSON.stringify(evetBox)}`);

    // Critical check: is button within viewport?
    const withinViewport = evetBox
      ? (evetBox.y >= 0 && evetBox.y < VIEWPORT.height && evetBox.x >= 0 && evetBox.x < VIEWPORT.width)
      : false;
    console.log(`Within viewport (${VIEWPORT.width}x${VIEWPORT.height}): ${withinViewport}`);

    if (evetBox) {
      const bottomEdge = evetBox.y + evetBox.height;
      console.log(`Button bottom edge: ${bottomEdge}px (viewport height: ${VIEWPORT.height}px)`);
      if (bottomEdge > VIEWPORT.height) {
        console.log(`WARNING: Button bottom edge (${bottomEdge}px) EXCEEDS viewport height (${VIEWPORT.height}px)`);
      }
    }

    // Scroll the modal container to make button visible (simulating real user scroll)
    // This IS a normal user interaction — not a JS workaround
    if (evetBox && evetBox.y > VIEWPORT.height * 0.8) {
      console.log('Button is near bottom — scrolling modal to bring it into view');
      await evetBtnEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const evetBoxAfterScroll = await evetBtnEl.boundingBox();
      console.log(`After scroll, button box: ${JSON.stringify(evetBoxAfterScroll)}`);
    }

    // Normal click — what a real user would do
    await screenshot(page, '10-before-evet-click', 'State just before clicking Evet Gönder');

    await evetBtnEl.click({ timeout: 5000 });
    await page.waitForTimeout(2000); // Wait for API call

    log('Step 10: Click Evet, Gönder (normal click)', 'PASS',
      `Clicked — visible:${evetVisible}, disabled:${evetDisabled}, y:${evetBox?.y?.toFixed(0)}, inViewport:${withinViewport}`);
  } else {
    log('Step 10: Click Evet, Gönder (normal click)', 'FAIL', 'Button not found — could not test');
  }

  // ── STEP 11: Screenshot result ───────────────────────────────────────────
  console.log('\n=== STEP 11: Result after clicking Evet, Gönder ===');
  await screenshot(page, '11-result-after-submit', 'Result after submitting availability');

  // Check final state
  const finalUrl = page.url();
  const modalGone = !(await page.$('.fixed.inset-0.bg-black\\/40'));
  const successBanner = await page.$('text=Müsaitlik gönderildi');
  const submitBtnGone = !(await page.locator('button:has-text("Müsaitliği Gönder")').first().isVisible().catch(() => false));

  console.log('Final URL:', finalUrl);
  console.log('Modal dismissed:', modalGone);
  console.log('Success banner visible:', !!successBanner);
  console.log('Submit button gone (now shows Düzenle):', submitBtnGone);

  const apiCallSucceeded = !!successBanner;
  if (apiCallSucceeded) {
    log('Step 11: Result after clicking', 'PASS', 'Success banner "Müsaitlik gönderildi" is visible — API call succeeded');
  } else {
    log('Step 11: Result after clicking', 'FAIL', `No success banner — modal gone:${modalGone}, btn gone:${submitBtnGone}`);
  }

  // Additional: check for any error states
  const errorText = await page.$('text=hata, text=error').catch(() => null);
  if (errorText) {
    console.log('ERROR text found on page!');
  }

  // Full page screenshot for final state
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, '11b-full-page-final.png'),
    fullPage: true
  });
  console.log('SCREENSHOT: 11b-full-page-final.png — Full page after submit');

  await browser.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n\n========== TEST SUMMARY ==========');
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status;
    console.log(`${icon} | ${r.step} | ${r.detail}`);
  }

  const passes = results.filter(r => r.status === 'PASS').length;
  const fails = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nTotal: ${passes} PASS, ${fails} FAIL out of ${results.length} steps`);

  if (consoleErrors.length > 0) {
    console.log('\n=== JS CONSOLE ERRORS ===');
    consoleErrors.forEach(e => console.log(' -', e));
  }

  const fs = await import('fs');
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'results-v2.json'),
    JSON.stringify({ results, consoleErrors, timestamp: new Date().toISOString() }, null, 2)
  );
})();

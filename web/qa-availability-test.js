/**
 * QA Playwright Script — Employee Portal Availability Page
 * Tests: login, navigate, interact, submit, screenshot evidence
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = '/Users/sefagundogdu/Desktop/OptiShift/web/public/qa-screenshots';
const BASE_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function shot(page, name, fullPage = true) {
  const filepath = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: filepath, fullPage });
  console.log(`SCREENSHOT: ${name}`);
  return filepath;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro — mobile-first portal
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const log = [];
  const issues = [];

  function addIssue(severity, description, screenshot) {
    issues.push({ severity, description, screenshot });
    console.log(`[${severity}] ${description}`);
  }

  // ── STEP 1: Login ──────────────────────────────────────────────────────────
  console.log('\n=== STEP 1: Login ===');
  await page.goto(`${BASE_URL}/login`);
  await sleep(1500);
  await shot(page, 'avail-01-login-page.png');

  // Fill login form
  const usernameField = await page.$('input[name="username"], input[placeholder*="kullanici"], input[type="text"]');
  const passwordField = await page.$('input[name="password"], input[type="password"]');

  if (!usernameField || !passwordField) {
    addIssue('CRITICAL', 'Login form fields not found', 'avail-01-login-page.png');
  } else {
    await usernameField.fill('mehmet.yilmaz');
    await passwordField.fill('1234');
    await shot(page, 'avail-02-login-filled.png');

    const submitBtn = await page.$('button[type="submit"], button:has-text("Giriş"), button:has-text("Gir")');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await sleep(2000);
    await shot(page, 'avail-03-after-login.png');
    log.push(`After login URL: ${page.url()}`);
    console.log(`After login URL: ${page.url()}`);
  }

  // ── STEP 2: Navigate to Availability ──────────────────────────────────────
  console.log('\n=== STEP 2: Navigate to Availability ===');
  await page.goto(`${BASE_URL}/portal/availability`);
  await sleep(2000);
  await shot(page, 'avail-04-availability-initial.png');
  log.push(`Availability page URL: ${page.url()}`);
  console.log(`Availability page URL: ${page.url()}`);

  // Check if redirected away (auth failure)
  if (!page.url().includes('/portal/availability')) {
    addIssue('CRITICAL', `Auth redirect — expected /portal/availability, got ${page.url()}`, 'avail-04-availability-initial.png');
  }

  // Wait for content to load
  await sleep(1000);
  await shot(page, 'avail-05-availability-loaded.png', true);

  // ── STEP 3: Audit initial state ────────────────────────────────────────────
  console.log('\n=== STEP 3: Audit Initial State ===');

  // Check for the 7 day cards
  const dayCards = await page.$$('[class*="rounded-2xl"][class*="border-2"]');
  console.log(`Day cards found: ${dayCards.length}`);
  if (dayCards.length < 7) {
    addIssue('HIGH', `Expected 7 day cards, found ${dayCards.length}`, 'avail-05-availability-loaded.png');
  }

  // Check for TimeSlider selects
  const selects = await page.$$('select');
  console.log(`Select elements found: ${selects.length}`);
  if (selects.length === 0) {
    addIssue('HIGH', 'No select dropdowns found — TimeSlider may not be rendering', 'avail-05-availability-loaded.png');
  }

  // Check for the "Müsaitliği Gönder" button
  const sendBtn = await page.$('button:has-text("Müsaitliği Gönder")');
  if (!sendBtn) {
    addIssue('HIGH', '"Müsaitliği Gönder" button not found on page', 'avail-05-availability-loaded.png');
  } else {
    console.log('"Müsaitliği Gönder" button found');
  }

  // Check for summary ribbon
  const ribbon = await page.$('[class*="bg-slate-50"][class*="rounded-2xl"]');
  if (!ribbon) {
    addIssue('MEDIUM', 'Weekly summary ribbon not found', 'avail-05-availability-loaded.png');
  }

  // ── STEP 4: Inspect select values ─────────────────────────────────────────
  console.log('\n=== STEP 4: Inspect Select Values ===');
  const allSelects = await page.$$('select');
  for (let i = 0; i < Math.min(allSelects.length, 8); i++) {
    const val = await allSelects[i].evaluate(el => el.value);
    const opts = await allSelects[i].evaluate(el => Array.from(el.options).map(o => o.value));
    console.log(`Select[${i}]: value=${val}, options=[${opts.join(',')}]`);
  }

  // Inspect start/end selects for first day (Monday)
  if (allSelects.length >= 2) {
    const startHourVal = await allSelects[0].evaluate(el => el.value);
    const startMinVal = await allSelects[1].evaluate(el => el.value);
    console.log(`Monday start: ${startHourVal}:${String(startMinVal).padStart(2,'0')}`);
    // Default should be 08:00
    if (startHourVal !== '8') {
      addIssue('MEDIUM', `Monday start hour should default to 8 (08:00), got ${startHourVal}`, 'avail-05-availability-loaded.png');
    }
  }

  // ── STEP 5: Change Monday to "Gelemem" (unavailable) ──────────────────────
  console.log('\n=== STEP 5: Set Monday to Gelemem ===');
  // Find the Gelemem button (X icon) for first day
  const gelemButtons = await page.$$('button[title="Gelemem"]');
  console.log(`"Gelemem" buttons found: ${gelemButtons.length}`);
  if (gelemButtons.length > 0) {
    await gelemButtons[0].click();
    await sleep(500);
    await shot(page, 'avail-06-monday-gelemem.png');
    // Verify time selects are hidden for this day
    const selectsAfter = await page.$$('select');
    console.log(`Selects after Gelemem: ${selectsAfter.length} (should be fewer than before: ${allSelects.length})`);
    if (selectsAfter.length >= allSelects.length && allSelects.length > 0) {
      addIssue('MEDIUM', 'TimeSlider selects not hidden when day set to Gelemem', 'avail-06-monday-gelemem.png');
    }
  } else {
    addIssue('HIGH', 'Could not find "Gelemem" button to test with', 'avail-05-availability-loaded.png');
  }

  // ── STEP 6: Change Tuesday to "Tercih Etmiyorum" (preferred_not) ──────────
  console.log('\n=== STEP 6: Set Tuesday to Tercih Etmiyorum ===');
  const preferNotButtons = await page.$$('button[title="Tercih Etmiyorum"]');
  console.log(`"Tercih Etmiyorum" buttons found: ${preferNotButtons.length}`);
  if (preferNotButtons.length >= 2) {
    await preferNotButtons[1].click(); // Tuesday = index 1
    await sleep(500);
    await shot(page, 'avail-07-tuesday-preferred-not.png');
  } else if (preferNotButtons.length === 1) {
    await preferNotButtons[0].click();
    await sleep(500);
    await shot(page, 'avail-07-tuesday-preferred-not.png');
  } else {
    addIssue('HIGH', 'Could not find "Tercih Etmiyorum" buttons', 'avail-06-monday-gelemem.png');
  }

  // ── STEP 7: Change Wednesday hour dropdown ─────────────────────────────────
  console.log('\n=== STEP 7: Change Wednesday hour dropdown ===');
  await page.reload();
  await sleep(2000);

  // Re-check login state after reload
  if (!page.url().includes('/portal/availability')) {
    console.log(`After reload URL: ${page.url()} — navigating back`);
    await page.goto(`${BASE_URL}/portal/availability`);
    await sleep(2000);
  }

  const selectsNew = await page.$$('select');
  console.log(`Selects after reload: ${selectsNew.length}`);

  // Change start hour of first day (Monday) — select index 0 is Monday start hour
  if (selectsNew.length >= 5) {
    // Wednesday selects should be around index 4,5 (each day has 4 selects: start_h, start_m, end_h, end_m)
    // Actually let's look at day cards to find the 3rd day's selects
    // Each rendered day with status != unavailable has 4 selects (start_h, start_m, end_h, end_m)
    // Wednesday = index 2, so selects 8-11 (if all 7 days visible)
    const wedStartHourSelect = selectsNew[8]; // Wednesday start hour
    if (wedStartHourSelect) {
      const beforeVal = await wedStartHourSelect.evaluate(el => el.value);
      console.log(`Wednesday start hour before: ${beforeVal}`);
      await wedStartHourSelect.selectOption('10'); // Change to 10:00
      await sleep(300);
      const afterVal = await wedStartHourSelect.evaluate(el => el.value);
      console.log(`Wednesday start hour after: ${afterVal}`);
      await shot(page, 'avail-08-time-changed.png');

      if (afterVal !== '10') {
        addIssue('HIGH', `Hour select change not working — expected 10, got ${afterVal}`, 'avail-08-time-changed.png');
      }
    } else {
      console.log('Wednesday selects not accessible by index — trying first day');
      await selectsNew[0].selectOption('9');
      await sleep(300);
      await shot(page, 'avail-08-time-changed.png');
    }
  }

  // ── STEP 8: Full view screenshot with interactions ─────────────────────────
  console.log('\n=== STEP 8: Full page after interactions ===');

  // Apply Monday = Gelemem
  const gelemBtns2 = await page.$$('button[title="Gelemem"]');
  if (gelemBtns2.length > 0) await gelemBtns2[0].click();
  await sleep(300);

  // Apply Tuesday = Tercih Etmiyorum
  const preferBtns2 = await page.$$('button[title="Tercih Etmiyorum"]');
  if (preferBtns2.length >= 2) await preferBtns2[1].click();
  await sleep(300);

  await shot(page, 'avail-09-after-all-interactions.png', true);

  // ── STEP 9: Click "Müsaitliği Gönder" ──────────────────────────────────────
  console.log('\n=== STEP 9: Submit Availability ===');

  // Scroll to bottom to make button visible
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(300);

  const sendBtnFinal = await page.$('button:has-text("Müsaitliği Gönder")');
  if (!sendBtnFinal) {
    addIssue('CRITICAL', '"Müsaitliği Gönder" button not found before submit attempt', 'avail-09-after-all-interactions.png');
  } else {
    const btnVisible = await sendBtnFinal.isVisible();
    const btnEnabled = await sendBtnFinal.isEnabled();
    console.log(`Submit button: visible=${btnVisible}, enabled=${btnEnabled}`);

    if (!btnVisible) {
      addIssue('HIGH', '"Müsaitliği Gönder" button exists but is not visible', 'avail-09-after-all-interactions.png');
      // Try scrolling
      await sendBtnFinal.scrollIntoViewIfNeeded();
      await sleep(500);
      await shot(page, 'avail-09b-submit-btn-scroll.png', false);
    }

    await sendBtnFinal.click({ force: true });
    await sleep(800);
    await shot(page, 'avail-10-confirm-modal.png', false);

    // Check if modal appeared
    const modal = await page.$('text=Müsaitlik Onayı');
    if (!modal) {
      addIssue('HIGH', 'Confirmation modal did not appear after clicking "Müsaitliği Gönder"', 'avail-10-confirm-modal.png');
    } else {
      console.log('Confirmation modal appeared');

      // Screenshot the modal content
      await shot(page, 'avail-11-modal-content.png', false);

      // Check modal content
      const yesBtn = await page.$('button:has-text("Evet, Gönder")');
      const cancelBtn = await page.$('button:has-text("İptal")');
      console.log(`Modal: Yes button=${!!yesBtn}, Cancel button=${!!cancelBtn}`);

      if (!yesBtn) {
        addIssue('HIGH', '"Evet, Gönder" button not found in confirmation modal', 'avail-11-modal-content.png');
      } else {
        // ── STEP 10: Click "Evet, Gönder" ──────────────────────────────────
        console.log('\n=== STEP 10: Confirm Submit ===');
        await yesBtn.click();
        await sleep(2000);
        await shot(page, 'avail-12-after-submit.png', true);

        // Check if success banner appeared
        const successBanner = await page.$('text=Müsaitlik gönderildi');
        if (!successBanner) {
          addIssue('HIGH', 'Success banner "Müsaitlik gönderildi" not visible after submit', 'avail-12-after-submit.png');
        } else {
          console.log('SUCCESS: "Müsaitlik gönderildi" banner visible');
        }

        // Check if "Düzenlemek İçin Geri Al" button appeared
        const revokeBtn = await page.$('button:has-text("Düzenlemek İçin Geri Al")');
        if (!revokeBtn) {
          addIssue('MEDIUM', '"Düzenlemek İçin Geri Al" button not visible after submit', 'avail-12-after-submit.png');
        }

        // Check if form is now disabled (opacity-60 + pointer-events-none)
        const disabledForm = await page.$('[class*="opacity-60"][class*="pointer-events-none"]');
        if (!disabledForm) {
          addIssue('MEDIUM', 'Form not visually disabled after submit (opacity-60 class missing)', 'avail-12-after-submit.png');
        }
      }
    }
  }

  // ── STEP 11: Desktop viewport screenshot ──────────────────────────────────
  console.log('\n=== STEP 11: Desktop viewport ===');
  await context.close();
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(`${BASE_URL}/portal/availability`);
  await sleep(2000);
  await shot(desktopPage, 'avail-13-desktop-view.png', true);
  await desktopContext.close();

  // ── Write results ──────────────────────────────────────────────────────────
  const results = {
    timestamp: new Date().toISOString(),
    url: `${BASE_URL}/portal/availability`,
    issues,
    log,
    screenshots: fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.startsWith('avail-')),
  };

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'avail-qa-results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n=== QA RESULTS SUMMARY ===');
  console.log(`Issues found: ${issues.length}`);
  issues.forEach((iss, i) => {
    console.log(`  ${i+1}. [${iss.severity}] ${iss.description}`);
  });

  await browser.close();
})();

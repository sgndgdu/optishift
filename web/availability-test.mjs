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

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // STEP 1: Open login page
    console.log('\n=== STEP 1: Navigate to login ===');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await screenshot(page, '01-login-page', 'Login page loaded');
    log('Step 1: Navigate to login', 'PASS', 'Page loaded successfully');

    // STEP 2: Login
    console.log('\n=== STEP 2: Login ===');
    // Check what input fields exist
    const inputs = await page.$$eval('input', els => els.map(el => ({ type: el.type, name: el.name, placeholder: el.placeholder, id: el.id })));
    console.log('Inputs found:', JSON.stringify(inputs));

    // Try to fill login form
    const usernameInput = await page.$('input[type="text"], input[name="username"], input[placeholder*="kullanıcı"], input[placeholder*="Kullanıcı"]');
    const passwordInput = await page.$('input[type="password"]');

    if (!usernameInput || !passwordInput) {
      // Maybe it uses email field
      const emailInput = await page.$('input[type="email"]');
      if (emailInput) {
        await emailInput.fill('mehmet.yilmaz');
      } else {
        log('Step 2: Login', 'FAIL', 'Could not find username/email input');
        await screenshot(page, '02-login-fail', 'Login inputs not found');
        throw new Error('Login inputs not found');
      }
    } else {
      await usernameInput.fill('mehmet.yilmaz');
    }

    if (passwordInput) {
      await passwordInput.fill('1234');
    }

    await screenshot(page, '02-login-filled', 'Login form filled');

    // Click submit button
    const submitBtn = await page.$('button[type="submit"], button:has-text("Giriş"), button:has-text("giriş")');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const afterLoginUrl = page.url();
    console.log('URL after login:', afterLoginUrl);
    await screenshot(page, '03-after-login', `After login, URL: ${afterLoginUrl}`);

    if (afterLoginUrl.includes('/login') || afterLoginUrl.includes('error')) {
      log('Step 2: Login', 'FAIL', `Still on login page: ${afterLoginUrl}`);
    } else {
      log('Step 2: Login', 'PASS', `Redirected to: ${afterLoginUrl}`);
    }

    // STEP 3: Navigate to availability page
    console.log('\n=== STEP 3: Navigate to availability ===');
    await page.goto(`${BASE_URL}/portal/availability`, { waitUntil: 'networkidle' });
    const availUrl = page.url();
    console.log('Availability URL:', availUrl);

    if (availUrl.includes('/login')) {
      log('Step 3: Navigate to availability', 'FAIL', 'Redirected back to login — session not persisted');
      await screenshot(page, '04-availability-redirect', 'Redirected to login');
      throw new Error('Auth failed — cannot proceed');
    }
    log('Step 3: Navigate to availability', 'PASS', `URL: ${availUrl}`);

    // STEP 4: Initial screenshot
    console.log('\n=== STEP 4: Initial screenshot ===');
    await page.waitForTimeout(1500); // Let UI render
    await screenshot(page, '04-availability-initial', 'Availability page initial state');
    log('Step 4: Initial screenshot', 'PASS', 'Screenshot taken');

    // Inspect page structure
    const pageTitle = await page.$eval('h1, h2', el => el.textContent).catch(() => 'no heading');
    console.log('Page heading:', pageTitle);

    const allText = await page.$eval('body', el => el.innerText.substring(0, 500)).catch(() => '');
    console.log('Page text (first 500):', allText);

    // STEP 5: Set Monday to Gelemem (red)
    console.log('\n=== STEP 5: Set Monday to Gelemem ===');

    // Find Monday day buttons/selectors
    // Look for day labels
    const dayElements = await page.$$eval('[data-day], .day-button, .day-cell', els =>
      els.map(el => ({ text: el.textContent?.trim(), tag: el.tagName, class: el.className }))
    ).catch(() => []);
    console.log('Day elements found:', JSON.stringify(dayElements.slice(0, 10)));

    // Look for Pazartesi (Monday in Turkish)
    const mondayBtn = await page.$('button:has-text("Paz"), [data-day="0"], button:has-text("Pzt"), button:has-text("Pzt")');

    // Try to find the day selector for Monday
    // Availability pages often have a grid of days with color selectors
    const availButtons = await page.$$eval('button', els =>
      els.map(el => ({ text: el.textContent?.trim().substring(0, 30), class: el.className?.substring(0, 50) }))
    );
    console.log('All buttons:', JSON.stringify(availButtons.slice(0, 20)));

    // Look for red/gelemem button for Monday
    // The UI likely has day rows with color buttons
    let mondayGelemem = null;

    // Strategy 1: Look for button with text "Gelemem"
    const gelememBtns = await page.$$('button:has-text("Gelemem"), button:has-text("gelemem")');
    console.log(`Found ${gelememBtns.length} Gelemem buttons`);

    if (gelememBtns.length > 0) {
      // Click the first one (Monday)
      await gelememBtns[0].click();
      await page.waitForTimeout(500);
      log('Step 5: Set Monday to Gelemem', 'PASS', 'Clicked Gelemem button for Monday');
    } else {
      // Strategy 2: Look for colored radio buttons or day status buttons
      // Try clicking on day row and then selecting red
      const redBtns = await page.$$('[class*="red"], [class*="Red"], [data-status="unavailable"], [data-color="red"]');
      console.log(`Found ${redBtns.length} red buttons`);

      if (redBtns.length > 0) {
        await redBtns[0].click();
        await page.waitForTimeout(500);
        log('Step 5: Set Monday to Gelemem', 'PASS', 'Clicked red status button');
      } else {
        log('Step 5: Set Monday to Gelemem', 'SKIP', 'Could not find Gelemem button — UI structure unclear');
      }
    }

    await screenshot(page, '05-monday-gelemem', 'After setting Monday to Gelemem');

    // STEP 6: Set Tuesday hour to 10
    console.log('\n=== STEP 6: Set Tuesday hour to 10 ===');

    const selects = await page.$$eval('select', els =>
      els.map(el => ({ name: el.name, id: el.id, class: el.className?.substring(0, 50), optionCount: el.options.length }))
    );
    console.log('Select elements:', JSON.stringify(selects));

    const hourSelects = await page.$$('select[name*="hour"], select[id*="hour"], select[class*="hour"], select');
    console.log(`Found ${hourSelects.length} select elements`);

    if (hourSelects.length >= 2) {
      // Second select might be Tuesday's hour
      await hourSelects[1].selectOption('10');
      await page.waitForTimeout(500);
      log('Step 6: Set Tuesday hour to 10', 'PASS', 'Selected hour 10 in second select');
    } else if (hourSelects.length === 1) {
      await hourSelects[0].selectOption('10');
      await page.waitForTimeout(500);
      log('Step 6: Set Tuesday hour to 10', 'PASS', 'Selected hour 10');
    } else {
      // Try number inputs
      const numberInputs = await page.$$('input[type="number"], input[type="range"]');
      console.log(`Found ${numberInputs.length} number/range inputs`);
      if (numberInputs.length > 0) {
        await numberInputs[0].fill('10');
        log('Step 6: Set Tuesday hour to 10', 'PARTIAL', 'Filled number input with 10');
      } else {
        log('Step 6: Set Tuesday hour to 10', 'SKIP', 'No hour selects found');
      }
    }

    // STEP 7: Screenshot of filled form
    console.log('\n=== STEP 7: Filled form screenshot ===');
    await screenshot(page, '07-filled-form', 'Availability form filled out');
    log('Step 7: Screenshot filled form', 'PASS', 'Screenshot taken');

    // STEP 8: Click "Müsaitliği Gönder" button
    console.log('\n=== STEP 8: Click submit button ===');

    const submitButtons = await page.$$eval('button', els =>
      els.map(el => ({ text: el.textContent?.trim(), disabled: el.disabled, class: el.className?.substring(0, 80) }))
    );
    console.log('Submit area buttons:', JSON.stringify(submitButtons));

    const gonButton = await page.$('button:has-text("Gönder"), button:has-text("gönder"), button:has-text("Müsait"), button:has-text("müsait")');

    if (gonButton) {
      const btnText = await gonButton.textContent();
      console.log('Found submit button:', btnText);
      const isDisabled = await gonButton.isDisabled();
      console.log('Is button disabled?', isDisabled);

      await gonButton.click();
      await page.waitForTimeout(1000);
      log('Step 8: Click Müsaitliği Gönder', 'PASS', `Clicked button: "${btnText?.trim()}"`);
    } else {
      log('Step 8: Click Müsaitliği Gönder', 'FAIL', 'Submit button not found');
    }

    // STEP 9: Screenshot the modal
    console.log('\n=== STEP 9: Modal screenshot ===');
    await page.waitForTimeout(800);
    await screenshot(page, '09-modal', 'After clicking submit — modal should appear');

    // Check if modal appeared
    const modalVisible = await page.$('[role="dialog"], .modal, [class*="modal"], [class*="Modal"], [class*="dialog"]');
    const modalText = modalVisible ? await modalVisible.textContent() : null;
    console.log('Modal found:', !!modalVisible, 'Text:', modalText?.substring(0, 100));

    if (modalVisible) {
      log('Step 9: Modal screenshot', 'PASS', `Modal appeared with text: "${modalText?.substring(0, 60)}"`);
    } else {
      log('Step 9: Modal screenshot', 'FAIL', 'No modal dialog found after clicking submit');
    }

    // STEP 10 & 11: Click "Evet, Gönder" — normal click, no JS workaround
    console.log('\n=== STEP 10: Click Evet, Gönder (normal click) ===');

    const evetBtn = await page.$('button:has-text("Evet"), button:has-text("evet"), button:has-text("Gönder"):not(:has-text("Müsait"))');

    if (evetBtn) {
      const evetText = await evetBtn.textContent();
      const evetDisabled = await evetBtn.isDisabled();
      console.log('Found Evet button:', evetText?.trim(), 'Disabled:', evetDisabled);

      // Check if button is in viewport / reachable
      const box = await evetBtn.boundingBox();
      console.log('Button bounding box:', JSON.stringify(box));

      const isVisible = await evetBtn.isVisible();
      console.log('Button is visible:', isVisible);

      if (box && isVisible && !evetDisabled) {
        // Check if it's within viewport
        const withinViewport = box.y >= 0 && box.y < VIEWPORT.height && box.x >= 0 && box.x < VIEWPORT.width;
        console.log('Within viewport:', withinViewport, `y=${box.y}, viewport height=${VIEWPORT.height}`);

        // Normal click — no JS workaround
        await evetBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1500);

        log('Step 10: Click Evet Gönder (normal click)', 'PASS',
          `Clicked normally — visible:${isVisible}, disabled:${evetDisabled}, y:${Math.round(box.y)}, inViewport:${withinViewport}`);
      } else {
        log('Step 10: Click Evet Gönder (normal click)', 'FAIL',
          `Button not clickable — visible:${isVisible}, disabled:${evetDisabled}, box:${JSON.stringify(box)}`);
      }
    } else {
      // Look harder
      const allBtnsAfter = await page.$$eval('button', els =>
        els.map(el => ({ text: el.textContent?.trim().substring(0, 40), visible: el.offsetParent !== null }))
      );
      console.log('All buttons after modal:', JSON.stringify(allBtnsAfter));
      log('Step 10: Click Evet Gönder (normal click)', 'FAIL', 'Evet/Gönder button not found in modal');
    }

    // STEP 11: Screenshot result after clicking
    console.log('\n=== STEP 11: Result screenshot ===');
    await screenshot(page, '11-result-after-click', 'Result after clicking Evet Gönder');

    // Check final state
    const finalUrl = page.url();
    const finalModalGone = !(await page.$('[role="dialog"], .modal, [class*="modal"]'));
    const successMsg = await page.$('[class*="success"], [class*="toast"], [class*="Toast"], [role="alert"]');
    const successText = successMsg ? await successMsg.textContent() : null;

    console.log('Final URL:', finalUrl);
    console.log('Modal dismissed:', finalModalGone);
    console.log('Success message:', successText);

    if (finalModalGone || successText) {
      log('Step 11: Result after clicking', 'PASS', `Modal dismissed: ${finalModalGone}, Success: "${successText?.substring(0, 60)}"`);
    } else {
      log('Step 11: Result after clicking', 'FAIL', 'Modal still present or no success feedback');
    }

    // Scroll down to see full result
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await screenshot(page, '11b-result-scrolled', 'Result scrolled down');

  } catch (err) {
    console.error('TEST ERROR:', err.message);
    log('FATAL ERROR', 'ERROR', err.message);
    await screenshot(page, 'error-state', `Error: ${err.message}`).catch(() => {});
  }

  await browser.close();

  // Print summary
  console.log('\n\n========== TEST SUMMARY ==========');
  for (const r of results) {
    console.log(`${r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status} | ${r.step} | ${r.detail}`);
  }

  // Print console errors
  if (consoleErrors.length > 0) {
    console.log('\n=== JS CONSOLE ERRORS ===');
    consoleErrors.forEach(e => console.log(e));
  }

  // Save results JSON
  const fs = await import('fs');
  fs.writeFileSync(
    '/Users/sefagundogdu/Desktop/OptiShift/web/public/qa-screenshots/availability-test/results.json',
    JSON.stringify({ results, consoleErrors, timestamp: new Date().toISOString() }, null, 2)
  );
  console.log('\nResults saved to availability-test/results.json');
})();

/**
 * QA Playwright Script v2 — Employee Portal Availability Page
 * Fixed: nav bar pointer-events interception on modal button
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = '/Users/sefagundogdu/Desktop/OptiShift/web/public/qa-screenshots';
const BASE_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function shot(page, name, fullPage = false) {
  const filepath = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: filepath, fullPage });
  console.log(`SCREENSHOT: ${name}`);
  return filepath;
}

(async () => {
  const issues = [];
  const log = [];

  function addIssue(severity, description, screenshot) {
    issues.push({ severity, description, screenshot });
    console.log(`[ISSUE][${severity}] ${description}`);
  }

  const browser = await chromium.launch({ headless: true });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await mobileContext.newPage();

  // ── STEP 1: Login ──────────────────────────────────────────────────────────
  console.log('\n=== STEP 1: Login ===');
  await page.goto(`${BASE_URL}/login`);
  await sleep(2000);
  await shot(page, 'avail-01-login-page.png');

  await page.fill('input[type="text"], input[name="username"]', 'mehmet.yilmaz');
  await page.fill('input[type="password"]', '1234');
  await shot(page, 'avail-02-login-filled.png');

  await page.click('button[type="submit"]');
  await sleep(2500);
  await shot(page, 'avail-03-after-login.png');
  console.log(`After login URL: ${page.url()}`);
  log.push(`After login: ${page.url()}`);

  // ── STEP 2: Navigate to Availability Page ─────────────────────────────────
  console.log('\n=== STEP 2: Navigate to /portal/availability ===');
  await page.goto(`${BASE_URL}/portal/availability`);
  await sleep(2500);
  console.log(`Availability URL: ${page.url()}`);
  await shot(page, 'avail-04-availability-initial.png', true);

  if (!page.url().includes('/portal/availability')) {
    addIssue('CRITICAL', `Not on availability page — redirected to ${page.url()}`, 'avail-04-availability-initial.png');
  }

  // ── STEP 3: Document initial state ────────────────────────────────────────
  console.log('\n=== STEP 3: Document Initial State ===');

  const pageTitle = await page.$('h1');
  const titleText = pageTitle ? await pageTitle.innerText() : 'NOT FOUND';
  console.log(`Page title: "${titleText}"`);

  const weekLabel = await page.$('p[class*="text-slate-400"]');
  const weekLabelText = weekLabel ? await weekLabel.innerText() : 'NOT FOUND';
  console.log(`Week label: "${weekLabelText}"`);

  // Count day cards
  const dayCards = await page.$$('[class*="rounded-2xl"][class*="border-2"][class*="p-4"]');
  console.log(`Day cards found: ${dayCards.length} (expected 7)`);
  if (dayCards.length !== 7) {
    addIssue('HIGH', `Expected 7 day cards, found ${dayCards.length}`, 'avail-04-availability-initial.png');
  }

  // Count selects
  const selects = await page.$$('select');
  console.log(`Select dropdowns found: ${selects.length} (expected 28 — 7 days × 4 selects)`);
  if (selects.length !== 28) {
    addIssue('MEDIUM', `Expected 28 select elements (7 days × 4), found ${selects.length}`, 'avail-04-availability-initial.png');
  }

  // Check "Müsaitliği Gönder" button
  const sendBtn = await page.$('button:has-text("Müsaitliği Gönder")');
  console.log(`"Müsaitliği Gönder" button: ${sendBtn ? 'FOUND' : 'NOT FOUND'}`);
  if (!sendBtn) {
    addIssue('CRITICAL', '"Müsaitliği Gönder" button not found', 'avail-04-availability-initial.png');
  }

  // Check bottom nav bar exists and note it covers content
  const bottomNav = await page.$('nav[class*="fixed bottom"]');
  console.log(`Bottom nav bar: ${bottomNav ? 'PRESENT (may interfere with fixed bottom button)' : 'NOT FOUND'}`);

  // Check if submit button overlaps with nav bar
  if (sendBtn && bottomNav) {
    const btnBox = await sendBtn.boundingBox();
    const navBox = await bottomNav.boundingBox();
    if (btnBox && navBox) {
      console.log(`Submit btn: y=${btnBox.y}, height=${btnBox.height}`);
      console.log(`Nav bar: y=${navBox.y}, height=${navBox.height}`);
      const overlap = btnBox.y < navBox.y + navBox.height && btnBox.y + btnBox.height > navBox.y;
      console.log(`Button/nav overlap: ${overlap}`);
      if (overlap) {
        addIssue('HIGH', `"Müsaitliği Gönder" button (y=${Math.round(btnBox.y)}) overlaps with bottom navigation bar (y=${Math.round(navBox.y)}) — click may be intercepted`, 'avail-04-availability-initial.png');
      }
    }
  }

  // Check default select values for first day
  const allSelects = await page.$$('select');
  if (allSelects.length >= 4) {
    const startHour = await allSelects[0].evaluate(el => el.value);
    const startMin = await allSelects[1].evaluate(el => el.value);
    const endHour = await allSelects[2].evaluate(el => el.value);
    const endMin = await allSelects[3].evaluate(el => el.value);
    console.log(`Monday default: start=${startHour}:${startMin}, end=${endHour}:${endMin}`);
    log.push(`Monday default: start=${startHour}:${String(startMin).padStart(2,'0')}, end=${endHour}:${String(endMin).padStart(2,'0')}`);

    if (startHour !== '8') {
      addIssue('LOW', `Monday start hour default should be 8 (08:00), got ${startHour}`, 'avail-04-availability-initial.png');
    }
    if (endHour !== '22') {
      addIssue('LOW', `Monday end hour default should be 22 (22:00), got ${endHour}`, 'avail-04-availability-initial.png');
    }
  }

  // ── STEP 4: Interact — set Monday to Gelemem ──────────────────────────────
  console.log('\n=== STEP 4: Set Monday to Gelemem ===');
  const gelemBtns = await page.$$('button[title="Gelemem"]');
  console.log(`"Gelemem" buttons found: ${gelemBtns.length}`);
  if (gelemBtns.length > 0) {
    await gelemBtns[0].click();
    await sleep(500);
    await shot(page, 'avail-05-monday-gelemem.png');

    // Verify timeslider hidden
    const selectsAfter = await page.$$('select');
    console.log(`Selects after Monday→Gelemem: ${selectsAfter.length} (was 28, expected 24)`);
    if (selectsAfter.length >= 28) {
      addIssue('MEDIUM', `TimeSlider not hidden when day=Gelemem. Selects: ${selectsAfter.length} (should drop to 24)`, 'avail-05-monday-gelemem.png');
    }

    // Verify "Bu gün çalışmak mümkün değil" message appears
    const unavailMsg = await page.$('text=Bu gün çalışmak mümkün değil');
    console.log(`Unavailable message: ${unavailMsg ? 'VISIBLE' : 'NOT FOUND'}`);
    if (!unavailMsg) {
      addIssue('LOW', '"Bu gün çalışmak mümkün değil" message not appearing after Gelemem selection', 'avail-05-monday-gelemem.png');
    }
  } else {
    addIssue('HIGH', '"Gelemem" button not found', 'avail-04-availability-initial.png');
  }

  // ── STEP 5: Set Thursday to Tercih Etmiyorum ──────────────────────────────
  console.log('\n=== STEP 5: Set Thursday to Tercih Etmiyorum ===');
  const preferBtns = await page.$$('button[title="Tercih Etmiyorum"]');
  console.log(`"Tercih Etmiyorum" buttons found: ${preferBtns.length}`);
  if (preferBtns.length >= 4) {
    await preferBtns[3].click(); // Thursday = index 3
    await sleep(500);
    await shot(page, 'avail-06-thursday-preferred-not.png');
    console.log('Thursday set to Tercih Etmiyorum');
  }

  // ── STEP 6: Change hour dropdown for Wednesday ────────────────────────────
  console.log('\n=== STEP 6: Change Wednesday start hour ===');
  const allSelectsCurrent = await page.$$('select');
  console.log(`Current select count: ${allSelectsCurrent.length}`);

  // Monday is now Gelemem (no selects), so selects start from Tuesday
  // Each available day = 4 selects: start_h, start_m, end_h, end_m
  // Tuesday = selects 0-3, Wednesday = selects 4-7
  if (allSelectsCurrent.length >= 8) {
    const wedStartHour = allSelectsCurrent[4]; // Wednesday start hour (after Monday removed)
    const beforeVal = await wedStartHour.evaluate(el => el.value);
    console.log(`Wednesday start hour before: ${beforeVal}`);
    await wedStartHour.selectOption('10');
    await sleep(500);
    const afterVal = await wedStartHour.evaluate(el => el.value);
    console.log(`Wednesday start hour after: ${afterVal}`);

    if (afterVal !== '10') {
      addIssue('HIGH', `Hour select not updating. Selected "10", value is "${afterVal}"`, 'avail-06-thursday-preferred-not.png');
    } else {
      console.log('Hour select change: WORKING');
    }
    await shot(page, 'avail-07-hour-changed.png');
  }

  // Also test minute select
  if (allSelectsCurrent.length >= 6) {
    const wedStartMin = allSelectsCurrent[5]; // Wednesday start min
    const minBefore = await wedStartMin.evaluate(el => el.value);
    console.log(`Wednesday start minute before: ${minBefore}`);
    await wedStartMin.selectOption('30');
    await sleep(300);
    const minAfter = await wedStartMin.evaluate(el => el.value);
    console.log(`Wednesday start minute after: ${minAfter}`);
    if (minAfter !== '30') {
      addIssue('HIGH', `Minute select not updating. Selected "30", value is "${minAfter}"`, 'avail-07-hour-changed.png');
    }
  }

  // ── STEP 7: Full page screenshot after interactions ────────────────────────
  console.log('\n=== STEP 7: Full page after interactions ===');
  await shot(page, 'avail-08-full-page-interactions.png', true);

  // ── STEP 8: Click Submit Button ───────────────────────────────────────────
  console.log('\n=== STEP 8: Click "Müsaitliği Gönder" ===');
  const submitBtn = await page.$('button:has-text("Müsaitliği Gönder")');
  if (!submitBtn) {
    addIssue('CRITICAL', 'Submit button not found', 'avail-08-full-page-interactions.png');
  } else {
    const isVisible = await submitBtn.isVisible();
    const isEnabled = await submitBtn.isEnabled();
    const box = await submitBtn.boundingBox();
    console.log(`Submit button: visible=${isVisible}, enabled=${isEnabled}`);
    if (box) console.log(`Submit button position: x=${Math.round(box.x)}, y=${Math.round(box.y)}, w=${Math.round(box.width)}, h=${Math.round(box.height)}`);

    // Check if nav bar covers the button
    const nav = await page.$('nav[class*="fixed"]');
    if (nav) {
      const navBox = await nav.boundingBox();
      if (navBox && box) {
        console.log(`Nav bar position: x=${Math.round(navBox.x)}, y=${Math.round(navBox.y)}`);
        if (box.y + box.height > navBox.y) {
          addIssue('CRITICAL',
            `"Müsaitliği Gönder" button bottom (y=${Math.round(box.y + box.height)}) is behind bottom navigation bar (starts at y=${Math.round(navBox.y)}). ` +
            'Nav bar intercepts click events on this button — button is UNCLICKABLE via normal interaction.',
            'avail-08-full-page-interactions.png');
        }
      }
    }

    // Use JavaScript click to bypass nav bar interception
    console.log('Using JS click to bypass nav bar interception...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sendBtn = btns.find(b => b.textContent && b.textContent.includes('Müsaitliği Gönder'));
      if (sendBtn) sendBtn.click();
    });
    await sleep(1000);
    await shot(page, 'avail-09-confirm-modal.png');

    const modal = await page.$('[class*="fixed inset-0"]');
    const modalTitle = await page.$('text=Müsaitlik Onayı');
    console.log(`Modal appeared: ${!!(modal || modalTitle)}`);
    if (!modalTitle) {
      addIssue('HIGH', 'Confirmation modal did not appear after clicking submit', 'avail-09-confirm-modal.png');
    } else {
      console.log('Modal title "Müsaitlik Onayı" found');

      // Screenshot the modal
      await shot(page, 'avail-10-modal-detail.png');

      // Read modal content
      const modalSummaryItems = await page.$$('[class*="rounded-lg"][class*="px-2"]');
      console.log(`Modal summary items: ${modalSummaryItems.length}`);

      // Check if modal shows correct days
      const modalText = await page.evaluate(() => {
        const modal = document.querySelector('[class*="fixed inset-0"]');
        return modal ? modal.textContent : '';
      });
      console.log('Modal text excerpt:', modalText ? modalText.substring(0, 300) : 'empty');

      // Look for "Evet, Gönder" button
      const yesBtns = await page.$$('button:has-text("Evet, Gönder")');
      console.log(`"Evet, Gönder" buttons found: ${yesBtns.length}`);

      if (yesBtns.length === 0) {
        addIssue('CRITICAL', '"Evet, Gönder" button not found in modal', 'avail-10-modal-detail.png');
      } else {
        // ── STEP 9: Click "Evet, Gönder" ──────────────────────────────────
        console.log('\n=== STEP 9: Click "Evet, Gönder" ===');
        const yesBtn = yesBtns[0];
        const yesBox = await yesBtn.boundingBox();
        console.log(`"Evet, Gönder" position: ${yesBox ? `x=${Math.round(yesBox.x)}, y=${Math.round(yesBox.y)}` : 'NO BOX'}`);

        // Try normal click first
        try {
          await yesBtn.click({ timeout: 5000 });
        } catch (e) {
          console.log(`Normal click failed: ${e.message.substring(0, 100)}`);
          // Use JS click as fallback
          addIssue('HIGH', '"Evet, Gönder" click blocked — modal button intercepted by nav bar. Using JS click as workaround.', 'avail-10-modal-detail.png');
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const yes = btns.find(b => b.textContent && b.textContent.includes('Evet, Gönder'));
            if (yes) yes.click();
          });
        }

        await sleep(2500);
        await shot(page, 'avail-11-after-submit.png', true);
        console.log(`URL after submit: ${page.url()}`);

        // Check for success state
        const successBanner = await page.$('text=Müsaitlik gönderildi');
        console.log(`Success banner: ${successBanner ? 'VISIBLE' : 'NOT FOUND'}`);
        if (!successBanner) {
          addIssue('HIGH', '"Müsaitlik gönderildi" success banner not visible after submission', 'avail-11-after-submit.png');
        } else {
          console.log('SUCCESS: Availability submitted and confirmed');
        }

        // Check "Düzenlemek İçin Geri Al" button
        const editBtn = await page.$('button:has-text("Düzenlemek İçin Geri Al")');
        console.log(`"Düzenlemek İçin Geri Al" button: ${editBtn ? 'FOUND' : 'NOT FOUND'}`);
        if (!editBtn) {
          addIssue('MEDIUM', '"Düzenlemek İçin Geri Al" button not visible after submit', 'avail-11-after-submit.png');
        }

        // Check the form is disabled (opacity-60)
        const disabledWrapper = await page.$('[class*="opacity-60"]');
        console.log(`Form disabled visual: ${disabledWrapper ? 'YES (opacity-60 found)' : 'NO (opacity-60 missing)'}`);
        if (!disabledWrapper) {
          addIssue('LOW', 'Form not visually dimmed (opacity-60) after submission', 'avail-11-after-submit.png');
        }
      }
    }
  }

  // ── STEP 10: Desktop view ──────────────────────────────────────────────────
  console.log('\n=== STEP 10: Desktop view ===');
  await mobileContext.close();

  const deskContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const deskPage = await deskContext.newPage();

  // Login again for desktop context
  await deskPage.goto(`${BASE_URL}/login`);
  await sleep(1500);
  await deskPage.fill('input[type="text"], input[name="username"]', 'mehmet.yilmaz');
  await deskPage.fill('input[type="password"]', '1234');
  await deskPage.click('button[type="submit"]');
  await sleep(2500);
  await deskPage.goto(`${BASE_URL}/portal/availability`);
  await sleep(2000);
  await shot(deskPage, 'avail-12-desktop-initial.png', true);

  // Check desktop button visibility
  const desktopSubmitBtn = await deskPage.$('button:has-text("Müsaitliği Gönder")');
  const desktopNav = await deskPage.$('nav[class*="fixed"]');
  if (desktopSubmitBtn && desktopNav) {
    const dBtnBox = await desktopSubmitBtn.boundingBox();
    const dNavBox = await desktopNav.boundingBox();
    console.log(`Desktop submit btn: y=${dBtnBox ? Math.round(dBtnBox.y) : 'N/A'}`);
    console.log(`Desktop nav: y=${dNavBox ? Math.round(dNavBox.y) : 'N/A'}`);
    if (dBtnBox && dNavBox && dBtnBox.y + dBtnBox.height > dNavBox.y) {
      addIssue('HIGH', 'Desktop: Submit button still overlaps nav bar', 'avail-12-desktop-initial.png');
    }
  }

  await deskContext.close();

  // ── Write results ──────────────────────────────────────────────────────────
  const results = {
    timestamp: new Date().toISOString(),
    total_issues: issues.length,
    issues,
    log,
  };

  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'avail-qa-results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n=== QA SUMMARY ===');
  console.log(`Total issues: ${issues.length}`);
  const criticals = issues.filter(i => i.severity === 'CRITICAL');
  const highs = issues.filter(i => i.severity === 'HIGH');
  const mediums = issues.filter(i => i.severity === 'MEDIUM');
  const lows = issues.filter(i => i.severity === 'LOW');
  console.log(`  CRITICAL: ${criticals.length}`);
  console.log(`  HIGH: ${highs.length}`);
  console.log(`  MEDIUM: ${mediums.length}`);
  console.log(`  LOW: ${lows.length}`);
  issues.forEach((iss, i) => {
    console.log(`  ${i+1}. [${iss.severity}] ${iss.description}`);
  });

  await browser.close();
})();

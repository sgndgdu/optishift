const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = '/tmp/qa-deep-scan';

const CREDENTIALS = {
  manager: { email: 'mehmet.celik@bargrubu.com', password: 'test123' },
  employee: { email: 'ali.kara@bargrubu.com', password: 'test123' },
  supervisor: { email: 'patron@bargrubu.com', password: 'test123' },
};

const consoleErrors = [];
const networkErrors = [];
const issues = [];
let issueCount = 0;

function logIssue(page, priority, problem, steps, screenshotPath, fix) {
  issueCount++;
  issues.push({ id: issueCount, page, priority, problem, steps, screenshotPath, fix });
  console.log(`\nSOURN #${issueCount} — ${page} — ${priority}`);
  console.log(`Sorun: ${problem}`);
  console.log(`Kanıt: ${screenshotPath}`);
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function screenshotMobile(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}-mobile.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function loginAs(page, role) {
  const creds = CREDENTIALS[role];
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Fill email
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"], input[placeholder*="posta"]').first();
  await emailInput.fill(creds.email);

  // Fill password
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(creds.password);

  // Submit
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  console.log(`[Login ${role}] → ${currentUrl}`);
  return currentUrl;
}

async function setupConsoleTracking(page, context) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ context, url: page.url(), message: msg.text() });
    }
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      networkErrors.push({ context, url: response.url(), status });
    }
  });
}

async function setDesktop(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function setMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // ============================
  // LANDING PAGE
  // ============================
  console.log('\n=== LANDING PAGE ===');
  {
    const page = await browser.newPage();
    await setupConsoleTracking(page, 'landing');
    await setDesktop(page);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await screenshot(page, '00-landing-desktop');

    // Check for broken links
    const links = await page.$$eval('a[href]', els => els.map(e => ({ href: e.href, text: e.textContent?.trim() })));
    console.log(`Landing page links: ${links.length}`);

    // Mobile
    await setMobile(page);
    await page.reload({ waitUntil: 'networkidle' });
    await screenshotMobile(page, '00-landing');

    await page.close();
  }

  // ============================
  // LOGIN PAGE
  // ============================
  console.log('\n=== LOGIN PAGE ===');
  {
    const page = await browser.newPage();
    await setupConsoleTracking(page, 'login');
    await setDesktop(page);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await screenshot(page, '01-login-desktop');

    // Check label text
    const labels = await page.$$eval('label', els => els.map(e => e.textContent?.trim()));
    console.log('Login labels:', labels);

    // Check if email label says "E-posta"
    const hasEmailLabel = labels.some(l => l && l.includes('E-posta'));
    if (!hasEmailLabel) {
      logIssue('/login', 'DÜŞÜK', `Email label "E-posta" değil, labels: ${labels.join(', ')}`, 'Login sayfasını aç, label metnini incele', '01-login-desktop.png', 'Label text "E-posta" olarak güncelle');
    }

    // Test login
    const redirectUrl = await loginAs(page, 'manager');
    await screenshot(page, '01-login-after-manager');

    const expectedRedirect = redirectUrl.includes('dashboard');
    if (!expectedRedirect) {
      logIssue('/login', 'KRİTİK', `Manager login sonrası dashboard'a yönlendirmedi, gitti: ${redirectUrl}`, 'manager cred ile login ol', '01-login-after-manager.png', 'Role-based redirect düzelt');
    }

    // Mobile
    await setMobile(page);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await screenshotMobile(page, '01-login');

    await page.close();
  }

  // ============================
  // MANAGER PORTAL
  // ============================
  console.log('\n=== MANAGER PORTAL ===');
  const managerPage = await browser.newPage();
  await setupConsoleTracking(managerPage, 'manager');
  await setDesktop(managerPage);
  await loginAs(managerPage, 'manager');
  await managerPage.waitForTimeout(1000);

  // 1. DASHBOARD
  console.log('\n--- /dashboard ---');
  {
    await managerPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '02-dashboard-desktop');

    // Check KPI cards
    const kpiCards = await managerPage.$$('[class*="card"], [class*="stat"], [class*="kpi"]');
    console.log(`KPI card count: ${kpiCards.length}`);

    // Check for live ops
    const pageText = await managerPage.innerText('body');
    const hasLiveOps = pageText.includes('Canlı') || pageText.includes('vardiya') || pageText.includes('check');
    console.log(`Has live ops: ${hasLiveOps}`);

    // Check for pending requests
    const hasPendingRequests = pageText.includes('Talep') || pageText.includes('Bekl');
    console.log(`Has pending requests section: ${hasPendingRequests}`);

    // Check for empty states or loading spinners stuck
    const spinners = await managerPage.$$('[class*="spin"], [class*="loading"], [class*="skeleton"]');
    if (spinners.length > 0) {
      logIssue('/dashboard', 'ORTA', `${spinners.length} loading spinner hala aktif`, 'Dashboard aç, yüklenmeyi bekle', '02-dashboard-desktop.png', 'Loading state kontrolü ekle');
    }

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1000);
    await screenshotMobile(managerPage, '02-dashboard');
    await setDesktop(managerPage);
  }

  // 2. SCHEDULE
  console.log('\n--- /schedule ---');
  {
    await managerPage.goto(`${BASE_URL}/schedule`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(2000);
    await screenshot(managerPage, '03-schedule-desktop');

    // Check grid
    const gridRows = await managerPage.$$('tr, [class*="row"], [class*="grid-row"]');
    console.log(`Schedule grid rows: ${gridRows.length}`);

    // Check for "Kapasite Planı" collapsible
    const pageText = await managerPage.innerText('body');
    const hasKapasitePlan = pageText.includes('Kapasite') || pageText.includes('Kapasite Planı');
    console.log(`Has "Kapasite Planı": ${hasKapasitePlan}`);
    if (!hasKapasitePlan) {
      logIssue('/schedule', 'KRİTİK', '"Kapasite Planı" collapsible paneli bulunamadı', '/schedule sayfasını aç, Kapasite Planı ara', '03-schedule-desktop.png', 'Demand template panelini ekle');
    }

    // Try to click Kapasite Planı
    const kapasiteBtn = managerPage.locator('text=Kapasite').first();
    const kapasiteExists = await kapasiteBtn.count();
    if (kapasiteExists > 0) {
      await kapasiteBtn.click();
      await managerPage.waitForTimeout(500);
      await screenshot(managerPage, '03-schedule-kapasite-open');
    }

    // Check for "Otomatik Oluştur" button
    const autoGenBtn = managerPage.locator('text=Otomatik, text=Oluştur, button:has-text("Oluştur")').first();
    const autoGenCount = await managerPage.locator('button:has-text("Oluştur"), button:has-text("Otomatik")').count();
    console.log(`Auto-generate buttons: ${autoGenCount}`);

    // Try clicking auto-generate
    const genButton = managerPage.locator('button:has-text("Otomatik Oluştur"), button:has-text("Oluştur"), button:has-text("Vardiya Oluştur")').first();
    const genBtnCount = await genButton.count();
    if (genBtnCount > 0) {
      await genButton.click();
      await managerPage.waitForTimeout(3000);
      await screenshot(managerPage, '03-schedule-after-generate');
    } else {
      logIssue('/schedule', 'KRİTİK', '"Otomatik Oluştur" / vardiya oluşturma butonu bulunamadı', '/schedule git, butonu ara', '03-schedule-desktop.png', 'Generate button ekle');
    }

    // Check for "Taslak Kaydet" button
    const draftCount = await managerPage.locator('button:has-text("Taslak"), button:has-text("Kaydet")').count();
    console.log(`Draft save buttons: ${draftCount}`);

    // Try clicking a grid cell
    const gridCells = await managerPage.$$('td[class*="cell"], td[class*="shift"], [class*="grid-cell"]');
    if (gridCells.length > 0) {
      await gridCells[0].click();
      await managerPage.waitForTimeout(500);
      await screenshot(managerPage, '03-schedule-cell-click');
    }

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/schedule`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1000);
    await screenshotMobile(managerPage, '03-schedule');
    await setDesktop(managerPage);
  }

  // 3. PERSONNEL
  console.log('\n--- /personnel ---');
  {
    await managerPage.goto(`${BASE_URL}/personnel`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '04-personnel-desktop');

    // Check for personnel list
    const personnelItems = await managerPage.$$('[class*="card"], tr[class*="row"], [class*="personnel"]');
    console.log(`Personnel items: ${personnelItems.length}`);

    const pageText = await managerPage.innerText('body');

    // Check for "Personel Ekle" button
    const addBtn = managerPage.locator('button:has-text("Personel Ekle"), button:has-text("Ekle"), button:has-text("Yeni")').first();
    const addBtnCount = await addBtn.count();
    if (addBtnCount > 0) {
      await addBtn.click();
      await managerPage.waitForTimeout(500);
      await screenshot(managerPage, '04-personnel-add-modal');
      // Close modal
      const closeBtn = managerPage.locator('button:has-text("İptal"), button:has-text("Kapat"), [data-dismiss]').first();
      if (await closeBtn.count() > 0) await closeBtn.click();
      await managerPage.keyboard.press('Escape');
    } else {
      logIssue('/personnel', 'ORTA', '"Personel Ekle" butonu bulunamadı', '/personnel git, ekle butonunu ara', '04-personnel-desktop.png', 'Personel ekleme butonu ekle');
    }

    // Check search
    const searchInput = managerPage.locator('input[placeholder*="ara"], input[placeholder*="Ara"], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('Ali');
      await managerPage.waitForTimeout(500);
      await screenshot(managerPage, '04-personnel-search');
      await searchInput.clear();
    }

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/personnel`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1000);
    await screenshotMobile(managerPage, '04-personnel');
    await setDesktop(managerPage);
  }

  // 4. REQUESTS
  console.log('\n--- /requests ---');
  {
    await managerPage.goto(`${BASE_URL}/requests`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '05-requests-desktop');

    const pageText = await managerPage.innerText('body');
    const hasList = pageText.length > 100;
    console.log(`Requests page has content: ${hasList}`);

    // Check for approve/reject buttons
    const approveBtn = await managerPage.$$('button:has-text("Onayla"), button:has-text("Kabul"), button:has-text("Onay")');
    const rejectBtn = await managerPage.$$('button:has-text("Reddet"), button:has-text("Red")');
    console.log(`Approve buttons: ${approveBtn.length}, Reject buttons: ${rejectBtn.length}`);

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/requests`, { waitUntil: 'networkidle' });
    await screenshotMobile(managerPage, '05-requests');
    await setDesktop(managerPage);
  }

  // 5. OPEN SHIFTS
  console.log('\n--- /open-shifts ---');
  {
    await managerPage.goto(`${BASE_URL}/open-shifts`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '06-open-shifts-desktop');

    const pageText = await managerPage.innerText('body');
    const hasContent = pageText.trim().length > 50;
    console.log(`Open shifts has content: ${hasContent}`);

    // Check empty state
    const hasEmptyState = pageText.includes('Açık vardiya yok') || pageText.includes('boş') || pageText.includes('henüz');
    console.log(`Has empty state: ${hasEmptyState}`);

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/open-shifts`, { waitUntil: 'networkidle' });
    await screenshotMobile(managerPage, '06-open-shifts');
    await setDesktop(managerPage);
  }

  // 6. BREAKS
  console.log('\n--- /breaks ---');
  {
    await managerPage.goto(`${BASE_URL}/breaks`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '07-breaks-desktop');

    const pageText = await managerPage.innerText('body');
    console.log(`Breaks page text length: ${pageText.trim().length}`);

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/breaks`, { waitUntil: 'networkidle' });
    await screenshotMobile(managerPage, '07-breaks');
    await setDesktop(managerPage);
  }

  // 7. FAIRNESS
  console.log('\n--- /fairness ---');
  {
    await managerPage.goto(`${BASE_URL}/fairness`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(2000);
    await screenshot(managerPage, '08-fairness-desktop');

    // Check for chart
    const chart = await managerPage.$$('canvas, svg[class*="chart"], [class*="recharts"], [class*="chart"]');
    console.log(`Chart elements: ${chart.length}`);

    const pageText = await managerPage.innerText('body');
    const hasScores = pageText.includes('puan') || pageText.includes('Puan') || pageText.includes('score');
    console.log(`Has fairness scores: ${hasScores}`);

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/fairness`, { waitUntil: 'networkidle' });
    await screenshotMobile(managerPage, '08-fairness');
    await setDesktop(managerPage);
  }

  // 8. SETTINGS
  console.log('\n--- /settings ---');
  {
    await managerPage.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '09-settings-desktop');

    // Check 4 tabs
    const tabs = await managerPage.$$('[role="tab"], button[class*="tab"], [class*="tab-trigger"]');
    console.log(`Settings tabs: ${tabs.length}`);

    const pageText = await managerPage.innerText('body');
    const tabNames = ['Çalışma Saatleri', 'Vardiya Şablonları', 'Vardiya Ağırlıkları', 'Bölgeler'];
    for (const tabName of tabNames) {
      if (!pageText.includes(tabName)) {
        logIssue('/settings', 'ORTA', `"${tabName}" sekmesi bulunamadı`, '/settings git, sekmeleri kontrol et', '09-settings-desktop.png', 'Sekme ekle');
      }
    }

    // Click each tab
    for (let i = 0; i < tabs.length && i < 4; i++) {
      try {
        await tabs[i].click();
        await managerPage.waitForTimeout(500);
        await screenshot(managerPage, `09-settings-tab-${i}`);
      } catch(e) {
        console.log(`Tab ${i} click error: ${e.message}`);
      }
    }

    // Try to find add shift definition form
    const addShiftBtn = managerPage.locator('button:has-text("Ekle"), button:has-text("Yeni Vardiya"), button:has-text("Vardiya Ekle")').first();
    if (await addShiftBtn.count() > 0) {
      await addShiftBtn.click();
      await managerPage.waitForTimeout(500);
      await screenshot(managerPage, '09-settings-add-shift');
    }

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    await screenshotMobile(managerPage, '09-settings');
    await setDesktop(managerPage);
  }

  // 9. INTEGRATIONS
  console.log('\n--- /integrations ---');
  {
    await managerPage.goto(`${BASE_URL}/integrations`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '10-integrations-desktop');

    const pageText = await managerPage.innerText('body');
    const hasSAP = pageText.includes('SAP');
    const hasNebim = pageText.includes('Nebim');
    console.log(`Has SAP: ${hasSAP}, Has Nebim: ${hasNebim}`);

    // Check connect buttons
    const connectBtns = await managerPage.$$('button:has-text("Bağlan"), button:has-text("Connect"), button:has-text("Entegre")');
    console.log(`Connect buttons: ${connectBtns.length}`);

    if (connectBtns.length > 0) {
      await connectBtns[0].click();
      await managerPage.waitForTimeout(500);
      await screenshot(managerPage, '10-integrations-connect-click');
    }

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/integrations`, { waitUntil: 'networkidle' });
    await screenshotMobile(managerPage, '10-integrations');
    await setDesktop(managerPage);
  }

  // 10. CHAT
  console.log('\n--- /chat ---');
  {
    await managerPage.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle' });
    await managerPage.waitForTimeout(1500);
    await screenshot(managerPage, '11-chat-desktop');

    const pageText = await managerPage.innerText('body');
    const hasMessageInput = await managerPage.$('input[placeholder*="mesaj"], textarea[placeholder*="mesaj"], input[placeholder*="Mesaj"]');
    console.log(`Has message input: ${!!hasMessageInput}`);

    // Mobile
    await setMobile(managerPage);
    await managerPage.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle' });
    await screenshotMobile(managerPage, '11-chat');
    await setDesktop(managerPage);
  }

  await managerPage.close();

  // ============================
  // EMPLOYEE PORTAL
  // ============================
  console.log('\n=== EMPLOYEE PORTAL ===');
  const employeePage = await browser.newPage();
  await setupConsoleTracking(employeePage, 'employee');
  await setDesktop(employeePage);
  await loginAs(employeePage, 'employee');
  await employeePage.waitForTimeout(1000);

  // 11. /portal
  console.log('\n--- /portal ---');
  {
    await employeePage.goto(`${BASE_URL}/portal`, { waitUntil: 'networkidle' });
    await employeePage.waitForTimeout(1500);
    await screenshot(employeePage, '12-portal-desktop');

    const pageText = await employeePage.innerText('body');

    // Check for next shift card
    const hasShiftCard = pageText.includes('vardiya') || pageText.includes('Vardiya');
    console.log(`Has shift card: ${hasShiftCard}`);

    // Check for empty state
    const hasEmptyState = pageText.includes('vardiya yok') || pageText.includes('Bu hafta');
    console.log(`Has empty state: ${hasEmptyState}`);

    // Check stats
    const hasStats = pageText.includes('Adalet') || pageText.includes('Puan') || pageText.includes('Saat');
    console.log(`Has stats: ${hasStats}`);

    // Mobile
    await setMobile(employeePage);
    await employeePage.goto(`${BASE_URL}/portal`, { waitUntil: 'networkidle' });
    await employeePage.waitForTimeout(1000);
    await screenshotMobile(employeePage, '12-portal');
    await setDesktop(employeePage);
  }

  // 12. /portal/calendar
  console.log('\n--- /portal/calendar ---');
  {
    await employeePage.goto(`${BASE_URL}/portal/calendar`, { waitUntil: 'networkidle' });
    await employeePage.waitForTimeout(1500);
    await screenshot(employeePage, '13-portal-calendar-desktop');

    const pageText = await employeePage.innerText('body');
    const hasCalendar = pageText.includes('Pzt') || pageText.includes('Sal') || pageText.includes('Çar') || pageText.includes('Haf');
    console.log(`Has calendar: ${hasCalendar}`);

    // Mobile
    await setMobile(employeePage);
    await employeePage.goto(`${BASE_URL}/portal/calendar`, { waitUntil: 'networkidle' });
    await screenshotMobile(employeePage, '13-portal-calendar');
    await setDesktop(employeePage);
  }

  // 13. /portal/availability
  console.log('\n--- /portal/availability ---');
  {
    await employeePage.goto(`${BASE_URL}/portal/availability`, { waitUntil: 'networkidle' });
    await employeePage.waitForTimeout(1500);
    await screenshot(employeePage, '14-portal-availability-desktop');

    const pageText = await employeePage.innerText('body');

    // Check 7-day cards
    const dayCards = await employeePage.$$('[class*="day"], [class*="card"]');
    console.log(`Day cards found: ${dayCards.length}`);

    // Check color selection (green/yellow/red)
    const colorBtns = await employeePage.$$('[class*="green"], [class*="yellow"], [class*="red"], button[data-color]');
    console.log(`Color buttons: ${colorBtns.length}`);

    // Try to click a color button
    const availBtns = await employeePage.$$('button:has-text("Müsait"), button:has-text("Gelebilirim"), button:has-text("Gelemem"), button:has-text("Tercih")');
    console.log(`Availability option buttons: ${availBtns.length}`);

    // Check for "Müsaitliği Gönder" button
    const submitBtn = employeePage.locator('button:has-text("Gönder"), button:has-text("Müsaitliği Gönder"), button:has-text("Kaydet")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await employeePage.waitForTimeout(500);
      await screenshot(employeePage, '14-portal-availability-modal');
      // Close
      await employeePage.keyboard.press('Escape');
    }

    // Mobile
    await setMobile(employeePage);
    await employeePage.goto(`${BASE_URL}/portal/availability`, { waitUntil: 'networkidle' });
    await screenshotMobile(employeePage, '14-portal-availability');
    await setDesktop(employeePage);
  }

  // 14. /portal/requests
  console.log('\n--- /portal/requests ---');
  {
    await employeePage.goto(`${BASE_URL}/portal/requests`, { waitUntil: 'networkidle' });
    await employeePage.waitForTimeout(1500);
    await screenshot(employeePage, '15-portal-requests-desktop');

    const pageText = await employeePage.innerText('body');

    // Check tabs
    const hasSent = pageText.includes('Gönderdiğim') || pageText.includes('Gönder');
    const hasReceived = pageText.includes('Gelen');
    const hasNew = pageText.includes('Yeni Talep') || pageText.includes('Yeni');
    console.log(`Has sent tab: ${hasSent}, received: ${hasReceived}, new: ${hasNew}`);

    if (!hasSent || !hasNew) {
      logIssue('/portal/requests', 'ORTA', `Sekmeler eksik: Gönderdiğim=${hasSent}, Gelen=${hasReceived}, Yeni Talep=${hasNew}`, '/portal/requests git', '15-portal-requests-desktop.png', 'Sekmeleri ekle');
    }

    // Click "Yeni Talep" tab
    const newRequestTab = employeePage.locator('[role="tab"]:has-text("Yeni"), button:has-text("Yeni Talep")').first();
    if (await newRequestTab.count() > 0) {
      await newRequestTab.click();
      await employeePage.waitForTimeout(500);
      await screenshot(employeePage, '15-portal-requests-new-tab');
    }

    // Mobile
    await setMobile(employeePage);
    await employeePage.goto(`${BASE_URL}/portal/requests`, { waitUntil: 'networkidle' });
    await screenshotMobile(employeePage, '15-portal-requests');
    await setDesktop(employeePage);
  }

  // 15. /portal/notifications
  console.log('\n--- /portal/notifications ---');
  {
    await employeePage.goto(`${BASE_URL}/portal/notifications`, { waitUntil: 'networkidle' });
    await employeePage.waitForTimeout(1500);
    await screenshot(employeePage, '16-portal-notifications-desktop');

    const pageText = await employeePage.innerText('body');

    // Check for realistic timestamps
    const hasRealisticTimestamps = pageText.includes('önce') || pageText.includes('Az önce') || pageText.includes('dakika');
    const hasBrokenTimestamps = pageText.includes('Invalid') || pageText.includes('NaN') || pageText.includes('undefined');
    console.log(`Has realistic timestamps: ${hasRealisticTimestamps}`);
    console.log(`Has broken timestamps: ${hasBrokenTimestamps}`);

    if (hasBrokenTimestamps) {
      logIssue('/portal/notifications', 'ORTA', 'Bildirim timestamp değerleri bozuk (Invalid/NaN gösteriyor)', '/portal/notifications git', '16-portal-notifications-desktop.png', 'Date formatting düzelt');
    }

    // Mobile
    await setMobile(employeePage);
    await employeePage.goto(`${BASE_URL}/portal/notifications`, { waitUntil: 'networkidle' });
    await screenshotMobile(employeePage, '16-portal-notifications');
    await setDesktop(employeePage);
  }

  // 16. /portal/chat
  console.log('\n--- /portal/chat ---');
  {
    await employeePage.goto(`${BASE_URL}/portal/chat`, { waitUntil: 'networkidle' });
    await employeePage.waitForTimeout(1500);
    await screenshot(employeePage, '17-portal-chat-desktop');

    const hasMessageInput = await employeePage.$('input[placeholder*="mesaj"], textarea[placeholder*="mesaj"], input[placeholder*="Yaz"], textarea');
    console.log(`Has message input: ${!!hasMessageInput}`);

    // Mobile
    await setMobile(employeePage);
    await employeePage.goto(`${BASE_URL}/portal/chat`, { waitUntil: 'networkidle' });
    await screenshotMobile(employeePage, '17-portal-chat');
    await setDesktop(employeePage);
  }

  await employeePage.close();

  // ============================
  // SUPERVISOR PORTAL
  // ============================
  console.log('\n=== SUPERVISOR PORTAL ===');
  const supervisorPage = await browser.newPage();
  await setupConsoleTracking(supervisorPage, 'supervisor');
  await setDesktop(supervisorPage);
  await loginAs(supervisorPage, 'supervisor');
  await supervisorPage.waitForTimeout(1000);

  // 17. /supervisor
  console.log('\n--- /supervisor ---');
  {
    await supervisorPage.goto(`${BASE_URL}/supervisor`, { waitUntil: 'networkidle' });
    await supervisorPage.waitForTimeout(1500);
    await screenshot(supervisorPage, '18-supervisor-desktop');

    const pageText = await supervisorPage.innerText('body');
    const hasBranchCards = pageText.includes('Bar') || pageText.includes('şube') || pageText.includes('Şube') || pageText.includes('Grubu');
    console.log(`Has branch cards: ${hasBranchCards}`);

    // Mobile
    await setMobile(supervisorPage);
    await supervisorPage.goto(`${BASE_URL}/supervisor`, { waitUntil: 'networkidle' });
    await screenshotMobile(supervisorPage, '18-supervisor');
    await setDesktop(supervisorPage);
  }

  // 18. /supervisor/schedule
  console.log('\n--- /supervisor/schedule ---');
  {
    await supervisorPage.goto(`${BASE_URL}/supervisor/schedule`, { waitUntil: 'networkidle' });
    await supervisorPage.waitForTimeout(1500);
    await screenshot(supervisorPage, '19-supervisor-schedule-desktop');

    // Mobile
    await setMobile(supervisorPage);
    await supervisorPage.goto(`${BASE_URL}/supervisor/schedule`, { waitUntil: 'networkidle' });
    await screenshotMobile(supervisorPage, '19-supervisor-schedule');
    await setDesktop(supervisorPage);
  }

  await supervisorPage.close();

  // ============================
  // SAVE RESULTS
  // ============================
  const results = {
    totalIssues: issues.length,
    issues,
    consoleErrors: consoleErrors.slice(0, 50),
    networkErrors: networkErrors.slice(0, 50),
  };

  fs.writeFileSync('/tmp/qa-deep-scan/results.json', JSON.stringify(results, null, 2));

  console.log('\n\n=== QA SCAN COMPLETE ===');
  console.log(`Total issues found: ${issues.length}`);
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`Network errors: ${networkErrors.length}`);

  await browser.close();
}

run().catch(err => {
  console.error('SCAN FAILED:', err);
  process.exit(1);
});

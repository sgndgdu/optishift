const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/sefagundogdu/Desktop/OptiShift/web/public/qa-screenshots';
const BASE_URL = 'http://localhost:3000';
const MANAGER_EMAIL = 'mehmet.celik@bargrubu.com';
const MANAGER_PASS = 'test123';
const EMPLOYEE_EMAIL = 'ali.kara@bargrubu.com';
const EMPLOYEE_PASS = 'test123';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const issues = [];
let issueCount = 0;

function addIssue(pageName, severity, description, screenshotPath, extra = '') {
  issueCount++;
  const issue = { id: issueCount, page: pageName, severity, description, screenshotPath, extra };
  issues.push(issue);
  console.log(`\nSOURUN #${issueCount} — ${pageName} — [${severity.toUpperCase()}]`);
  console.log(`  Açıklama: ${description}`);
  if (screenshotPath) console.log(`  Kanıt: ${screenshotPath}`);
  if (extra) console.log(`  Detay: ${extra.substring(0, 200)}`);
  return issue;
}

async function doLogin(page, email, pass) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // Login form uses type="text" for email field based on HTML inspection
  const textInputs = await page.$$('input[type="text"]');
  const passInput = await page.$('input[type="password"]');

  if (textInputs.length > 0) {
    await textInputs[0].fill(email);
  } else {
    // Fallback to any input
    const anyInput = await page.$('input');
    if (anyInput) await anyInput.fill(email);
  }

  if (passInput) {
    await passInput.fill(pass);
  }

  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(3000);
  // Wait for navigation away from login
  try {
    await page.waitForURL(url => !url.includes('/login'), { timeout: 8000 });
  } catch (e) {
    // might have already navigated or failed
  }
  await page.waitForTimeout(1500);
  return page.url();
}

async function testPage(page, url, pageName, screenshotBase) {
  const consoleErrors = [];
  const networkErrors = [];

  const ch = msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); };
  const rh = r => { if (r.status() >= 400 && !r.url().includes('favicon') && !r.url().includes('_next')) networkErrors.push(`${r.status()} ${r.url()}`); };

  page.on('console', ch);
  page.on('response', rh);

  try {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.log(`  Navigate timeout for ${url} — continuing`);
  }
  await page.waitForTimeout(2500);

  // Desktop screenshot (1280x800)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  const desktopPath = path.join(SCREENSHOTS_DIR, `${screenshotBase}-desktop.png`);
  await page.screenshot({ path: desktopPath, fullPage: true });

  const currentUrl = page.url();

  // Was redirected to login? (auth failure)
  if (currentUrl.includes('/login')) {
    addIssue(pageName, 'kritik', `Sayfaya erişim için auth redirect oldu — oturum kaybedilmiş`, desktopPath, `URL: ${currentUrl}`);
    page.removeListener('console', ch);
    page.removeListener('response', rh);
    return { desktopPath, mobilePath: null, redirectedToLogin: true };
  }

  // Body text check
  const bodyText = await page.evaluate(() => document.body.innerText.trim()).catch(() => '');

  // Empty page check
  if (bodyText.length < 80) {
    addIssue(pageName, 'kritik', 'Sayfa içeriği çok az / boş görünüyor', desktopPath, `İçerik: "${bodyText.substring(0, 100)}"`);
  }

  // 404 check
  if (bodyText.includes('404') && bodyText.includes('not found')) {
    addIssue(pageName, 'kritik', '404 — Sayfa bulunamadı', desktopPath);
  }

  // Spinner stuck
  const spinnerVisible = await page.evaluate(() => {
    const animating = document.querySelector('.animate-spin, [class*="spinner"], [class*="Spinner"]');
    return !!animating;
  }).catch(() => false);
  if (spinnerVisible) {
    addIssue(pageName, 'orta', 'Spinner / loading göstergesi takılı kalmış olabilir', desktopPath);
  }

  // Overflow detection
  const overflowInfo = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const docWidth = Math.max(body.scrollWidth, html.scrollWidth, body.offsetWidth, html.offsetWidth, body.clientWidth, html.clientWidth);
    const viewWidth = window.innerWidth;
    if (docWidth > viewWidth + 5) {
      return { hasOverflow: true, docWidth, viewWidth };
    }
    return { hasOverflow: false };
  }).catch(() => ({ hasOverflow: false }));

  if (overflowInfo.hasOverflow) {
    addIssue(pageName, 'orta', `Yatay overflow var: döküman genişliği ${overflowInfo.docWidth}px, viewport ${overflowInfo.viewWidth}px`, desktopPath);
  }

  // Console errors (filter noise)
  const realErrors = consoleErrors.filter(e =>
    !e.includes('Failed to load resource') &&
    !e.includes('net::ERR') &&
    !e.includes('favicon') &&
    !e.includes('webpack') &&
    !e.includes('HMR')
  );
  if (realErrors.length > 0) {
    addIssue(pageName, 'orta', `Console hatası (${realErrors.length} adet)`, desktopPath, realErrors.slice(0, 2).join(' | '));
  }

  // Network API errors (only /api/ routes)
  const apiErrors = networkErrors.filter(e => e.includes('/api/'));
  if (apiErrors.length > 0) {
    addIssue(pageName, 'kritik', `API isteği ${apiErrors.length} hata döndürdü`, desktopPath, apiErrors.slice(0, 3).join(' | '));
  }

  // undefined/null text visible
  const hasUndefined = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('undefined') || text.includes('NaN') || (text.includes('null') && !text.match(/style|class|href/));
  }).catch(() => false);
  if (hasUndefined) {
    addIssue(pageName, 'orta', 'Sayfada "undefined" / "NaN" metni görünüyor', desktopPath);
  }

  // Mobile screenshot (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  const mobilePath = path.join(SCREENSHOTS_DIR, `${screenshotBase}-mobile.png`);
  await page.screenshot({ path: mobilePath, fullPage: true });

  // Mobile overflow
  const mobileOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
  }).catch(() => false);
  if (mobileOverflow) {
    addIssue(pageName + ' (mobil)', 'orta', 'Mobil görünümde yatay overflow/scroll var', mobilePath);
  }

  // Reset viewport
  await page.setViewportSize({ width: 1280, height: 800 });

  page.removeListener('console', ch);
  page.removeListener('response', rh);

  console.log(`  Desktop: ${desktopPath}`);
  console.log(`  Mobile:  ${mobilePath}`);

  return { desktopPath, mobilePath, bodyText, consoleErrors: realErrors, networkErrors: apiErrors };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  console.log('=== OptiShift QA Audit v2 Başlıyor ===');
  console.log(`Screenshots: ${SCREENSHOTS_DIR}\n`);

  // ============ STEP 1: Test login page ============
  console.log('--- LOGIN SAYFASI ---');
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const loginTestPage = await loginCtx.newPage();

  await loginTestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await loginTestPage.waitForTimeout(2000);

  const loginPath = path.join(SCREENSHOTS_DIR, 'login-desktop.png');
  await loginTestPage.screenshot({ path: loginPath, fullPage: true });
  console.log(`  Login desktop: ${loginPath}`);

  // Mobile login
  await loginTestPage.setViewportSize({ width: 390, height: 844 });
  await loginTestPage.waitForTimeout(500);
  const loginMobilePath = path.join(SCREENSHOTS_DIR, 'login-mobile.png');
  await loginTestPage.screenshot({ path: loginMobilePath, fullPage: true });

  // Check form fields
  const textInput = await loginTestPage.$('input[type="text"]');
  const passInput = await loginTestPage.$('input[type="password"]');
  const submitBtn = await loginTestPage.$('button[type="submit"]');
  if (!textInput) addIssue('/login', 'orta', 'Email/username input alanı type="email" değil type="text" — accessibility sorunu', loginPath);
  if (!passInput) addIssue('/login', 'kritik', 'Şifre input alanı bulunamadı', loginPath);
  if (!submitBtn) addIssue('/login', 'kritik', 'Submit butonu bulunamadı', loginPath);

  await loginTestPage.setViewportSize({ width: 1280, height: 800 });
  await loginCtx.close();

  // ============ STEP 2: Manager portal ============
  console.log('\n--- MÜDÜR PORTALI (manager login) ---');
  const managerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const managerPage = await managerCtx.newPage();

  const managerUrl = await doLogin(managerPage, MANAGER_EMAIL, MANAGER_PASS);
  console.log(`Manager login sonrası URL: ${managerUrl}`);

  const afterManagerLoginPath = path.join(SCREENSHOTS_DIR, 'login-after-manager.png');
  await managerPage.screenshot({ path: afterManagerLoginPath, fullPage: true });

  if (managerUrl.includes('/login')) {
    addIssue('/login', 'kritik', `Müdür girişi başarısız — ${MANAGER_EMAIL} ile giriş yapılamadı`, afterManagerLoginPath);
  } else {
    console.log(`  Müdür girişi basarili -> ${managerUrl}`);
  }

  // Manager pages
  const managerPages = [
    { url: '/dashboard', name: '/dashboard (Müdür)', base: 'manager-dashboard' },
    { url: '/schedule', name: '/schedule (Müdür)', base: 'manager-schedule' },
    { url: '/personnel', name: '/personnel (Müdür)', base: 'manager-personnel' },
    { url: '/requests', name: '/requests (Müdür)', base: 'manager-requests' },
    { url: '/open-shifts', name: '/open-shifts (Müdür)', base: 'manager-open-shifts' },
    { url: '/breaks', name: '/breaks (Müdür)', base: 'manager-breaks' },
    { url: '/fairness', name: '/fairness (Müdür)', base: 'manager-fairness' },
    { url: '/settings', name: '/settings (Müdür)', base: 'manager-settings' },
    { url: '/integrations', name: '/integrations (Müdür)', base: 'manager-integrations' },
    { url: '/chat', name: '/chat (Müdür)', base: 'manager-chat' },
  ];

  for (const p of managerPages) {
    console.log(`\n--- ${p.name} ---`);
    await testPage(managerPage, p.url, p.name, p.base);
  }

  // Extra: schedule specific checks
  console.log('\n--- Schedule sayfası detay kontrolleri ---');
  await managerPage.goto(`${BASE_URL}/schedule`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await managerPage.waitForTimeout(3000);

  const hasOrToolsButton = await managerPage.isVisible('button:has-text("Oluştur"), button:has-text("OR-Tools"), button:has-text("Otomatik"), button:has-text("Yayınla"), button:has-text("Taslak")').catch(() => false);
  const schedulePath = path.join(SCREENSHOTS_DIR, 'manager-schedule-detail.png');
  await managerPage.screenshot({ path: schedulePath, fullPage: true });
  console.log(`  Schedule detail: ${schedulePath}`);
  if (!hasOrToolsButton) {
    addIssue('/schedule (Müdür)', 'orta', 'Schedule aksiyon butonları (Oluştur/Yayınla/Taslak) görünmüyor', schedulePath);
  }

  // Check for demand matrix / capacity panel
  const hasDemandMatrix = await managerPage.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('Kapasite') || text.includes('Talep') || text.includes('Matris') || text.includes('kapasite');
  }).catch(() => false);
  if (!hasDemandMatrix) {
    addIssue('/schedule (Müdür)', 'orta', 'Kapasite Matrisi paneli (T1-A özelliği) görünmüyor veya mevcut değil', schedulePath);
  }

  // Extra: dashboard live stats check
  console.log('\n--- Dashboard canlı istatistik kontrolü ---');
  await managerPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await managerPage.waitForTimeout(2000);

  const dashDetailPath = path.join(SCREENSHOTS_DIR, 'manager-dashboard-detail.png');
  await managerPage.screenshot({ path: dashDetailPath, fullPage: true });

  // Check for stat cards
  const hasStats = await managerPage.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('Beklenen') || text.includes('Geldi') || text.includes('Molada') || text.includes('check-in') || text.includes('aktif');
  }).catch(() => false);
  if (!hasStats) {
    addIssue('/dashboard (Müdür)', 'düşük', 'Canlı operasyon istatistikleri (check-in/beklenen/molada) görünmüyor', dashDetailPath);
  }

  await managerCtx.close();

  // ============ STEP 3: Employee portal ============
  console.log('\n\n--- PERSONEL PORTALI (employee login) ---');
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const empPage = await empCtx.newPage();

  const empUrl = await doLogin(empPage, EMPLOYEE_EMAIL, EMPLOYEE_PASS);
  console.log(`Employee login sonrası URL: ${empUrl}`);

  const afterEmpLoginPath = path.join(SCREENSHOTS_DIR, 'login-after-employee.png');
  await empPage.screenshot({ path: afterEmpLoginPath, fullPage: true });

  if (empUrl.includes('/login')) {
    addIssue('/login', 'kritik', `Personel girişi başarısız — ${EMPLOYEE_EMAIL} ile giriş yapılamadı`, afterEmpLoginPath);
  } else {
    console.log(`  Personel girişi basarili -> ${empUrl}`);
  }

  const employeePages = [
    { url: '/portal', name: '/portal (Personel Ana)', base: 'emp-portal-home' },
    { url: '/portal/calendar', name: '/portal/calendar', base: 'emp-portal-calendar' },
    { url: '/portal/availability', name: '/portal/availability', base: 'emp-portal-availability' },
    { url: '/portal/requests', name: '/portal/requests', base: 'emp-portal-requests' },
    { url: '/portal/notifications', name: '/portal/notifications', base: 'emp-portal-notifications' },
    { url: '/portal/chat', name: '/portal/chat', base: 'emp-portal-chat' },
  ];

  for (const p of employeePages) {
    console.log(`\n--- ${p.name} ---`);
    await testPage(empPage, p.url, p.name, p.base);
  }

  // Extra: Availability page color check
  console.log('\n--- Availability renk seçici kontrolü ---');
  await empPage.goto(`${BASE_URL}/portal/availability`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await empPage.waitForTimeout(2000);

  const availDetailPath = path.join(SCREENSHOTS_DIR, 'emp-availability-detail.png');
  await empPage.screenshot({ path: availDetailPath, fullPage: true });

  const hasColorPicker = await empPage.evaluate(() => {
    const text = document.body.innerText;
    // Look for 3-color availability system
    return text.includes('Müsait') || text.includes('Tercih') || text.includes('Gelemem') || text.includes('yeşil') || text.includes('sarı') || text.includes('kırmızı');
  }).catch(() => false);
  if (!hasColorPicker) {
    addIssue('/portal/availability', 'orta', '3 renkli müsaitlik seçici (Yeşil/Sarı/Kırmızı) görünmüyor ya da eksik', availDetailPath);
  }

  // Check requests page (employee)
  console.log('\n--- Employee requests sayfası kontrolü ---');
  await empPage.goto(`${BASE_URL}/portal/requests`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await empPage.waitForTimeout(2000);

  const empReqDetailPath = path.join(SCREENSHOTS_DIR, 'emp-requests-detail.png');
  await empPage.screenshot({ path: empReqDetailPath, fullPage: true });

  const hasRealRequests = await empPage.evaluate(() => {
    const text = document.body.innerText;
    // Detect if it's still mock UI
    return !text.includes('demo') && !text.includes('örnek') && (text.includes('Talep') || text.includes('İzin') || text.includes('Swap'));
  }).catch(() => false);

  await empCtx.close();

  // ============ REPORT ============
  await browser.close();

  console.log('\n\n===========================================');
  console.log('QA AUDIT TAMAMLANDI');
  console.log('===========================================');

  const kritikIssues = issues.filter(i => i.severity === 'kritik');
  const ortaIssues = issues.filter(i => i.severity === 'orta');
  const dusukIssues = issues.filter(i => i.severity === 'düşük');

  console.log(`Toplam sorun: ${issues.length}`);
  console.log(`  Kritik: ${kritikIssues.length}`);
  console.log(`  Orta:   ${ortaIssues.length}`);
  console.log(`  Düşük:  ${dusukIssues.length}`);

  console.log('\n=== TÜM SORUNLAR ===');
  for (const issue of issues) {
    console.log(`\nSOURUN #${issue.id} — ${issue.page} — [${issue.severity.toUpperCase()}]`);
    console.log(`  ${issue.description}`);
    if (issue.extra) console.log(`  Detay: ${issue.extra.substring(0, 200)}`);
    if (issue.screenshotPath) console.log(`  Screenshot: ${issue.screenshotPath}`);
  }

  if (kritikIssues.length > 0) {
    console.log('\n=== EN KRİTİK 3 SORUN ===');
    kritikIssues.slice(0, 3).forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.page}] ${issue.description}`);
    });
  }

  // Save report
  const reportPath = path.join(SCREENSHOTS_DIR, 'qa-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    issues,
    total: issues.length,
    kritik: kritikIssues.length,
    orta: ortaIssues.length,
    dusuk: dusukIssues.length,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log(`\nRapor: ${reportPath}`);
  console.log(`Screenshots: ${SCREENSHOTS_DIR}/`);
}

main().catch(e => {
  console.error('QA script hatası:', e.message);
  process.exit(1);
});

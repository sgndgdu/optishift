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

function addIssue(page, severity, description, screenshotPath, extra = '') {
  issueCount++;
  const issue = {
    id: issueCount,
    page,
    severity,
    description,
    screenshotPath,
    extra
  };
  issues.push(issue);
  console.log(`\nSOURUN #${issueCount} — ${page} — ${severity}`);
  console.log(`Açıklama: ${description}`);
  if (screenshotPath) console.log(`Kanıt: ${screenshotPath}`);
  if (extra) console.log(`Detay: ${extra}`);
}

async function captureWithConsole(page, filename, pageName, viewport = 'desktop') {
  const errors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const screenshotPath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return { errors, networkErrors, screenshotPath };
}

async function loginAsManager(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail"]', MANAGER_EMAIL);
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="ifre"]', MANAGER_PASS);
  await page.click('button[type="submit"], button:has-text("Giriş"), button:has-text("Login"), button:has-text("Giriş Yap")');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function loginAsEmployee(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail"]', EMPLOYEE_EMAIL);
  await page.fill('input[type="password"], input[name="password"], input[placeholder*="ifre"]', EMPLOYEE_PASS);
  await page.click('button[type="submit"], button:has-text("Giriş"), button:has-text("Login"), button:has-text("Giriş Yap")');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function checkPage(page, url, name, screenshotBase) {
  const consoleErrors = [];
  const networkErrors = [];

  const consoleHandler = msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const responseHandler = response => {
    if (response.status() >= 400 && !response.url().includes('favicon')) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on('console', consoleHandler);
  page.on('response', responseHandler);

  try {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    // timeout ok, still capture
  }
  await page.waitForTimeout(2000);

  // Desktop screenshot
  const desktopPath = path.join(SCREENSHOTS_DIR, `${screenshotBase}-desktop.png`);
  await page.screenshot({ path: desktopPath, fullPage: true });

  // Check for spinner stuck
  const spinnerVisible = await page.isVisible('[class*="spin"], [class*="load"], [class*="Spinner"], .animate-spin', {timeout: 500}).catch(() => false);
  if (spinnerVisible) {
    addIssue(name, 'orta', 'Sayfa spinner/loading durumunda takılı kalmış olabilir', desktopPath);
  }

  // Check for empty page
  const bodyText = await page.evaluate(() => document.body.innerText.trim());
  if (bodyText.length < 50) {
    addIssue(name, 'kritik', 'Sayfa içeriği çok az / boş görünüyor', desktopPath, `İçerik: "${bodyText.substring(0, 100)}"`);
  }

  // Check for 404/error page
  if (bodyText.toLowerCase().includes('404') || bodyText.toLowerCase().includes('not found') || bodyText.toLowerCase().includes('page not found')) {
    addIssue(name, 'kritik', '404 / Sayfa bulunamadı hatası', desktopPath);
  }

  // Check for overflow
  const overflowIssues = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    const issues = [];
    for (const el of elements) {
      if (el.scrollWidth > el.clientWidth + 5 && el.clientWidth > 0 && el !== document.body) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          issues.push(`${el.tagName}.${el.className.substring(0, 50)} (scrollWidth: ${el.scrollWidth}, clientWidth: ${el.clientWidth})`);
          if (issues.length >= 5) break;
        }
      }
    }
    return issues;
  });

  if (overflowIssues.length > 0) {
    addIssue(name, 'orta', `Yatay overflow tespit edildi (${overflowIssues.length} element)`, desktopPath, overflowIssues.slice(0, 3).join(' | '));
  }

  // Check console errors
  if (consoleErrors.length > 0) {
    addIssue(name, 'orta', `Console hatası: ${consoleErrors.length} adet`, desktopPath, consoleErrors.slice(0, 3).join(' | ').substring(0, 300));
  }

  // Check network errors (exclude auth-related false positives)
  const relevantNetworkErrors = networkErrors.filter(e => !e.includes('/api/auth') && !e.includes('/favicon'));
  if (relevantNetworkErrors.length > 0) {
    addIssue(name, 'kritik', `API hatası: ${relevantNetworkErrors.length} adet`, desktopPath, relevantNetworkErrors.slice(0, 3).join(' | ').substring(0, 300));
  }

  // Mobile screenshot
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobilePath = path.join(SCREENSHOTS_DIR, `${screenshotBase}-mobile.png`);
  await page.screenshot({ path: mobilePath, fullPage: true });

  // Check mobile overflow
  const mobileOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
  });
  if (mobileOverflow) {
    addIssue(name + ' (mobil)', 'orta', 'Mobil görünümde yatay scroll / overflow var', mobilePath);
  }

  // Reset to desktop
  await page.setViewportSize({ width: 1280, height: 800 });

  page.removeListener('console', consoleHandler);
  page.removeListener('response', responseHandler);

  return { desktopPath, mobilePath, consoleErrors, networkErrors };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true
  });

  console.log('=== OptiShift QA Audit Başlıyor ===\n');
  console.log('Screenshot dizini:', SCREENSHOTS_DIR);

  // ============ LOGIN PAGE ============
  const loginPage = await context.newPage();
  console.log('\n--- Login sayfası test ediliyor ---');
  const loginConsoleErrors = [];
  loginPage.on('console', msg => { if (msg.type() === 'error') loginConsoleErrors.push(msg.text()); });

  await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await loginPage.waitForTimeout(1000);
  const loginPath = path.join(SCREENSHOTS_DIR, 'login-desktop.png');
  await loginPage.screenshot({ path: loginPath, fullPage: true });

  const emailInput = await loginPage.$('input[type="email"]');
  const passInput = await loginPage.$('input[type="password"]');
  const submitBtn = await loginPage.$('button[type="submit"]');
  if (!emailInput || !passInput || !submitBtn) {
    addIssue('/login', 'kritik', 'Login formu eksik — email, şifre veya submit butonu bulunamadı', loginPath);
  }
  if (loginConsoleErrors.length > 0) {
    addIssue('/login', 'orta', `Console hatası: ${loginConsoleErrors.length} adet`, loginPath, loginConsoleErrors[0].substring(0, 200));
  }

  // ============ MANAGER LOGIN ============
  console.log('\n--- Müdür girişi yapılıyor ---');
  try {
    await loginPage.fill('input[type="email"]', MANAGER_EMAIL);
    await loginPage.fill('input[type="password"]', MANAGER_PASS);
    await loginPage.click('button[type="submit"]');
    await loginPage.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await loginPage.waitForTimeout(2000);
    const afterLoginUrl = loginPage.url();
    console.log('Login sonrası URL:', afterLoginUrl);
    if (afterLoginUrl.includes('/login')) {
      addIssue('/login', 'kritik', 'Müdür girişi başarısız — login sayfasında kaldı', loginPath, `Kullanıcı: ${MANAGER_EMAIL}`);
    }
    const afterLoginPath = path.join(SCREENSHOTS_DIR, 'login-after-manager.png');
    await loginPage.screenshot({ path: afterLoginPath, fullPage: true });
  } catch (e) {
    addIssue('/login', 'kritik', `Login işleminde hata: ${e.message}`, loginPath);
  }

  // ============ MANAGER PORTAL PAGES ============
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
    console.log(`\n--- ${p.name} test ediliyor ---`);
    await checkPage(loginPage, p.url, p.name, p.base);
  }

  await loginPage.close();

  // ============ EMPLOYEE LOGIN ============
  const empPage = await context.newPage();
  console.log('\n\n--- Personel girişi yapılıyor ---');
  try {
    await empPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await empPage.waitForTimeout(1000);
    await empPage.fill('input[type="email"]', EMPLOYEE_EMAIL);
    await empPage.fill('input[type="password"]', EMPLOYEE_PASS);
    await empPage.click('button[type="submit"]');
    await empPage.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await empPage.waitForTimeout(2000);
    const afterEmpLoginUrl = empPage.url();
    console.log('Personel login sonrası URL:', afterEmpLoginUrl);
    if (afterEmpLoginUrl.includes('/login')) {
      addIssue('/login', 'kritik', 'Personel girişi başarısız — login sayfasında kaldı', '', `Kullanıcı: ${EMPLOYEE_EMAIL}`);
    }
    const empLoginPath = path.join(SCREENSHOTS_DIR, 'login-after-employee.png');
    await empPage.screenshot({ path: empLoginPath, fullPage: true });
  } catch (e) {
    addIssue('/login', 'kritik', `Personel login hatası: ${e.message}`, '');
  }

  // ============ EMPLOYEE PORTAL PAGES ============
  const employeePages = [
    { url: '/portal', name: '/portal (Personel Ana)', base: 'emp-portal-home' },
    { url: '/portal/calendar', name: '/portal/calendar', base: 'emp-portal-calendar' },
    { url: '/portal/availability', name: '/portal/availability', base: 'emp-portal-availability' },
    { url: '/portal/requests', name: '/portal/requests', base: 'emp-portal-requests' },
    { url: '/portal/notifications', name: '/portal/notifications', base: 'emp-portal-notifications' },
    { url: '/portal/chat', name: '/portal/chat', base: 'emp-portal-chat' },
  ];

  for (const p of employeePages) {
    console.log(`\n--- ${p.name} test ediliyor ---`);
    await checkPage(empPage, p.url, p.name, p.base);
  }

  await empPage.close();

  // ============ ADDITIONAL VISUAL CHECKS ============
  // Re-open manager pages for specific UI checks
  const checkPage2 = await context.newPage();

  // Login again as manager for specific checks
  await checkPage2.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await checkPage2.fill('input[type="email"]', MANAGER_EMAIL);
  await checkPage2.fill('input[type="password"]', MANAGER_PASS);
  await checkPage2.click('button[type="submit"]');
  await checkPage2.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await checkPage2.waitForTimeout(2000);

  // Sidebar visible check
  await checkPage2.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await checkPage2.waitForTimeout(1500);
  const sidebarVisible = await checkPage2.isVisible('nav, aside, [class*="sidebar"], [class*="Sidebar"]', {timeout: 2000}).catch(() => false);
  if (!sidebarVisible) {
    const p = path.join(SCREENSHOTS_DIR, 'manager-dashboard-desktop.png');
    addIssue('/dashboard', 'orta', 'Sidebar görünmüyor veya bulunamıyor', p);
  }

  // Check schedule page specific elements
  await checkPage2.goto(`${BASE_URL}/schedule`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await checkPage2.waitForTimeout(3000);
  const schedulePagePath = path.join(SCREENSHOTS_DIR, 'manager-schedule-detail.png');
  await checkPage2.screenshot({ path: schedulePagePath, fullPage: true });

  const hasGrid = await checkPage2.isVisible('table, [class*="grid"], [class*="Grid"]', {timeout: 2000}).catch(() => false);
  if (!hasGrid) {
    addIssue('/schedule', 'orta', 'Schedule grid/tablo görünmüyor', schedulePagePath);
  }

  // Check for Turkish text issues — look for placeholder/English text
  const pageText = await checkPage2.evaluate(() => document.body.innerText);
  const suspiciousEnglish = ['Loading...', 'undefined', 'null', 'Error:', 'Cannot read', 'TypeError'];
  for (const word of suspiciousEnglish) {
    if (pageText.includes(word)) {
      addIssue('/schedule', 'orta', `Şüpheli İngilizce/hata metni: "${word}"`, schedulePagePath);
    }
  }

  // Check personnel page for table
  await checkPage2.goto(`${BASE_URL}/personnel`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await checkPage2.waitForTimeout(2000);
  const personnelPath = path.join(SCREENSHOTS_DIR, 'manager-personnel-detail.png');
  await checkPage2.screenshot({ path: personnelPath, fullPage: true });

  // Check dashboard for stat cards
  await checkPage2.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await checkPage2.waitForTimeout(2000);
  const dashPath = path.join(SCREENSHOTS_DIR, 'manager-dashboard-detail.png');
  await checkPage2.screenshot({ path: dashPath, fullPage: true });

  // Check mobile sidebar for manager pages
  await checkPage2.setViewportSize({ width: 390, height: 844 });
  await checkPage2.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await checkPage2.waitForTimeout(1500);
  const dashMobilePath = path.join(SCREENSHOTS_DIR, 'manager-dashboard-mobile-check.png');
  await checkPage2.screenshot({ path: dashMobilePath, fullPage: true });

  // Check if hamburger or mobile menu exists
  const hamburger = await checkPage2.isVisible('[class*="hamburger"], [class*="menu-toggle"], button[aria-label*="menu"], button[aria-label*="Menu"]', {timeout: 1000}).catch(() => false);
  if (!hamburger) {
    // It might be named differently — check if sidebar is hidden on mobile
    const mobileSidebarHidden = await checkPage2.evaluate(() => {
      const sidebar = document.querySelector('nav, aside, [class*="sidebar"]');
      if (!sidebar) return true;
      const style = window.getComputedStyle(sidebar);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    });
    if (mobileSidebarHidden) {
      addIssue('/dashboard (mobil)', 'orta', 'Mobil görünümde sidebar gizlenmiş ama hamburger menü butonu tespit edilemedi', dashMobilePath);
    }
  }

  await checkPage2.close();

  // ============ REPORT ============
  await browser.close();

  console.log('\n\n===========================================');
  console.log('QA AUDIT TAMAMLANDI');
  console.log('===========================================');
  console.log(`Toplam sorun: ${issues.length}`);
  console.log(`Screenshots dizini: ${SCREENSHOTS_DIR}`);

  // Severity breakdown
  const kritik = issues.filter(i => i.severity === 'kritik');
  const orta = issues.filter(i => i.severity === 'orta');
  const dusuk = issues.filter(i => i.severity === 'düşük');

  console.log(`\nKritik: ${kritik.length} | Orta: ${orta.length} | Düşük: ${dusuk.length}`);

  // Write issues to JSON
  const reportPath = path.join(SCREENSHOTS_DIR, 'qa-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ issues, total: issues.length, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\nRapor kaydedildi: ${reportPath}`);

  // Print all issues summary
  console.log('\n=== TÜM SORUNLAR ===');
  for (const issue of issues) {
    console.log(`\nSOURUN #${issue.id} — ${issue.page} — [${issue.severity.toUpperCase()}]`);
    console.log(`  ${issue.description}`);
    if (issue.extra) console.log(`  Detay: ${issue.extra.substring(0, 150)}`);
    if (issue.screenshotPath) console.log(`  Screenshot: ${issue.screenshotPath}`);
  }

  // Top 3 critical
  if (kritik.length > 0) {
    console.log('\n=== EN KRİTİK 3 SORUN ===');
    kritik.slice(0, 3).forEach((issue, i) => {
      console.log(`${i+1}. [${issue.page}] ${issue.description}`);
    });
  }

  return issues;
}

main().catch(e => {
  console.error('QA script hatası:', e);
  process.exit(1);
});

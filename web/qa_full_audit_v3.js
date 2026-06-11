const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/sefagundogdu/Desktop/OptiShift/web/public/qa-screenshots';
const BASE_URL = 'http://localhost:3000';

// Correct credentials (username, not email)
const MANAGER_USER = 'mehmet.celik';
const MANAGER_PASS = 'test123';
const EMPLOYEE_USER = 'ali.kara';
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
  if (screenshotPath) console.log(`  Screenshot: ${screenshotPath}`);
  if (extra) console.log(`  Detay: ${extra.substring(0, 250)}`);
  return issue;
}

async function performLogin(page, username, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Fill username (type="text")
  const textInput = page.locator('input[type="text"]').first();
  await textInput.fill(username);

  // Fill password
  const passInput = page.locator('input[type="password"]').first();
  await passInput.fill(password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for navigation away from /login
  try {
    await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 8000 });
  } catch (e) {
    // Check if there's an error message shown
    const errorText = await page.evaluate(() => {
      const errEl = document.querySelector('.bg-red-50, [class*="error"]');
      return errEl ? errEl.innerText : '';
    }).catch(() => '');
    console.log(`  Login error visible: "${errorText}"`);
  }

  await page.waitForTimeout(1500);
  return page.url();
}

async function scanPage(page, url, pageName, screenshotBase) {
  const consoleErrors = [];
  const networkErrors = [];

  const ch = msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Filter out noise
      if (!txt.includes('favicon') && !txt.includes('net::ERR_ABORTED') && !txt.includes('[HMR]')) {
        consoleErrors.push(txt);
      }
    }
  };
  const rh = r => {
    const url = r.url();
    if (r.status() >= 400 && url.includes('/api/') && !url.includes('favicon')) {
      networkErrors.push(`${r.status()} ${url}`);
    }
  };

  page.on('console', ch);
  page.on('response', rh);

  // Navigate
  try {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
  } catch (e) {
    console.log(`  [timeout navigating to ${url}]`);
  }
  await page.waitForTimeout(2000);

  const currentUrl = page.url();

  // Check redirect to login
  if (currentUrl.includes('/login')) {
    addIssue(pageName, 'kritik', 'Sayfaya erişim başarısız — login sayfasına redirect edildi (oturum geçersiz)', '', `Beklenen: ${BASE_URL}${url}`);
    page.removeListener('console', ch);
    page.removeListener('response', rh);
    return { redirected: true };
  }

  // Desktop screenshot
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  const desktopPath = path.join(SCREENSHOTS_DIR, `${screenshotBase}-desktop.png`);
  await page.screenshot({ path: desktopPath, fullPage: true });

  // Mobile screenshot
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobilePath = path.join(SCREENSHOTS_DIR, `${screenshotBase}-mobile.png`);
  await page.screenshot({ path: mobilePath, fullPage: true });

  // Reset to desktop
  await page.setViewportSize({ width: 1280, height: 800 });

  console.log(`  Desktop: ${desktopPath}`);
  console.log(`  Mobile:  ${mobilePath}`);

  // --- Checks ---

  // Body text length
  const bodyText = await page.evaluate(() => document.body.innerText.trim()).catch(() => '');
  if (bodyText.length < 100) {
    addIssue(pageName, 'kritik', `Sayfa içeriği çok az (${bodyText.length} karakter) — boş veya yüklenemedi`, desktopPath, `İçerik: "${bodyText.substring(0, 150)}"`);
  }

  // 404 check
  if (bodyText.includes('404') && (bodyText.includes('not found') || bodyText.includes('bulunamadı'))) {
    addIssue(pageName, 'kritik', '404 Sayfası görünüyor', desktopPath);
  }

  // Spinner stuck (visible after 2s)
  const spinnerStuck = await page.evaluate(() => {
    const el = document.querySelector('.animate-spin');
    if (!el) return false;
    // Check if it's a permanent spinner (not inside a button with loading state)
    const parent = el.closest('button');
    return !parent;
  }).catch(() => false);
  if (spinnerStuck) {
    addIssue(pageName, 'orta', 'Sayfa loading spinner\'ında takılı kalmış', desktopPath);
  }

  // Document-level horizontal overflow (desktop)
  await page.setViewportSize({ width: 1280, height: 800 });
  const docOverflow = await page.evaluate(() => {
    const dw = document.documentElement.scrollWidth;
    const vw = window.innerWidth;
    return dw > vw + 10 ? { has: true, dw, vw } : { has: false };
  }).catch(() => ({ has: false }));
  if (docOverflow.has) {
    addIssue(pageName, 'orta', `Yatay taşma (overflow-x): dok genişliği ${docOverflow.dw}px, viewport ${docOverflow.vw}px`, desktopPath);
  }

  // Mobile overflow
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => {
    const dw = document.documentElement.scrollWidth;
    const vw = window.innerWidth;
    return dw > vw + 10 ? { has: true, dw, vw } : { has: false };
  }).catch(() => ({ has: false }));
  if (mobileOverflow.has) {
    addIssue(pageName + ' [mobil]', 'orta', `Mobil yatay taşma: dok ${mobileOverflow.dw}px, viewport ${mobileOverflow.vw}px`, mobilePath);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // Console errors
  if (consoleErrors.length > 0) {
    addIssue(pageName, 'orta', `JS console hatası: ${consoleErrors.length} adet`, desktopPath, consoleErrors.slice(0, 2).join(' | '));
  }

  // API errors
  if (networkErrors.length > 0) {
    addIssue(pageName, 'kritik', `API hata yanıtı: ${networkErrors.length} adet`, desktopPath, networkErrors.slice(0, 3).join(' | '));
  }

  // undefined/null text
  const badText = await page.evaluate(() => {
    const text = document.body.innerText;
    const issues = [];
    if (text.match(/\bundefined\b/)) issues.push('"undefined" metni görünüyor');
    if (text.match(/\bNaN\b/)) issues.push('"NaN" metni görünüyor');
    return issues;
  }).catch(() => []);
  for (const b of badText) {
    addIssue(pageName, 'orta', b, desktopPath);
  }

  page.removeListener('console', ch);
  page.removeListener('response', rh);

  return { desktopPath, mobilePath, bodyText, consoleErrors, networkErrors };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  console.log('=== OptiShift QA Audit v3 ===');
  console.log(`Screenshots: ${SCREENSHOTS_DIR}\n`);

  // =====================
  // LOGIN PAGE TESTS
  // =====================
  console.log('--- LOGIN SAYFASI ---');
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const loginPage = await loginCtx.newPage();

  await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(1500);

  const loginDesktopPath = path.join(SCREENSHOTS_DIR, 'login-desktop.png');
  await loginPage.screenshot({ path: loginDesktopPath, fullPage: true });

  await loginPage.setViewportSize({ width: 390, height: 844 });
  await loginPage.waitForTimeout(400);
  const loginMobilePath = path.join(SCREENSHOTS_DIR, 'login-mobile.png');
  await loginPage.screenshot({ path: loginMobilePath, fullPage: true });
  await loginPage.setViewportSize({ width: 1280, height: 800 });

  console.log(`  Desktop: ${loginDesktopPath}`);
  console.log(`  Mobile: ${loginMobilePath}`);

  // Login form accessibility: type="text" for email field
  const usesTextNotEmail = await loginPage.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) {
      if (inp.placeholder && inp.placeholder.includes('kullanici')) {
        return inp.type === 'text';
      }
    }
    return false;
  }).catch(() => false);
  if (usesTextNotEmail) {
    addIssue('/login', 'düşük', 'Kullanıcı adı input alanı type="text" — email kullananlar için type="email" daha uygun olabilir (accessibility)', loginDesktopPath);
  }

  // Check login form description says "Kullanıcı Adı" but users might use email
  const hasEmailHint = await loginPage.evaluate(() => {
    return document.body.innerText.includes('mail') || document.body.innerText.includes('e-posta');
  }).catch(() => false);
  if (!hasEmailHint) {
    addIssue('/login', 'düşük', 'Login formu sadece "Kullanıcı Adı" gösteriyor — kullanıcılar email adresini girmeyi deneyebilir (UX sorunu)', loginDesktopPath);
  }

  await loginCtx.close();

  // =====================
  // MANAGER PORTAL
  // =====================
  console.log('\n\n--- MÜDÜR PORTALI ---');
  const managerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const managerPage = await managerCtx.newPage();

  const managerLandingUrl = await performLogin(managerPage, MANAGER_USER, MANAGER_PASS);
  console.log(`Müdür login sonrası URL: ${managerLandingUrl}`);

  const managerLoginResultPath = path.join(SCREENSHOTS_DIR, 'login-manager-result.png');
  await managerPage.screenshot({ path: managerLoginResultPath, fullPage: true });

  if (managerLandingUrl.includes('/login')) {
    addIssue('/login', 'kritik', `Müdür girişi başarısız — "${MANAGER_USER}" ile login çalışmıyor`, managerLoginResultPath);
    // Try to understand why
    const errorMsg = await managerPage.evaluate(() => {
      const el = document.querySelector('.bg-red-50');
      return el ? el.innerText : 'Hata mesajı yok';
    }).catch(() => '');
    console.log(`  Hata mesajı: ${errorMsg}`);
  } else {
    console.log(`  Müdür girişi BASARILI`);
    console.log(`  Manager login screenshot: ${managerLoginResultPath}`);

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
      const result = await scanPage(managerPage, p.url, p.name, p.base);
      if (result.redirected) {
        // Auth lost — break is not needed, but note it
        console.log(`  Auth redirect on ${p.url} — subsequent pages may also fail`);
      }
    }

    // === Detailed schedule checks ===
    console.log('\n--- /schedule detay kontrolleri ---');
    await managerPage.goto(`${BASE_URL}/schedule`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await managerPage.waitForTimeout(3000);
    const schedDetailPath = path.join(SCREENSHOTS_DIR, 'manager-schedule-detail.png');
    await managerPage.screenshot({ path: schedDetailPath, fullPage: true });
    console.log(`  Schedule detail: ${schedDetailPath}`);

    // Check for Kapasite Matrisi (T1-A feature)
    const hasCapacityMatrix = await managerPage.evaluate(() => {
      const text = document.body.innerText;
      return text.toLowerCase().includes('kapasite') || text.includes('Talep Matrisi') || text.includes('demand');
    }).catch(() => false);
    if (!hasCapacityMatrix) {
      addIssue('/schedule (Müdür)', 'orta', 'Kapasite Matrisi (Demand Template) paneli mevcut değil — T1-A özelliği eksik', schedDetailPath);
    }

    // Check for coverage gap counter
    const hasCoverageGap = await managerPage.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('/') && (text.includes('atanan') || text.includes('gereken'));
    }).catch(() => false);
    if (!hasCoverageGap) {
      addIssue('/schedule (Müdür)', 'düşük', 'Coverage gap sayacı (atanan/gereken) grid\'de görünmüyor', schedDetailPath);
    }

    // Check for draft/publish buttons
    const hasPublishBtn = await managerPage.isVisible('button:text("Yayınla"), button:text-is("Taslak"), button:text("Yayınla")').catch(() => false);
    const scheduleText = await managerPage.evaluate(() => document.body.innerText).catch(() => '');
    const hasPublishText = scheduleText.includes('Yayınla') || scheduleText.includes('Taslak') || scheduleText.includes('Yayınlandı');
    if (!hasPublishText) {
      addIssue('/schedule (Müdür)', 'orta', 'Taslak/Yayınla butonları görünmüyor — T1-C özelliği eksik', schedDetailPath);
    }

    // === Dashboard live ops check ===
    console.log('\n--- /dashboard detay kontrolleri ---');
    await managerPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await managerPage.waitForTimeout(2000);
    const dashDetailPath = path.join(SCREENSHOTS_DIR, 'manager-dashboard-detail.png');
    await managerPage.screenshot({ path: dashDetailPath, fullPage: true });
    console.log(`  Dashboard detail: ${dashDetailPath}`);

    const dashText = await managerPage.evaluate(() => document.body.innerText).catch(() => '');
    const hasCheckIn = dashText.includes('Check-in') || dashText.includes('check-in') || dashText.includes('Geldi') || dashText.includes('Bekleniyor');
    if (!hasCheckIn) {
      addIssue('/dashboard (Müdür)', 'orta', 'Canlı operasyon check-in istatistikleri (Geldi/Bekleniyor/Molada) görünmüyor', dashDetailPath);
    }

    // === Personnel page checks ===
    console.log('\n--- /personnel detay kontrolleri ---');
    await managerPage.goto(`${BASE_URL}/personnel`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await managerPage.waitForTimeout(2000);
    const personnelDetailPath = path.join(SCREENSHOTS_DIR, 'manager-personnel-detail.png');
    await managerPage.screenshot({ path: personnelDetailPath, fullPage: true });
    console.log(`  Personnel detail: ${personnelDetailPath}`);

    const personnelText = await managerPage.evaluate(() => document.body.innerText).catch(() => '');
    if (personnelText.length < 200) {
      addIssue('/personnel (Müdür)', 'orta', 'Personnel sayfası içeriği çok az — personel listesi yüklenememiş olabilir', personnelDetailPath);
    }

    // Check for add personnel button
    const hasAddButton = personnelText.includes('Ekle') || personnelText.includes('Yeni') || personnelText.includes('Personel Ekle');
    if (!hasAddButton) {
      addIssue('/personnel (Müdür)', 'düşük', 'Personel ekleme butonu görünmüyor veya tespit edilemiyor', personnelDetailPath);
    }
  }

  await managerCtx.close();

  // =====================
  // EMPLOYEE PORTAL
  // =====================
  console.log('\n\n--- PERSONEL PORTALI ---');
  const empCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const empPage = await empCtx.newPage();

  const empLandingUrl = await performLogin(empPage, EMPLOYEE_USER, EMPLOYEE_PASS);
  console.log(`Personel login sonrası URL: ${empLandingUrl}`);

  const empLoginResultPath = path.join(SCREENSHOTS_DIR, 'login-employee-result.png');
  await empPage.screenshot({ path: empLoginResultPath, fullPage: true });

  if (empLandingUrl.includes('/login')) {
    addIssue('/login', 'kritik', `Personel girişi başarısız — "${EMPLOYEE_USER}" ile login çalışmıyor`, empLoginResultPath);
  } else {
    console.log(`  Personel girişi BASARILI`);

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
      await scanPage(empPage, p.url, p.name, p.base);
    }

    // === Availability color picker check ===
    console.log('\n--- /portal/availability detay kontrolleri ---');
    await empPage.goto(`${BASE_URL}/portal/availability`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await empPage.waitForTimeout(2000);
    const availDetailPath = path.join(SCREENSHOTS_DIR, 'emp-availability-detail.png');
    await empPage.screenshot({ path: availDetailPath, fullPage: true });
    console.log(`  Availability detail: ${availDetailPath}`);

    const availText = await empPage.evaluate(() => document.body.innerText).catch(() => '');
    const hasColorSystem = availText.includes('Müsait') || availText.includes('Tercih') || availText.includes('Gelemem') || availText.includes('yeşil') || availText.includes('kırmızı');
    if (!hasColorSystem) {
      addIssue('/portal/availability', 'orta', '3 renkli müsaitlik sistemi (Yeşil/Sarı/Kırmızı) UI\'da görünmüyor', availDetailPath);
    }

    // === Portal home check-in button ===
    console.log('\n--- /portal ana sayfa detay kontrolleri ---');
    await empPage.goto(`${BASE_URL}/portal`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await empPage.waitForTimeout(2000);
    const portalDetailPath = path.join(SCREENSHOTS_DIR, 'emp-portal-detail.png');
    await empPage.screenshot({ path: portalDetailPath, fullPage: true });
    console.log(`  Portal detail: ${portalDetailPath}`);

    const portalText = await empPage.evaluate(() => document.body.innerText).catch(() => '');
    const hasCheckinBtn = portalText.includes('Check-in') || portalText.includes('check-in') || portalText.includes('Giriş Yap') || portalText.includes('Vardiya');
    if (!hasCheckinBtn) {
      addIssue('/portal (Personel Ana)', 'orta', 'Check-in butonu veya aktif vardiya kartı görünmüyor', portalDetailPath);
    }
  }

  await empCtx.close();

  // =====================
  // REPORT
  // =====================
  await browser.close();

  console.log('\n\n===========================================');
  console.log('QA AUDIT TAMAMLANDI');
  console.log('===========================================');

  const kritikIssues = issues.filter(i => i.severity === 'kritik');
  const ortaIssues = issues.filter(i => i.severity === 'orta');
  const dusukIssues = issues.filter(i => i.severity === 'düşük');

  console.log(`\nToplam sorun: ${issues.length}`);
  console.log(`  Kritik: ${kritikIssues.length}`);
  console.log(`  Orta:   ${ortaIssues.length}`);
  console.log(`  Düşük:  ${dusukIssues.length}`);

  console.log('\n=== TÜM SORUNLAR ===');
  for (const issue of issues) {
    console.log(`\nSOURUN #${issue.id} — ${issue.page} — [${issue.severity.toUpperCase()}]`);
    console.log(`  ${issue.description}`);
    if (issue.extra) console.log(`  Detay: ${issue.extra.substring(0, 250)}`);
    if (issue.screenshotPath) console.log(`  Kanıt: ${issue.screenshotPath}`);
  }

  if (kritikIssues.length > 0) {
    console.log('\n=== EN KRİTİK 3 SORUN ===');
    kritikIssues.slice(0, 3).forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.page}] ${issue.description}`);
    });
  }

  // Save JSON report
  const reportPath = path.join(SCREENSHOTS_DIR, 'qa-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    issues,
    total: issues.length,
    kritik: kritikIssues.length,
    orta: ortaIssues.length,
    dusuk: dusukIssues.length,
    timestamp: new Date().toISOString(),
    screenshotsDir: SCREENSHOTS_DIR
  }, null, 2));
  console.log(`\nRapor: ${reportPath}`);
}

main().catch(e => {
  console.error('\nQA script hatasi:', e.message);
  process.exit(1);
});

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const findings = [];
  
  // 1. Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="text"]', 'mehmet.celik');
  await page.fill('input[type="password"]', 'test1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 8000 });
  findings.push('✅ Login başarılı → /dashboard yönlendirme OK');

  // 2. Dashboard kontrol
  await page.waitForTimeout(1500);
  const dashTitle = await page.textContent('h1').catch(() => null);
  findings.push(`📊 Dashboard başlığı: "${dashTitle}"`);
  
  const sidebarLoc = await page.textContent('.text-sm.font-semibold').catch(() => null);
  findings.push(`🏪 Sidebar şube: "${sidebarLoc}"`);

  // 3. Schedule sayfasına git
  await page.goto('http://localhost:3000/schedule');
  await page.waitForTimeout(2000);
  
  const schedTitle = await page.textContent('h1').catch(() => null);
  findings.push(`📅 Schedule başlığı: "${schedTitle}"`);

  // Tablo yüklendi mi?
  const tableRows = await page.$$('tbody tr');
  findings.push(`👥 Tabloda personel satırı: ${tableRows.length}`);

  // Haftanın tarihi var mı?
  const weekLabel = await page.textContent('.min-w-\\[200px\\]').catch(() => null);
  findings.push(`📆 Hafta: "${weekLabel}"`);

  // Müsaitlik renkleri var mı?
  const greenCells = await page.$$('.bg-emerald-50\\/80');
  const redCells = await page.$$('.bg-red-50');
  const ambCells = await page.$$('.bg-amber-50');
  findings.push(`🟢 Müsait hücre: ${greenCells.length} | 🔴 Gelemez: ${redCells.length} | 🟡 Tercih etmiyor: ${ambCells.length}`);

  // Vardiya atanmış mı (mor hücreler)?
  const assignedCells = await page.$$('.bg-violet-100');
  findings.push(`💜 Atanmış vardiya: ${assignedCells.length}`);

  // 4. Bir hücreye tıkla → popover açılıyor mu?
  const firstClickable = await page.$('td.cursor-pointer');
  if (firstClickable) {
    await firstClickable.click();
    await page.waitForTimeout(500);
    const popover = await page.$('[data-popover]');
    findings.push(`🎯 Hücre tıklama → Popover: ${popover ? 'AÇILDI ✅' : 'AÇILMADI ❌'}`);
    if (popover) {
      const popoverText = await popover.textContent();
      findings.push(`📋 Popover içeriği: "${popoverText?.slice(0,80).trim()}"`);
      // Kapat
      await page.keyboard.press('Escape');
      await page.click('body');
      await page.waitForTimeout(300);
    }
  }

  // 5. Shift definitions yüklü mü? (Ayarlar'dan)
  await page.goto('http://localhost:3000/settings');
  await page.waitForTimeout(1500);
  const settingsContent = await page.textContent('body');
  const hasShiftDefs = settingsContent?.includes('Vardiya') || settingsContent?.includes('vardiya');
  findings.push(`⚙️ Settings sayfası: ${hasShiftDefs ? 'Vardiya tanımları var ✅' : 'Vardiya tanımı yok ❌'}`);

  // 6. OR-Tools generate test (API)
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find(c => c.name === 'optishift_session');
  
  if (sessionCookie) {
    const resp = await page.request.post('http://localhost:3000/api/generate', {
      headers: { 'Content-Type': 'application/json' },
      data: { locationId: 'LOC-BAR-1', week_start: '2026-06-09' }
    });
    const genData = await resp.json().catch(() => ({}));
    if (genData.error) {
      findings.push(`🤖 OR-Tools generate: HATA → "${genData.error}"`);
    } else if (genData.assignments) {
      findings.push(`🤖 OR-Tools generate: ${genData.assignments.length} vardiya üretildi ✅`);
      findings.push(`📊 OR-Tools scores: ${JSON.stringify(genData.scores || {}).slice(0,80)}`);
    } else {
      findings.push(`🤖 OR-Tools generate: Beklenmedik yanıt → ${JSON.stringify(genData).slice(0,100)}`);
    }
  }

  // 7. Personnel sayfası
  await page.goto('http://localhost:3000/personnel');
  await page.waitForTimeout(1500);
  const personnelRows = await page.$$('tbody tr').catch(() => []);
  findings.push(`👤 Personel sayfası satır: ${personnelRows.length}`);

  await browser.close();
  
  console.log('\n===== TEST RAPORU =====');
  findings.forEach(f => console.log(f));
  console.log('=======================\n');
})().catch(err => console.error('PLAYWRIGHT HATASI:', err.message));

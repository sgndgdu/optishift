const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const issues = [];
  const ok = [];

  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="text"]', 'mehmet.celik');
  await page.fill('input[type="password"]', 'test1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 8000 });

  // ── 1. SCHEDULE: Manuel vardiya ekle ──────────────────────────────────
  await page.goto('http://localhost:3000/schedule');
  await page.waitForTimeout(2000);

  // İlk boş hücreye tıkla
  const cells = await page.$$('td.cursor-pointer');
  let popoverOpened = false;
  for (const cell of cells) {
    const hasBg = await cell.evaluate(el => el.querySelector('.bg-violet-100') !== null);
    if (!hasBg) { // boş hücre bul
      await cell.click();
      await page.waitForTimeout(600);
      const pop = await page.$('[data-popover]');
      if (pop) { popoverOpened = true; break; }
    }
  }

  if (popoverOpened) {
    ok.push('Boş hücre tıklama → Popover açıldı');

    // Slider var mı?
    const slider = await page.$('[data-popover] input[type="range"]');
    ok.push(`Slider: ${slider ? '✅ var' : '❌ YOK'}`);
    if (!slider) issues.push('SORUN: Popover\'da time range slider bulunamadı');

    // Şablon listesi var mı?
    const templateBtns = await page.$$('[data-popover] button');
    ok.push(`Popover butonlar: ${templateBtns.length} adet`);
    
    // İlk şablona tıkla
    const shiftBtns = await page.$$('[data-popover] .text-xs.font-semibold');
    if (shiftBtns.length > 0) {
      ok.push(`Şablon seçeneği: ${shiftBtns.length} adet`);
    }

    // Kaydet
    const saveBtn = await page.$('[data-popover] button:last-child');
    if (saveBtn) {
      const saveTxt = await saveBtn.textContent();
      ok.push(`Kaydet butonu: "${saveTxt?.trim()}"`);
      await saveBtn.click();
      await page.waitForTimeout(500);
      const stillOpen = await page.$('[data-popover]');
      ok.push(`Kaydet sonrası popover: ${stillOpen ? '❌ hâlâ açık (sorun!)' : '✅ kapandı'}`);
    }
  } else {
    issues.push('SORUN: Boş hücreye tıklamada popover açılmadı');
  }

  // Publish test
  await page.waitForTimeout(500);
  const publishBtn = await page.$('button:has-text("Yayınla")');
  const publishDisabled = await publishBtn?.getAttribute('disabled');
  ok.push(`Yayınla butonu: ${publishDisabled !== null ? '🔒 disabled' : '🟢 aktif'}`);

  // ── 2. PERSONNEL: Neden 0 satır? ──────────────────────────────────────
  await page.goto('http://localhost:3000/personnel');
  await page.waitForTimeout(3000);

  const pageContent = await page.textContent('body');
  const hasPersonnel = pageContent?.includes('Mehmet') || pageContent?.includes('Ali');
  ok.push(`Personel sayfasında isimler: ${hasPersonnel ? '✅ görünüyor' : '❌ görünmüyor'}`);

  // API direkt test
  const apiResp = await page.request.get('http://localhost:3000/api/personnel?location_id=LOC-BAR-1');
  const apiData = await apiResp.json();
  ok.push(`/api/personnel API: ${apiResp.status()} → ${Array.isArray(apiData) ? apiData.length + ' kayıt' : 'hata: ' + JSON.stringify(apiData).slice(0,50)}`);

  // Console errors yakala
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0,80)); });
  await page.reload();
  await page.waitForTimeout(3000);
  if (errors.length > 0) issues.push(`Personel sayfası console hataları: ${errors.join(' | ')}`);

  // Tablonun kendisi var mı?
  const table = await page.$('table');
  const cards = await page.$$('.bg-white.rounded');
  ok.push(`Tablo: ${table ? '✅ var' : '❌ yok'} | Card: ${cards.length}`);

  // ── 3. WEEK NAVIGATION ──────────────────────────────────────────────
  await page.goto('http://localhost:3000/schedule');
  await page.waitForTimeout(2000);
  
  const week1 = await page.textContent('.min-w-\\[200px\\]').catch(() => '');
  await page.click('button:has([class*="ChevronRight"], [data-lucide="chevron-right"])').catch(() => {});
  // Alternatif: ok butonları
  const navBtns = await page.$$('.overflow-hidden button');
  if (navBtns.length >= 2) {
    await navBtns[1].click(); // sağ ok
    await page.waitForTimeout(800);
  }
  const week2 = await page.textContent('.min-w-\\[200px\\]').catch(() => '');
  ok.push(`Hafta navigasyon: "${week1?.trim()}" → "${week2?.trim()}"`);
  const weekChanged = week1?.trim() !== week2?.trim();
  if (!weekChanged) issues.push('SORUN: Hafta navigasyonu değişmiyor');

  // ── 4. Excel export link ────────────────────────────────────────────
  await page.goto('http://localhost:3000/schedule');
  await page.waitForTimeout(1500);
  const excelLink = await page.$('a[download]');
  const excelHref = await excelLink?.getAttribute('href');
  ok.push(`Excel export link: ${excelHref ? '✅ ' + excelHref.slice(0,60) : '❌ yok'}`);

  await browser.close();

  console.log('\n===== DERİN TEST RAPORU =====');
  console.log('\n✅ ÇALIŞANLAR:');
  ok.forEach(o => console.log('  ' + o));
  console.log('\n❌ SORUNLAR:');
  if (issues.length === 0) console.log('  Sorun bulunamadı!');
  issues.forEach(i => console.log('  ' + i));
  console.log('=============================\n');
})().catch(err => {
  console.error('HATA:', err.message);
  process.exit(1);
});

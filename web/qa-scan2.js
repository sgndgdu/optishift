const { chromium } = require('playwright');
const fs = require('fs');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const networkErrors = [];
  const consoleMessages = [];
  page.on('response', r => { if (r.status() >= 400) networkErrors.push({ url: r.url(), status: r.status() }); });
  page.on('console', m => { if (m.type() === 'error') consoleMessages.push(m.text()); });

  await page.setViewportSize({ width: 1280, height: 800 });

  // Login as manager
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'mehmet.celik@bargrubu.com');
  await page.fill('input[type="password"]', 'test123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Test dashboard - scroll down
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/qa-deep-scan/02-dashboard-scrolled.png', fullPage: true });

  // Test schedule cell click
  await page.goto('http://localhost:3000/schedule', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Get cell count
  const cellCount = await page.locator('td').count();
  console.log('TD cells total:', cellCount);

  // Find cells with content
  for (let i = 2; i < Math.min(cellCount, 20); i++) {
    const cell = page.locator('td').nth(i);
    const text = await cell.textContent();
    if (text && text.trim().includes('Vardiya')) {
      await cell.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: '/tmp/qa-deep-scan/03-schedule-cell-popup.png', fullPage: false });
      console.log('Clicked cell with vardiya, text:', text.substring(0, 50));
      break;
    }
  }

  // Check breaks - timer accuracy
  await page.goto('http://localhost:3000/breaks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const breaksText = await page.innerText('body');
  const hasLongTimers = breaksText.includes('05:') || breaksText.includes('04:');
  const hasMolada = breaksText.includes('Molada');
  console.log('Breaks - has 5+ hour timers (mock data issue):', hasLongTimers);
  console.log('Breaks - text snippet:', breaksText.substring(0, 200));

  // Check fairness float precision
  await page.goto('http://localhost:3000/fairness', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const fairnessText = await page.innerText('body');
  const hasFloatBug = fairnessText.includes('16.799999');
  const hasNegativeGap = /\-\d+\.?\d*p/.test(fairnessText);
  console.log('Fairness - float precision bug (16.799...):', hasFloatBug);
  console.log('Fairness text snippet (stats area):', fairnessText.substring(100, 400));
  await page.screenshot({ path: '/tmp/qa-deep-scan/08-fairness-scrolled.png', fullPage: true });

  // Check if dashboard has live ops section (Canlı Operasyon)
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dashText = await page.innerText('body');
  const hasCanlıOps = dashText.includes('Canlı Operasyon') || dashText.includes('Geldi') || dashText.includes('check-in') || dashText.includes('Bekleniyor');
  console.log('Dashboard - has live ops section:', hasCanlıOps);
  console.log('Dashboard full text (first 800):', dashText.substring(0, 800));

  // Check settings tabs
  await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const tabs = await page.locator('[role="tab"]').count();
  console.log('Settings tabs count (role=tab):', tabs);

  const settingsText = await page.innerText('body');
  const hasCalisma = settingsText.includes('Çalışma Saatleri');
  const hasVardiyaSablon = settingsText.includes('Vardiya Şablonları') || settingsText.includes('Vardiya Şablonları');
  const hasAgirlık = settingsText.includes('Ağırlık') || settingsText.includes('Ağırlıkları');
  const hasBolge = settingsText.includes('Bölge') || settingsText.includes('Bölgeler');
  console.log('Settings tabs: Çalışma=', hasCalisma, 'Şablonlar=', hasVardiyaSablon, 'Ağırlık=', hasAgirlık, 'Bölge=', hasBolge);

  // Test "Vardiya Şablonları" tab and add form
  const tab1 = page.locator('text=Vardiya Şablonları').first();
  if (await tab1.count() > 0) {
    await tab1.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/qa-deep-scan/09-settings-vardiya-tab.png', fullPage: true });

    // Look for add form / button
    const addBtn = page.locator('button:has-text("Ekle"), button:has-text("Yeni"), button:has-text("Vardiya Ekle")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/qa-deep-scan/09-settings-add-shift-form.png', fullPage: true });
    }
  }

  // Test integrations - click Bağlan button
  await page.goto('http://localhost:3000/integrations', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bağlanBtns = page.locator('button:has-text("Bağlan")');
  const bağlanCount = await bağlanBtns.count();
  console.log('Bağlan button count:', bağlanCount);
  if (bağlanCount > 0) {
    await bağlanBtns.first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/qa-deep-scan/10-integrations-modal.png', fullPage: false });
    const modalText = await page.innerText('body');
    const hasModal = modalText.includes('API') || modalText.includes('anahtarı') || modalText.includes('modal');
    console.log('Integrations - modal opened after Bağlan click:', hasModal);
  }

  // Test open shifts - "Yeni İlan" button
  await page.goto('http://localhost:3000/open-shifts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const yeniIlanBtn = page.locator('button:has-text("Yeni İlan"), button:has-text("İlan")').first();
  if (await yeniIlanBtn.count() > 0) {
    await yeniIlanBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/qa-deep-scan/06-open-shifts-modal.png', fullPage: false });
    console.log('Open shifts - Yeni İlan modal opened');
  }

  // Test requests - batch approve
  await page.goto('http://localhost:3000/requests', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const reqText = await page.innerText('body');
  console.log('Requests page text snippet:', reqText.substring(0, 400));
  const tabsOnReq = await page.locator('[role="tab"]').count();
  console.log('Requests - tab count:', tabsOnReq);

  console.log('\nAll network errors:', JSON.stringify(networkErrors));
  console.log('\nAll console errors:', consoleMessages);

  await browser.close();
}
run().catch(e => console.error('FATAL:', e));

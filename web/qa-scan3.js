const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Test supervisor schedule
  const page1 = await browser.newPage();
  await page1.setViewportSize({ width: 1280, height: 800 });

  await page1.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page1.fill('input[type="email"]', 'patron@bargrubu.com');
  await page1.fill('input[type="password"]', 'test123');
  await page1.click('button[type="submit"]');
  await page1.waitForTimeout(2000);
  console.log('Supervisor URL after login:', page1.url());

  await page1.goto('http://localhost:3000/supervisor/schedule', { waitUntil: 'networkidle' });
  await page1.waitForTimeout(2000);
  console.log('Supervisor schedule URL:', page1.url());
  const scheduleBodyText = await page1.innerText('body');
  console.log('Schedule page content (first 400):', scheduleBodyText.substring(0, 400));
  await page1.screenshot({ path: '/tmp/qa-deep-scan/19b-supervisor-schedule-real.png', fullPage: true });

  await page1.close();

  // Test manager chat - send a message
  const page2 = await browser.newPage();
  await page2.setViewportSize({ width: 1280, height: 800 });
  await page2.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page2.fill('input[type="email"]', 'mehmet.celik@bargrubu.com');
  await page2.fill('input[type="password"]', 'test123');
  await page2.click('button[type="submit"]');
  await page2.waitForTimeout(2000);

  await page2.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);

  // Click Karaköy Şubesi group
  const groupBtn = page2.locator('text=Karaköy Şubesi').first();
  if (await groupBtn.count() > 0) {
    await groupBtn.click();
    await page2.waitForTimeout(800);
    await page2.screenshot({ path: '/tmp/qa-deep-scan/11-chat-group-selected.png', fullPage: false });
  }

  const msgInput = page2.locator('input[placeholder*="Mesaj"], textarea[placeholder*="Mesaj"]').first();
  const hasInput = await msgInput.count();
  console.log('Chat message input found:', hasInput > 0);

  if (hasInput > 0) {
    await msgInput.fill('Test mesajı - QA');
    await page2.waitForTimeout(300);
    await page2.screenshot({ path: '/tmp/qa-deep-scan/11-chat-typing.png', fullPage: false });

    // Send with Enter
    await msgInput.press('Enter');
    await page2.waitForTimeout(1500);
    await page2.screenshot({ path: '/tmp/qa-deep-scan/11-chat-after-send.png', fullPage: false });

    const chatText = await page2.innerText('body');
    const msgSent = chatText.includes('Test mesajı');
    console.log('Chat - message sent and visible:', msgSent);
  }

  // Breaks mock data
  await page2.goto('http://localhost:3000/breaks', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);
  const breaksText = await page2.innerText('body');
  const timerMatch = breaksText.match(/\d{2}:\d{2}/g);
  console.log('Breaks - all time values found:', timerMatch ? timerMatch.join(', ') : 'none');
  console.log('Breaks - 10 molada stat shows:', breaksText.includes('10') ? 'Yes - possibly stale mock data' : 'No');

  // Breaks - check mock vs real: The mock shows "Başladı: 16:02" which means data is stale
  const hasStaleTime = breaksText.includes('16:02');
  console.log('Breaks - has stale timestamp 16:02:', hasStaleTime);

  // Dashboard check
  await page2.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1500);
  const fullDash = await page2.innerText('body');
  console.log('Dashboard - Canlı Operasyon section:', fullDash.includes('Canlı Operasyon'));
  console.log('Dashboard - Bekleniyor status:', fullDash.includes('Bekleniyor'));

  // Schedule mobile layout check
  await page2.setViewportSize({ width: 390, height: 844 });
  await page2.goto('http://localhost:3000/schedule', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(2000);
  // Check if the action buttons are visible on mobile
  const mobileText = await page2.innerText('body');
  const hasYayinla = mobileText.includes('Yayınla');
  const hasTaslak = mobileText.includes('Taslak');
  console.log('Schedule mobile - Yayınla visible:', hasYayinla, 'Taslak visible:', hasTaslak);
  await page2.screenshot({ path: '/tmp/qa-deep-scan/03-schedule-mobile-detailed.png', fullPage: true });

  await page2.close();
  await browser.close();
}
run().catch(e => console.error('FATAL:', e));

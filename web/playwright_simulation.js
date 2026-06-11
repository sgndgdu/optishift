/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = "/Users/sefagundogdu/.gemini/antigravity/brain/0656d79a-ccf2-4ea4-b2c2-f81c951340a3";
const APP_URL = 'http://localhost:3000';

async function runSimulation() {
  console.log("Starting LCW 14-Agent Playwright Simulation...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  
  const page = await context.newPage();

  try {
    // ---------------------------------------------------------
    // AGENT 1: JOKER HASAN (Employee - Kadıköy)
    // ---------------------------------------------------------
    console.log("Agent 1: Logging in as Employee (Joker Hasan)");
    await page.goto(`${APP_URL}/portal/login`);
    await page.fill('input[type="email"]', 'joker.hasan.kadikoy@lcw.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to portal
    await page.waitForTimeout(2000); 
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_1_employee_portal_dashboard.png') });
    console.log("Took screenshot of Employee Portal Dashboard");

    // Try going to availability tab
    await page.goto(`${APP_URL}/portal/availability`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_2_employee_availability.png') });
    console.log("Took screenshot of Employee Availability Form");

    // Clear session
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    // ---------------------------------------------------------
    // AGENT 2: AHMET MUDUR (Manager - Kadıköy)
    // ---------------------------------------------------------
    console.log("Agent 2: Logging in as Manager (Ahmet Mudur)");
    await page.goto(`${APP_URL}/portal/login`); // Wait, portal/login handles all logins?
    // Actually our unified login logic in portal/login directs to /dashboard if role === manager
    await page.fill('input[type="email"]', 'ahmet.mudur.kadikoy@lcw.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');

    // Wait for redirect to manager dashboard
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_3_manager_dashboard.png') });
    console.log("Took screenshot of Manager Dashboard");

    // Go to Schedule (Vardiya Planı)
    await page.goto(`${APP_URL}/schedule`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_4_manager_schedule.png') });
    console.log("Took screenshot of Manager Schedule");

    // Go to Personnel (Toplu Ekleme ekranı vb)
    await page.goto(`${APP_URL}/personnel`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_5_manager_personnel.png') });
    console.log("Took screenshot of Manager Personnel");

  } catch (err) {
    console.error("Simulation failed:", err);
  } finally {
    await browser.close();
    console.log("Simulation finished.");
  }
}

runSimulation();

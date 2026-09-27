import { test, expect } from "@playwright/test";
test("cold generate with warm-up", async ({ page }) => {
  test.setTimeout(240_000);
  const warm: string[] = [];
  page.on("response", async r => { if (r.url().includes("/api/engine/warm")) warm.push(`${r.status()} ${await r.text().catch(() => "")}`); });
  await page.goto("/login");
  await page.getByPlaceholder("kullanici.adi veya ad@sirket.com").fill("mega.mudur.otel");
  await page.locator('input[type="password"]').fill("1234");
  await page.getByRole("button", { name: /Giriş Yap/ }).click();
  await page.waitForURL(/dashboard/, { timeout: 60_000 });
  await page.waitForTimeout(15_000); // müdür Ana Sayfa'yı okuyor
  await page.goto("/schedule?week=next");
  await page.getByRole("button", { name: /Haftayı Oluştur/ }).click();
  const w = page.getByRole("dialog", { name: "Haftayı Oluştur" });
  await w.getByRole("button", { name: /İleri/ }).click();
  await w.getByRole("button", { name: /İleri/ }).click();
  const t0 = Date.now();
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes("/api/generate") && r.request().method() === "POST", { timeout: 120_000 }),
    w.getByRole("button", { name: /Planı Oluştur/ }).click(),
  ]);
  console.log(`[COLD] warm yanıtları: ${JSON.stringify(warm)}`);
  console.log(`[COLD] /api/generate HTTP ${resp.status()} in ${Date.now() - t0}ms`);
  expect(resp.status()).toBeLessThan(500);
});

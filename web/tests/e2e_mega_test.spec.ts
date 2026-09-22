import { test, expect, type Page } from "@playwright/test";

/**
 * Mega stres testi — scripts/seed_mega_test.mjs'in canlı DB'ye yazdığı
 * org-mega-test verisine karşı çalışır. Önce seed script'i çalıştırılmış
 * olmalı: `node scripts/seed_mega_test.mjs`.
 *
 * ID/kullanıcı adları seed script'iyle BİREBİR eşleşmeli — biri değişirse
 * diğerini de güncelle.
 */
const PASSWORD = "1234";
const KAFE_LOCATION_ID = "loc-mega-kafe";
const KIOSK_PIN = "4711";

const MANAGERS = [
  { username: "mega.mudur.kafe", label: "Zeytin Sahil Kafe" },
  { username: "mega.mudur.otel", label: "Boğaz Manzara Otel" },
  { username: "mega.mudur.fabrika", label: "Marmara Üretim Tesisi" },
  { username: "mega.mudur.perakende", label: "ModaPlus Mağaza" },
  { username: "mega.mudur.restoran", label: "Liman Restoran" },
];

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("kullanici.adi veya ad@sirket.com").fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Giriş Yap/ }).click();
}

test("1) Süpervizör — 5 şubeli dashboard yüklenme süresi", async ({ page }) => {
  await login(page, "mega.supervisor", PASSWORD);
  await page.waitForURL("**/supervisor", { timeout: 20_000 });

  const start = Date.now();
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  const elapsed = Date.now() - start;

  // En az bir şube kartı gerçekten render olmuş mu (sahte "yüklendi" değil)
  await expect(page.getByText("Zeytin Sahil Kafe")).toBeVisible();
  await expect(page.getByText("Marmara Üretim Tesisi")).toBeVisible();

  console.log(`[PERF] 5 şubeli süpervizör dashboard'u networkidle'a ulaşma süresi: ${elapsed}ms`);
  test.info().annotations.push({ type: "perf", description: `dashboard_networkidle_ms=${elapsed}` });
});

test("2) Rastgele şube — Otomatik Oluştur (OR-Tools) çöküyor mu", async ({ page }) => {
  const branch = MANAGERS[Math.floor(Math.random() * MANAGERS.length)];
  console.log(`[INFO] Seçilen şube: ${branch.label} (${branch.username})`);

  await login(page, branch.username, PASSWORD);
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await page.goto("/schedule");

  // Bu haftanın planlanmamış/kalan günleri de boş bırakıldı ama garantisi
  // asıl GELECEK haftada — bir hafta ileri git (ChevronRight, tek kullanım yeri).
  await page.locator("button:has(svg.lucide-chevron-right)").first().click();

  // exact:true şart — Kapasite Planı panelinin açıklama metni de "Otomatik Oluştur"
  // kelimesini içeriyor ve regex olmadan strict-mode ihlaline yol açıyor.
  const generateBtn = page.getByRole("button", { name: "Otomatik Oluştur", exact: true });
  await expect(generateBtn).toBeVisible({ timeout: 15_000 });

  const start = Date.now();
  const [genResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/generate") && r.request().method() === "POST",
      { timeout: 65_000 },
    ),
    generateBtn.click(),
  ]);
  const elapsed = Date.now() - start;
  const status = genResponse.status();
  const body = await genResponse.json().catch(() => null);

  console.log(`[PERF] /api/generate (${branch.label}) → HTTP ${status} in ${elapsed}ms`);
  if (body?.error) console.log(`[INFO] Motor mesajı: ${body.error}`);
  else console.log(`[INFO] ${body?.assignments?.length ?? 0} atama üretildi.`);
  test.info().annotations.push({ type: "perf", description: `generate_${branch.username}_ms=${elapsed}_status=${status}` });

  // Asıl "çökme" sinyali: 5xx (Vercel fonksiyon timeout/hatası). 4xx (örn.
  // kapasite çelişkisi mesajı) geçerli/beklenen bir sonuçtur, bug değildir.
  expect(status, `beklenmeyen sunucu hatası: ${JSON.stringify(body)}`).toBeLessThan(500);
});

test("3) Kiosk — Zeytin Sahil Kafe check-in", async ({ page }) => {
  await page.goto(`/kiosk/${KAFE_LOCATION_ID}`);
  await expect(page.getByText("GİRİŞ YAP")).toBeVisible({ timeout: 15_000 });

  const [kioskResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`/api/kiosk/${KAFE_LOCATION_ID}`) && r.request().method() === "POST",
      { timeout: 15_000 },
    ),
    (async () => {
      for (const digit of KIOSK_PIN) {
        await page.getByRole("button", { name: digit, exact: true }).click();
      }
    })(),
  ]);

  const status = kioskResponse.status();
  const body = await kioskResponse.json().catch(() => null);
  console.log(`[INFO] Kiosk check-in → HTTP ${status}`, body);

  expect(status, `kiosk check-in başarısız: ${JSON.stringify(body)}`).toBe(200);
  await expect(page.getByText(/Giriş kaydedildi/)).toBeVisible();
});

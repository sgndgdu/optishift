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
const FABRIKA_MANAGER_USERNAME = "mega.mudur.fabrika";
const FATIGUE_TEST_PERSON_NAME = "Hasan Bal"; // son 3 gün ardışık gece vardiyası fixture'ı

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

  // Boş hafta → "Planı Oluştur" sihirbazı: Kaç kişi? → Kontrol → Oluştur
  // Deploy sonrası ilk açılışta sayfa hydrate olmadan gelen tıklama boşa gidebiliyor:
  // pencere açılana kadar tıklamayı yeniden dene
  const wizard = page.getByRole("dialog", { name: "Planı Oluştur" });
  await expect(async () => {
    await page.getByRole("button", { name: /Planı Oluştur/ }).click();
    await expect(wizard).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await wizard.getByRole("button", { name: /İleri/ }).click();
  await expect(wizard.getByText("Oluşturmadan önce kontrol")).toBeVisible();
  await wizard.getByRole("button", { name: /İleri/ }).click();
  const generateBtn = wizard.getByRole("button", { name: /Planı Oluştur/ });
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

// 3 ve 4 (ortak tablet girişi, girişi engelleyen devir defteri) kaldırıldı: vardiya giriş/çıkışı yok (2026-10-10)

test("5) Kaza Risk Radarı — dashboard kartı ve schedule risk ikonu", async ({ page }) => {
  // Fixture: Hasan Bal'ın (FATIGUE_TEST_PERSON_NAME) son 3 günü ardışık gece
  // vardiyası — "kritik" seviye garanti (bkz. lib/fatigue.ts eşikleri).
  await login(page, FABRIKA_MANAGER_USERNAME, PASSWORD);
  await page.waitForURL("**/dashboard", { timeout: 20_000 });

  await expect(page.getByText(/Yorgunluk uyarısı/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(FATIGUE_TEST_PERSON_NAME).first()).toBeVisible();
  // Organik veride başka personel de eşiği aşmış olabilir (birden fazla eşleşme
  // strict-mode'u ihlal eder) — burada asıl doğrulanan, fixture kişisinin ayrı
  // olarak göründüğü (üstteki satır) + radar'ın en az bir gerçek gece-zinciri
  // sebebi ürettiği (aşağıdaki .first()).
  await expect(page.getByText(/Üst üste \d+ gece vardiyası/).first()).toBeVisible();
  console.log("[INFO] Dashboard risk kartı görünür ve fixture kişisini listeliyor.");

  // Risk bu haftanın yayınlanmış vardiyalarına göre: Perşembe sonrası varsayılan gelecek hafta olduğu için açıkça bu hafta
  await page.goto("/schedule?week=this");
  await expect(page.getByText(FATIGUE_TEST_PERSON_NAME).first()).toBeVisible({ timeout: 15_000 });

  // Risk ikonu title attribute'unda "Risk:" ile başlıyor (bkz. schedule/page.tsx)
  const riskIcon = page.locator('span[title^="Risk:"]').first();
  await expect(riskIcon).toBeVisible({ timeout: 10_000 });
  const title = await riskIcon.getAttribute("title");
  console.log(`[INFO] Schedule risk ikonu tooltip: ${title}`);
  expect(title).toContain("gece");
});

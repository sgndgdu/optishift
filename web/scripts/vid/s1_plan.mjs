/**
 * Sahne 1: boş hafta → Planı Oluştur sihirbazı → plan dolar → yayınla. MOBILE=1 telefon sürümü.
 * Önce: node scripts/seed_vitrin.mjs (gelecek hafta boş olmalı)
 */
import { open, go, login, startRec, encode, cursorStart, click, hover, follow, focus, reset, wait, caption } from "./rec.mjs";
const M = !!process.env.MOBILE;
const D = process.env.FRAMES || `/tmp/vid_s1${M ? "m" : ""}`;
const { b, page } = await open({ mobile: M });
await login(page, "vitrin.sorumlu", "vitrin123");
await go(page, "/schedule?week=next");
await wait(page, 200);
const rec = await startRec(page, D);
await cursorStart(page, M ? 195 : 900, M ? 500 : 700);
// 1) Ekibin uygunluğu
await caption(page, "Ekip gelemeyeceği günleri telefondan girdi", 1);
await wait(page, 900);
if (M) {
  await focus(page, { x: 195, y: (await page.getByText("Can Ertürk", { exact: true }).first().boundingBox()).y + 60 }, 1.35);
  await wait(page, 1500);
  await reset(page);
} else {
  await follow(page, 1.6);
  await hover(page, page.getByText("Gelemem").first());
  await wait(page, 700);
}
// 2) Planı Oluştur
await caption(page, "");
await click(page, page.getByRole("button", { name: "Planı Oluştur" }).first());
await reset(page);
await caption(page, "Kaç kişi gerektiği bir kez girilir", 2);
await wait(page, 900);
if (!M) { await focus(page, { x: 720, y: 360 }, 1.25); await wait(page, 800); await follow(page, 1.6); }
else await wait(page, 600);
await click(page, page.getByRole("button", { name: /İleri/ }));
await caption(page, "Sorun varsa oluşturmadan önce söyler", 3);
await wait(page, 300);
await hover(page, page.getByText("İhtiyaç mevcut ekiple").first());
await wait(page, 900);
await click(page, page.getByRole("button", { name: /İleri/ }));
await click(page, page.locator(".fixed").getByRole("button", { name: "Planı Oluştur" }));
await wait(page, 900); // "Planınız hazırlanıyor" kısa görünsün
const pub = page.getByRole("button", { name: "Şimdi Yayınla" });
rec.pause();
await pub.waitFor({ timeout: 60000 });
rec.resume();
await caption(page, "Plan saniyeler içinde hazır", 4);
await hover(page, page.getByText("vardiya yazıldı").first());
await wait(page, 800);
await click(page, pub);
await wait(page, 400);
const warn = page.getByText("Yayınlamadan önce bakın");
if (await warn.isVisible().catch(() => false)) await click(page, page.getByRole("button", { name: "Yayınla", exact: true }).last());
rec.pause();
await page.getByText("Plan yayınlandı").first().waitFor({ timeout: 90000 });
await page.waitForLoadState("networkidle");
rec.resume();
// 4) Sonuç
await reset(page);
await caption(page, "Yayınlandı, ekibe bildirim gitti", 5);
await wait(page, 1300);
if (M) {
  await click(page, page.getByRole("button", { name: /^Cmt/ }).first());
  await wait(page, 1200);
} else {
  await follow(page, 1.6);
  await hover(page, page.getByText("Can Ertürk", { exact: true }).first());
  await wait(page, 300);
  const row = await page.getByText("Can Ertürk", { exact: true }).first().boundingBox();
  const paz = await page.getByText("Paz", { exact: true }).first().boundingBox();
  const p = await page.evaluate(([x, y]) => window.__dir.toPage(x, y), [paz.x + paz.width / 2, row.y + row.height / 2]);
  await page.evaluate(([x, y, ms]) => window.__dir.moveTo(x, y, ms), [p.x, p.y, Math.round(1600 / 0.2)]);
  await wait(page, 500);
  await reset(page);
  await wait(page, 600);
}
await caption(page, "");
await wait(page, 700);
console.log(await rec.stop());
encode(D, `scripts/vid/out/plan${M ? "-m" : ""}.mp4`, { width: M ? 780 : 1920, captions: rec.captions() });
await b.close();

/** Sahne 1: boş haftada Planı Oluştur → sihirbaz → plan dolar → yayınla. Önce: node scripts/seed_vitrin.mjs (gelecek hafta boş olmalı) */
import { open, go, login, startRec, encode, cursorStart, click, hover, zoomTo, zoomOut, wait } from "./rec.mjs";
const D = process.env.FRAMES || "/tmp/vid_s1";
const { b, page } = await open();
await login(page, "vitrin.sorumlu", "vitrin123");
await go(page, "/schedule?week=next");
await wait(page, 300);
const rec = await startRec(page, D);
await cursorStart(page, 1080, 640);
await wait(page, 300);
// Ekibin girdiği uygunluklar
await zoomTo(page, { x: 640, y: 330 }, 1.35, 1000);
await hover(page, page.getByText("Gelemem").first(), 700);
await wait(page, 300);
await zoomOut(page, 800);
// Sihirbaz
await click(page, page.getByRole("button", { name: "Planı Oluştur" }).first(), 800);
await wait(page, 1100);
await click(page, page.getByRole("button", { name: /İleri/ }), 700);
await wait(page, 400);
await zoomTo(page, page.getByText("İhtiyaç mevcut ekiple").first(), 1.45, 800);
await wait(page, 600);
await zoomOut(page, 600);
await click(page, page.getByRole("button", { name: /İleri/ }), 600);
await wait(page, 300);
await click(page, page.locator(".fixed").getByRole("button", { name: "Planı Oluştur" }), 600);
const pub = page.getByRole("button", { name: "Şimdi Yayınla" });
await wait(page, 900); // "Planınız hazırlanıyor" kısa görünsün
rec.pause();
await pub.waitFor({ timeout: 60000 });
rec.resume();
await wait(page, 300);
await zoomTo(page, page.getByText("vardiya yazıldı").first(), 1.5, 800);
await wait(page, 700);
await zoomOut(page, 600);
await click(page, pub, 700);
await wait(page, 800);
const warn = page.getByText("Yayınlamadan önce bakın");
if (await warn.isVisible().catch(() => false)) {
  await click(page, page.getByRole("button", { name: "Yayınla", exact: true }).last(), 600);
  await wait(page, 600);
}
await wait(page, 500);
rec.pause();
await page.getByText("Plan yayınlandı").first().waitFor({ timeout: 90000 });
await page.waitForLoadState("networkidle");
rec.resume();
await wait(page, 300);
await zoomTo(page, { x: 760, y: 430 }, 1.45, 1000);
await hover(page, page.getByText("Elif Kaya").first(), 700);
await wait(page, 600);
await zoomOut(page, 900);
await wait(page, 700);
console.log(await rec.stop());
encode(D, "scripts/vid/out/plan.mp4", { width: 1920, crf: 27 });
await b.close();

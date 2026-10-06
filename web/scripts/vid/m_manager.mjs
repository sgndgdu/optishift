/**
 * Yönetici ek sahneleri. Kullanım: [MOBILE=1] node scripts/vid/m_manager.mjs <sahne>
 *   autopilot | fairness | team | reports
 * autopilot: gelecek hafta BOŞ olmalı (seed sonrası). Diğerleri her durumda.
 */
import { open, go, login, startRec, encode, cursorStart, click, hover, follow, focus, reset, wait, caption, type } from "./rec.mjs";
const SCENE = process.argv[2];
const M = !!process.env.MOBILE;
const D = `/tmp/vid_m_${SCENE}${M ? "m" : ""}`;
const { b, page } = await open({ mobile: M });
await login(page, "vitrin.sorumlu", "vitrin123");
const start = { autopilot: "/dashboard", fairness: "/reports?tab=adalet", team: "/personnel", reports: "/reports" }[SCENE];
await go(page, start);
await wait(page, 200);
const rec = await startRec(page, D);
await cursorStart(page, M ? 195 : 1000, M ? 500 : 650);
const zoomOn = async (loc, s = 1.6) => { if (M) await focus(page, { x: 195, y: (await loc.boundingBox()).y + 20 }, Math.min(s, 1.3)); else { await follow(page, s); await hover(page, loc); } };

if (SCENE === "autopilot") {
  await caption(page, "Gelecek haftanın planı kendiliğinden hazırlanır", 1);
  await wait(page, 500);
  await zoomOn(page.getByText(/otomatik hazırlanacak/).first());
  await wait(page, 1400);
  await reset(page);
  await go(page, "/settings?tab=advanced");
  await wait(page, 500);
  await caption(page, "Hangi gün hazırlanacağını siz seçersiniz", 2);
  await click(page, page.getByText("Otomatik Pilot", { exact: true }).first());
  await wait(page, 600);
  const sel = page.locator("select:visible").filter({ has: page.locator("option", { hasText: "Perşembe" }) }).first();
  await zoomOn(sel, 1.6);
  await wait(page, 400);
  await click(page, sel);
  await sel.selectOption({ label: "Cuma" });
  await wait(page, 900);
  await caption(page, "Siz sadece kontrol edip yayınlarsınız", 3);
  const save = page.getByRole("button", { name: "Kaydet" }).last();
  if (await save.isVisible().catch(() => false)) await click(page, save);
  await wait(page, 1300);
  await reset(page);
}

if (SCENE === "fairness") {
  await caption(page, "Kimin ne kadar zor vardiya aldığı görünür", 1);
  await wait(page, 700);
  await zoomOn(page.getByText("Yük dağılımı").first(), 1.5);
  await wait(page, 400);
  const rows = page.locator("text=/Ortalamanın|Az yüklü|Çok yüklü|Dengeli/");
  if (!M) { await hover(page, rows.first()); await wait(page, 400); await hover(page, rows.nth(4)); }
  await wait(page, 900);
  await caption(page, "Yeni plan birikimi dengeler", 2);
  await click(page, page.getByText("8 Hafta", { exact: true }).first());
  await wait(page, 1500);
  await reset(page);
  await wait(page, 600);
}

if (SCENE === "team") {
  await caption(page, "Ekibe kişi eklemek bir dakika", 1);
  await wait(page, 600);
  await click(page, page.getByRole("button", { name: /Ekle/ }).first());
  await wait(page, 500);
  await click(page, page.getByText("Tek kişi ekle").first());
  await wait(page, 600);
  await caption(page, "Adı ve telefonu yeter", 2);
  const inputs = page.locator(".fixed input:visible");
  if (!M) await focus(page, page.getByText("Ekibe kişi ekle").last(), 1.55);
  await click(page, inputs.first()); await type(page, "Derya Yıldırım", 55);
  await click(page, inputs.nth(1)); await type(page, "0532 418 27 65", 55);
  await wait(page, 200);
  await click(page, page.locator(".fixed").getByRole("button", { name: "Salon", exact: true }).first());
  await wait(page, 300);
  await click(page, page.locator(".fixed").getByRole("button", { name: /Ekle|Kaydet|Oluştur/ }).last());
  await wait(page, 900);
  await caption(page, "Giriş bağlantısı WhatsApp ile gider", 3);
  const wa = page.getByText("WhatsApp ile gönder").first();
  await wa.waitFor({ timeout: 30000 });
  await reset(page);
  await wait(page, 300);
  await zoomOn(wa, 1.6);
  await wait(page, 1300);
  await reset(page);
  await click(page, page.getByRole("button", { name: "Tamam" }));
  await wait(page, 900);
}

if (SCENE === "reports") {
  await caption(page, "Kim kaç saat çalıştı, hazır", 1);
  await wait(page, 700);
  await zoomOn(page.getByText("Toplam çalışma").first(), 1.5);
  await wait(page, 900);
  if (!M) { await hover(page, page.getByText("Burak Tan").first()); await wait(page, 600); }
  await reset(page);
  await caption(page, "Puantaj ve Excel tek tıkla iner", 2);
  await click(page, page.getByRole("button", { name: /Excel/ }).first());
  await wait(page, 1500);
}

await caption(page, "");
await wait(page, 500);
console.log(await rec.stop());
encode(D, `scripts/vid/out/mgr-${SCENE}${M ? "-m" : ""}.mp4`, { width: M ? 780 : 1920, captions: rec.captions() });
await b.close();

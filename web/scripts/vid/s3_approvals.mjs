/** Sahne 3: Onaylar: kurala uymayan vardiya değişimi, gerekçeyle red, izin kartındaki ekip bilgisi, onay. MOBILE=1 telefon. Önce seed */
import { open, go, login, startRec, encode, cursorStart, click, hover, follow, focus, reset, wait, caption, type } from "./rec.mjs";
const M = !!process.env.MOBILE;
const D = process.env.FRAMES || `/tmp/vid_s3${M ? "m" : ""}`;
const { b, page } = await open({ mobile: M });
await login(page, "vitrin.sorumlu", "vitrin123");
await go(page, "/requests");
await wait(page, 200);
const rec = await startRec(page, D);
await cursorStart(page, M ? 195 : 1000, M ? 500 : 700);
await caption(page, "Kurala uymayan isteği onaylamadan önce söyler", 1);
await wait(page, 800);
if (M) await focus(page, { x: 195, y: (await page.getByText("Onaylanırsa kurallara uymuyor").first().boundingBox()).y + 30 }, 1.3);
else { await follow(page, 1.7); await hover(page, page.getByText("Onaylanırsa kurallara uymuyor").first()); }
await wait(page, 500);
if (!M) await hover(page, page.getByText(/dinlenme kalıyor/).first());
await wait(page, 1300);
if (M) await reset(page);
await click(page, page.getByRole("button", { name: "Reddet" }).first());
await wait(page, 300);
await click(page, page.getByPlaceholder(/Neden/));
await type(page, "Dinlenme süresi yetmiyor", 55);
await wait(page, 300);
await click(page, page.locator(".fixed").getByRole("button", { name: "Reddet" }).last());
await reset(page);
await wait(page, 800);
await caption(page, "İzinde ekibin durumu da yazar", 2);
const info = page.getByText("Kasa departmanında").first();
if (M) { await info.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })); await wait(page, 300); await focus(page, { x: 195, y: (await info.boundingBox()).y + 20 }, 1.3); }
else { await follow(page, 1.7); await hover(page, info); }
await wait(page, 1500);
await caption(page, "Tek dokunuşla onaylanır", 3);
const card = page.locator("div").filter({ has: page.getByText("Selin Aydın") }).filter({ has: page.getByRole("button", { name: "Onayla" }) }).last();
if (M) await reset(page);
await click(page, card.getByRole("button", { name: "Onayla" }));
await wait(page, 600);
const sure = page.locator(".fixed").getByRole("button", { name: /Onayla/ });
if (await sure.count()) await click(page, sure.last());
await reset(page);
await wait(page, 1300);
await caption(page, "");
await wait(page, 500);
console.log(await rec.stop());
encode(D, `scripts/vid/out/approvals${M ? "-m" : ""}.mp4`, { width: M ? 780 : 1920, captions: rec.captions() });
await b.close();

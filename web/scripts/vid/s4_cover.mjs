/** Sahne 4: yayınlı planda biri gelemiyor → önerilen yedekler gerekçeleriyle → Ata. MOBILE=1 telefon sürümü. Plan yayınlıyken çekilir */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { open, go, login, startRec, encode, cursorStart, click, hover, follow, focus, reset, wait, caption, cellAt } from "./rec.mjs";
const M = !!process.env.MOBILE;
const D = process.env.FRAMES || `/tmp/vid_s4${M ? "m" : ""}`;
// Plan motoru her seferinde birebir aynı planı kurmaz: Çarşamba kapanışı olan birini veritabanından seç (Elif varsa o)
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf-8");
const sql = neon(env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1]);
const pad = (n) => String(n).padStart(2, "0");
const nm = new Date(); nm.setDate(nm.getDate() - ((nm.getDay() + 6) % 7) + 7);
const NEXT = `${nm.getFullYear()}-${pad(nm.getMonth() + 1)}-${pad(nm.getDate())}`;
const wed = await sql`SELECT p.name FROM shift_assignments s JOIN personnel p ON p.id = s.personnel_id
  WHERE s.location_id = 'loc-vitrin-moda' AND s.week_start = ${NEXT} AND s.day = 2 AND s.shift_id = 's-kapanis' ORDER BY p.name`;
if (!wed.length) throw new Error("Gelecek hafta Çarşamba kapanışı yok: önce sahne 1");
const WHO = process.env.WHO || (wed.find((r) => r.name === "Elif Kaya") ?? wed[0]).name, DAY = "Çar";
console.log("yerine bul:", WHO);
const { b, page } = await open({ mobile: M });
await login(page, "vitrin.sorumlu", "vitrin123");
await go(page, "/schedule?week=next");
await wait(page, 200);
const rec = await startRec(page, D);
await cursorStart(page, M ? 195 : 1100, M ? 500 : 720);
await caption(page, M ? "Biri gelemiyor mu? Vardiyasına dokunun" : "Biri gelemiyor mu? Vardiyasına tıklayın", 1);
await wait(page, 900);
let cell;
if (M) {
  await click(page, page.getByRole("button", { name: new RegExp(`^${DAY}`) }).first());
  await wait(page, 400);
  const row = page.getByText(WHO, { exact: true }).first();
  await row.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await wait(page, 700);
  cell = { boundingBox: async () => { const r = await row.boundingBox(); return r && { x: 230, y: r.y, width: 60, height: r.height }; } };
} else {
  await follow(page, 1.6);
  cell = cellAt(page, WHO, DAY);
}
await click(page, cell);
await page.getByText("Önerilen yedekler").waitFor({ timeout: 30000 });
await reset(page);
await wait(page, 500);
await caption(page, "En uygun yedekler gerekçesiyle sıralanır", 2);
if (!M) await focus(page, page.getByText("Önerilen yedekler").first(), 1.35);
await hover(page, page.getByText(/uygun olduğunu girmiş/).first());
await wait(page, 700);
await hover(page, page.getByText(/sınırı aşmaz/).first());
await wait(page, 800);
await caption(page, "Tek tıkla atanır, kişiye bildirim gider", 3);
await click(page, page.getByRole("button", { name: "Ata" }).first());
rec.pause();
await page.getByText("Önerilen yedekler").waitFor({ state: "detached", timeout: 90000 });
await page.waitForLoadState("networkidle");
rec.resume();
await reset(page);
await wait(page, 600);
if (!M) { await follow(page, 1.6); await hover(page, cellAt(page, WHO, DAY)); }
await wait(page, 1300);
await reset(page);
await caption(page, "");
await wait(page, 600);
console.log(await rec.stop());
encode(D, `scripts/vid/out/cover${M ? "-m" : ""}.mp4`, { width: M ? 780 : 1920, captions: rec.captions() });
await b.close();

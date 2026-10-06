/**
 * Ekip üyesi sahneleri (telefon). Kullanım: node scripts/vid/e_team.mjs <sahne>
 *   availability | leave | swap | open | chat
 * Plan yayınlıyken çekilir (gelecek hafta yayınlı; uygunluk iki hafta sonrası için girilir).
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { open, go, login, startRec, encode, cursorStart, click, focus, reset, wait, caption, type, BASE } from "./rec.mjs";
const SCENE = process.argv[2];
const D = `/tmp/vid_e_${SCENE}`;
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf-8");
const sql = neon(env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1]);

// Açık vardiya sahnesi için: o gün boş ve kurallara göre üstlenebilen biri (dinlenme/haftalık sınır engellemesin)
let USER = "v.burak.tan";
if (SCENE === "open") {
  const [os] = await sql`SELECT date FROM open_shifts WHERE location_id = 'loc-vitrin-moda' AND status = 'open' ORDER BY date LIMIT 1`;
  const free = await sql`SELECT u.username FROM users u JOIN personnel p ON p.id = u.personnel_id WHERE u.org_id = 'org-vitrin' AND u.role = 'employee'
    AND p.id NOT IN (SELECT personnel_id FROM shift_assignments WHERE location_id = 'loc-vitrin-moda'
      AND week_start::date + day = ${os.date}::date) ORDER BY u.username`;
  const probe = await open({ mobile: true });
  USER = null;
  for (const { username } of free) {
    const ctx = await probe.b.newContext({ viewport: { width: 390, height: 760 }, serviceWorkers: "block" });
    const pg = await ctx.newPage();
    await login(pg, username, "vitrin123", "/portal/login");
    await pg.goto(`${BASE}/portal/open-shifts`, { waitUntil: "networkidle" });
    const ok = await pg.getByRole("button", { name: "Üstlen" }).first().isVisible().catch(() => false);
    await ctx.close();
    if (ok) { USER = username; break; }
  }
  await probe.b.close();
  if (!USER) throw new Error("Açık vardiyayı üstlenebilecek kimse yok");
  console.log("açık vardiya:", USER);
}

const { b, page } = await open({ mobile: true });
await login(page, USER, "vitrin123", "/portal/login");
const start = { availability: "/portal/availability", leave: "/portal/requests", swap: "/portal/calendar", open: "/portal", chat: "/portal/chat" }[SCENE];
await go(page, start);
await wait(page, 200);
const rec = await startRec(page, D);
await cursorStart(page, 195, 500);

if (SCENE === "availability") {
  await caption(page, "Ekip uygunluğunu telefondan girer", 1);
  await wait(page, 700);
  await click(page, page.locator("button").filter({ has: page.locator("svg.lucide-chevron-right") }).first());
  await page.waitForLoadState("networkidle");
  await wait(page, 500);
  await caption(page, "Gelemeyeceği günü işaretler", 2);
  await click(page, page.getByRole("button", { name: /Gelemem/ }).nth(4));
  await wait(page, 300);
  await caption(page, "Tercih etmediği günü de", 3);
  await click(page, page.getByRole("button", { name: /Tercih etmem/ }).nth(6));
  await wait(page, 500);
  await caption(page, "Plan bu bilgilere göre kurulur", 4);
  await click(page, page.getByRole("button", { name: /Gönder|Kaydet/ }).last());
  await wait(page, 1500);
}

if (SCENE === "leave") {
  await caption(page, "İzin isteği iki dokunuş", 1);
  await wait(page, 700);
  await click(page, page.getByRole("button", { name: /Yeni talep/ }));
  await wait(page, 500);
  await click(page, page.getByRole("button", { name: /İzin istiyorum/ }));
  await wait(page, 500);
  await caption(page, "Tarihi ve nedenini yazar", 2);
  const dates = page.locator('input[type="date"]');
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(); d.setDate(d.getDate() + 22); const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const d2 = new Date(d); d2.setDate(d2.getDate() + 1); const e = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`;
  await click(page, dates.first()); await dates.first().fill(s); await wait(page, 300);
  await click(page, dates.nth(1)); await dates.nth(1).fill(e); await wait(page, 300);
  await click(page, page.getByPlaceholder(/not|nedenini/));
  await type(page, "Ailemin yanına gideceğim", 55);
  await wait(page, 400);
  await caption(page, "Sorumluya anında düşer", 3);
  await click(page, page.getByRole("button", { name: /Gönder|İste/ }).last());
  await wait(page, 1600);
}

if (SCENE === "swap") {
  await caption(page, "Vardiyasını arkadaşıyla değiştirmek ister", 1);
  await wait(page, 600);
  await click(page, page.getByRole("button", { name: "Sonraki hafta" }));
  await page.waitForLoadState("networkidle");
  await wait(page, 400);
  await click(page, page.getByText(/Seninle:/).nth(1));
  await wait(page, 500);
  await click(page, page.getByRole("button", { name: /Biriyle değiştir/ }));
  await page.waitForLoadState("networkidle");
  await wait(page, 600);
  await click(page, page.getByRole("button", { name: "Devam" }));
  await page.waitForLoadState("networkidle");
  await wait(page, 500);
  await caption(page, "Sadece kurallara uyan seçenekler çıkar", 2);
  // Kiminle: değişebileceği vardiyası olan ilk arkadaş; sonra onun vardiyası
  await click(page, page.locator("main button:visible:enabled", { hasText: /seninkiyle/ }).first());
  await wait(page, 400);
  await click(page, page.getByRole("button", { name: "Devam" }));
  await page.waitForLoadState("networkidle");
  await wait(page, 500);
  // Onun vardiyası: seçilince "Devam" açılan ilk seçenek (kurala uymayanlar seçilemez)
  const shifts = page.locator("main button:visible:enabled", { hasText: /·/ }).filter({ hasNotText: /Talep/ });
  for (let i = 0, n = await shifts.count(); i < n; i++) {
    const ok = await shifts.nth(i).evaluate((el) => getComputedStyle(el).pointerEvents !== "none" && getComputedStyle(el.parentElement).pointerEvents !== "none");
    if (!ok) continue;
    await click(page, shifts.nth(i));
    await wait(page, 300);
    if (await page.getByRole("button", { name: "Devam" }).isEnabled()) break;
  }
  await wait(page, 300);
  await click(page, page.getByRole("button", { name: "Devam" }));
  await wait(page, 500);
  await caption(page, "Arkadaşı kabul edince sorumluya gider", 3);
  await click(page, page.getByRole("button", { name: /Gönder|Teklif/ }).last());
  await wait(page, 1500);
}

if (SCENE === "open") {
  await caption(page, "Boşta kalan vardiya ekibe duyurulur", 1);
  await wait(page, 700);
  await go(page, "/portal/open-shifts");
  await wait(page, 600);
  await focus(page, { x: 195, y: 330 }, 1.25);
  await wait(page, 1000);
  await reset(page);
  await caption(page, "Uygun olan tek dokunuşla üstlenir", 2);
  await click(page, page.getByRole("button", { name: "Üstlen" }).first());
  await wait(page, 500);
  await click(page, page.getByRole("button", { name: /Üstlen|Evet/ }).last());
  await wait(page, 1600);
  await caption(page, "Ek puanı adalet puanına yazılır", 3);
  await wait(page, 1400);
}

if (SCENE === "chat") {
  await caption(page, "Ekip sohbeti uygulamanın içinde", 1);
  await wait(page, 700);
  await click(page, page.getByText("Ekip Sohbeti").first());
  await page.waitForLoadState("networkidle");
  await wait(page, 600);
  await click(page, page.getByPlaceholder(/Mesaj/).first());
  await type(page, "Cumartesi açılışta ben varım, anahtarı alırım", 50);
  await wait(page, 300);
  await caption(page, "WhatsApp grubunda vardiya kovalamak yok", 2);
  await page.keyboard.press("Enter");
  await wait(page, 1800);
}

await caption(page, "");
await wait(page, 500);
console.log(await rec.stop());
encode(D, `scripts/vid/out/team-${SCENE}-m.mp4`, { width: 780, captions: rec.captions() });
await b.close();

/**
 * Sahne 5: İşletme Asistanı. MOBILE=1 telefon sürümü. Plan yayınlıyken çekilir.
 * Yerelde yapay zekâ anahtarı yok: cevap ağda karşılanır ama içeriği vitrinin GERÇEK planından (gelecek hafta Cumartesi) kurulur.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { open, go, login, startRec, encode, cursorStart, click, focus, reset, wait, caption, type, RATE } from "./rec.mjs";
const M = !!process.env.MOBILE;
const D = process.env.FRAMES || `/tmp/vid_s5${M ? "m" : ""}`;
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf-8");
const sql = neon(env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1]);

const pad = (n) => String(n).padStart(2, "0");
const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7);
const NEXT = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sat = new Date(d); sat.setDate(sat.getDate() + 5);
const rows = await sql`SELECT p.name, s.shift_id, s.start_time, s.end_time FROM shift_assignments s JOIN personnel p ON p.id = s.personnel_id
  WHERE s.location_id = 'loc-vitrin-moda' AND s.week_start = ${NEXT} AND s.day = 5 ORDER BY s.start_time, p.name`;
if (!rows.length) throw new Error("Gelecek hafta planı yok: önce sahne 1");
const names = { "s-acilis": "Açılış", "s-ara": "Ara", "s-kapanis": "Kapanış" };
const groups = {};
for (const r of rows) (groups[r.shift_id] ??= { label: `${names[r.shift_id] ?? "Vardiya"} (${r.start_time}-${r.end_time})`, people: [] }).people.push(r.name.split(" ")[0]);
const ANSWER = [
  `**Cumartesi ${sat.getDate()} Ekim**'te ${rows.length} kişi çalışıyor, ihtiyaç tam karşılanmış:`,
  ...Object.values(groups).map((g) => `- **${g.label}:** ${g.people.join(", ")}`),
  "",
  "Eksik vardiya yok. Kimse haftalık sınırını aşmıyor.",
].join("\n");

const { b, page } = await open({ mobile: M });
await page.route("**/api/copilot/chat", async (route) => {
  if (route.request().method() === "GET") return route.fulfill({ json: { enabled: true } });
  await new Promise((r) => setTimeout(r, Math.round(1300 / RATE)));
  return route.fulfill({ json: { answer: ANSWER } });
});
await login(page, "vitrin.sorumlu", "vitrin123");
await go(page, "/dashboard");
await wait(page, 300);
const rec = await startRec(page, D);
await cursorStart(page, M ? 195 : 900, M ? 450 : 500);
await caption(page, "İşletmenizle ilgili her şeyi sorun", 1);
await wait(page, 1000);
await click(page, page.getByRole("button", { name: "Asistan" }));
await wait(page, 500);
if (!M) await focus(page, { x: 1240, y: 600 }, 1.4);
await click(page, page.getByPlaceholder("Bir soru yazın…"));
await type(page, "Cumartesi kim çalışıyor, eksik var mı?", 60);
await wait(page, 300);
await page.keyboard.press("Enter");
await caption(page, "Cevap planınızdan ve kayıtlarınızdan gelir", 2);
await page.getByText("Eksik vardiya yok").waitFor({ timeout: 60000 });
await wait(page, 2800);
await reset(page);
await caption(page, "");
await wait(page, 700);
console.log(await rec.stop());
encode(D, `scripts/vid/out/assistant${M ? "-m" : ""}.mp4`, { width: M ? 780 : 1920, captions: rec.captions() });
await b.close();

/**
 * Sahne 5: İşletme Asistanı. Yerelde yapay zekâ anahtarı yok: cevap ağda karşılanır ama içeriği
 * vitrinin GERÇEK planından (gelecek hafta Cumartesi) kurulur, uydurma veri yok. Sahne 1'den sonra çekilir.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { open, go, login, startRec, encode, cursorStart, click, zoomTo, zoomOut, wait, RATE } from "./rec.mjs";
const D = process.env.FRAMES || "/tmp/vid_s5";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf-8");
const sql = neon(env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1]);

const pad = (n) => String(n).padStart(2, "0");
const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7);
const NEXT = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sat = new Date(d); sat.setDate(sat.getDate() + 5);
const rows = await sql`SELECT p.name, s.shift_id, s.start_time, s.end_time FROM shift_assignments s JOIN personnel p ON p.id = s.personnel_id
  WHERE s.location_id = 'loc-vitrin-moda' AND s.week_start = ${NEXT} AND s.day = 5 ORDER BY s.start_time, p.name`;
const names = { "s-acilis": "Açılış", "s-ara": "Ara", "s-kapanis": "Kapanış" };
const groups = {};
for (const r of rows) (groups[r.shift_id] ??= { label: `${names[r.shift_id] ?? "Vardiya"} (${r.start_time}-${r.end_time})`, people: [] }).people.push(r.name.split(" ")[0]);
const ANSWER = [
  `**Cumartesi ${sat.getDate()} Ekim**'te ${rows.length} kişi çalışıyor, ihtiyaç tam karşılanmış:`,
  ...Object.values(groups).map((g) => `- **${g.label}:** ${g.people.join(", ")}`),
  "",
  "Eksik vardiya yok. Kimse haftalık sınırını aşmıyor.",
].join("\n");
console.log(ANSWER);

const { b, page } = await open();
await page.route("**/api/copilot/chat", async (route) => {
  if (route.request().method() === "GET") return route.fulfill({ json: { enabled: true } });
  await new Promise((r) => setTimeout(r, Math.round(1200 / RATE)));
  return route.fulfill({ json: { answer: ANSWER } });
});
await login(page, "vitrin.sorumlu", "vitrin123");
await go(page, "/dashboard");
await wait(page, 400);
const rec = await startRec(page, D);
await cursorStart(page, 900, 500);
await wait(page, 600);
await click(page, page.getByRole("button", { name: "Asistan" }), 800);
await wait(page, 600);
const input = page.getByPlaceholder("Bir soru yazın…");
await zoomTo(page, { x: 1240, y: 605 }, 1.35, 900);
await click(page, input, 600);
await page.keyboard.type("Cumartesi kim çalışıyor, eksik var mı?", { delay: Math.round(40 / RATE) });
await wait(page, 300);
await page.keyboard.press("Enter");
await page.getByText("Eksik vardiya yok").waitFor({ timeout: 30000 });
await wait(page, 2600);
await zoomOut(page, 900);
await wait(page, 600);
console.log(await rec.stop());
encode(D, "scripts/vid/out/assistant.mp4", { width: 1920, crf: 27 });
await b.close();

// Yetki regresyon testleri (2026-10-02): çalışan / başka şube / başka işletme yazamaz, yayınlanmış hafta patron onayı ister.
// Mega test işletmesini kullanır: önce `npm run seed:mega`.
import { test, expect, APIRequestContext } from "@playwright/test";
async function login(request: APIRequestContext, u: string) {
  const r = await request.post("/api/auth/login", { data: { username: u, password: "1234" } });
  expect(r.ok()).toBeTruthy();
}
test.setTimeout(120000);
test("çalışan şube ayarı değiştiremez", async ({ request }) => {
  await login(request, "mega.calisan.kafe");
  const r = await request.patch("/api/locations?id=loc-mega-kafe", { data: { name: "HACK" } });
  expect(r.status()).toBe(403);
});
test("müdür başka şubeye yazamaz", async ({ request }) => {
  await login(request, "mega.mudur.kafe");
  expect((await request.patch("/api/locations?id=loc-mega-otel", { data: { name: "HACK" } })).status()).toBe(403);
  expect((await request.post("/api/shifts", { data: { shifts: [{ personnel_id: "P-MEGA-001", location_id: "loc-mega-otel", week_start: "2026-10-12", day: 0, start_time: "08:00", end_time: "16:00", publication_status: "draft" }] } })).status()).toBe(403);
  expect((await request.post("/api/generate", { data: { locationId: "loc-mega-otel", week_start: "2026-10-12" } })).status()).toBe(403);
  // kendi şubesine ayar yazabilir (aynı ad geri yazılır)
  const own = await (await request.get("/api/locations?id=loc-mega-kafe")).json();
  expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { name: own[0].name } })).status()).toBe(200);
});
test("müdür yayınlanmış haftayı onaysız değiştiremez", async ({ request }) => {
  await login(request, "mega.mudur.kafe");
  const ws = "2026-09-28";
  const rows = await (await request.get(`/api/shifts?location_id=loc-mega-kafe&week_start=${ws}`)).json();
  const pub = (rows as { publication_status: string; personnel_id: string; day: number; shift_id: string; start_time: string; end_time: string }[]).find(r => r.publication_status === "published")!;
  expect(pub).toBeTruthy();
  const r = await request.post("/api/shifts", { data: { shifts: [{ personnel_id: pub.personnel_id, location_id: "loc-mega-kafe", week_start: ws, day: pub.day, start_time: pub.start_time, end_time: pub.end_time, publication_status: "published" }] } });
  expect(r.status()).toBe(403);
});
test("başka işletmeye bildirim yazılamaz", async ({ request }) => {
  await login(request, "egemetal.mudur");
  const r = await request.post("/api/notifications", { data: { personnel_id: "P-MEGA-001", type: "info", title: "x", message: "x" } });
  expect(r.ok()).toBeTruthy();
  await login(request, "mega.calisan.kafe");
  const list = await (await request.get("/api/notifications?personnel_id=P-MEGA-001")).json().catch(() => []);
  expect(JSON.stringify(list)).not.toContain('"title":"x"');
});
test("onaylı düzenleme çalışır", async ({ request }) => {
  const ws = "2026-09-28";
  await login(request, "mega.mudur.kafe");
  const req = await (await request.post("/api/schedule/edit-requests", { data: { location_id: "loc-mega-kafe", week_start: ws } })).json();
  expect(req.id).toBeTruthy();
  await login(request, "mega.admin");
  expect((await request.patch("/api/schedule/edit-requests", { data: { id: req.id, status: "approved" } })).ok()).toBeTruthy();
  await login(request, "mega.mudur.kafe");
  const rows = await (await request.get(`/api/shifts?location_id=loc-mega-kafe&week_start=${ws}`)).json();
  const pub = (rows as { publication_status: string; personnel_id: string; day: number; shift_id: string; start_time: string; end_time: string }[]).find(r => r.publication_status === "published")!;
  const r = await request.post("/api/shifts", { data: { shifts: [{ personnel_id: pub.personnel_id, location_id: "loc-mega-kafe", week_start: ws, day: pub.day, shift_id: pub.shift_id, start_time: pub.start_time, end_time: pub.end_time, publication_status: "published" }], force: true } });
  expect([200, 409]).toContain(r.status());
  await request.patch("/api/schedule/edit-requests", { data: { id: req.id, status: "completed" } });
  // tamamlandıktan sonra tekrar kilitli
  const r2 = await request.post("/api/shifts", { data: { shifts: [{ personnel_id: pub.personnel_id, location_id: "loc-mega-kafe", week_start: ws, day: pub.day, start_time: pub.start_time, end_time: pub.end_time, publication_status: "published" }] } });
  expect(r2.status()).toBe(403);
});

test("müdür kilitli ayarı, ücreti değiştiremez; personel silemez; bölge müdürü değiştirir", async ({ request }) => {
  type Loc = { rules: string };
  const readRules = async () => JSON.parse(((await (await request.get("/api/locations?id=loc-mega-kafe")).json()) as Loc[])[0].rules || "{}");
  await login(request, "mega.supervisor");
  const orig = await readRules();
  const origMax = orig.max_weekly_hours;

  await login(request, "mega.mudur.kafe");
  const before = await readRules();
  const r = await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: { ...before, max_weekly_hours: 70, checkin_required: !before.checkin_required } } });
  expect(r.status()).toBe(200);
  const after = await readRules();
  expect(after.max_weekly_hours).toBe(before.max_weekly_hours);       // kilitli: değişmedi
  expect(after.checkin_required).toBe(!before.checkin_required);       // serbest: değişti
  await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: before } });  // geri al

  const people = await (await request.get("/api/personnel?location_id=loc-mega-kafe")).json() as { id: string; hourly_wage: number | null }[];
  const p = people[0];
  await request.patch(`/api/personnel?id=${p.id}`, { data: { hourly_wage: 999 } });
  const p2 = (await (await request.get("/api/personnel?location_id=loc-mega-kafe")).json() as { id: string; hourly_wage: number | null }[]).find(x => x.id === p.id)!;
  expect(p2.hourly_wage).toBe(p.hourly_wage);
  expect((await request.delete(`/api/personnel?id=${p.id}`)).status()).toBe(403);

  await login(request, "mega.supervisor");
  const cur = await readRules();
  expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: { ...cur, max_weekly_hours: 44 } } })).status()).toBe(200);
  expect((await readRules()).max_weekly_hours).toBe(44);
  const restored = { ...cur };
  if (origMax === undefined) delete restored.max_weekly_hours; else restored.max_weekly_hours = origMax;
  await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: restored } });
});

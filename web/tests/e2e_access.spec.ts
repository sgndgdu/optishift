// Yetki regresyon testleri: çalışan / başka şube / başka işletme yazamaz; müdür izinleri (lib/ruleLocks)
// patron/bölge müdürü tarafından şube bazında açılıp kapanır, kapalıyken sunucu da uygular.
// Mega test işletmesini kullanır: önce `npm run seed:mega`.
import { test, expect, APIRequestContext } from "@playwright/test";

type Row = { publication_status: string; personnel_id: string; day: number; shift_id: string; start_time: string; end_time: string };
type Person = { id: string; hourly_wage: number | null };

async function login(request: APIRequestContext, u: string) {
  expect((await request.post("/api/auth/login", { data: { username: u, password: "1234" } })).ok()).toBeTruthy();
}
async function readRules(request: APIRequestContext) {
  const rows = await (await request.get("/api/locations?id=loc-mega-kafe")).json() as { rules: string }[];
  return JSON.parse(rows[0].rules || "{}");
}
/** Bölge müdürü olarak kafenin müdür izinlerini ayarlar (undefined: varsayılana döndür). */
async function setPerms(request: APIRequestContext, perms: Record<string, boolean> | undefined) {
  await login(request, "mega.supervisor");
  const cur = await readRules(request);
  if (perms) cur.manager_permissions = perms; else delete cur.manager_permissions;
  expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: cur } })).ok()).toBeTruthy();
}
async function publishedRow(request: APIRequestContext, ws: string) {
  const rows = await (await request.get(`/api/shifts?location_id=loc-mega-kafe&week_start=${ws}`)).json() as Row[];
  return rows.find(r => r.publication_status === "published")!;
}
const republish = (request: APIRequestContext, ws: string, r: Row) =>
  request.post("/api/shifts", { data: { shifts: [{ personnel_id: r.personnel_id, location_id: "loc-mega-kafe", week_start: ws, day: r.day, shift_id: r.shift_id, start_time: r.start_time, end_time: r.end_time, publication_status: "published" }], force: true } });

test.describe.configure({ mode: "serial" });
test.setTimeout(120000);

test("çalışan şube ayarı değiştiremez", async ({ request }) => {
  await login(request, "mega.calisan.kafe");
  expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { name: "HACK" } })).status()).toBe(403);
});

test("müdür başka şubeye yazamaz", async ({ request }) => {
  await login(request, "mega.mudur.kafe");
  expect((await request.patch("/api/locations?id=loc-mega-otel", { data: { name: "HACK" } })).status()).toBe(403);
  expect((await request.post("/api/shifts", { data: { shifts: [{ personnel_id: "P-MEGA-001", location_id: "loc-mega-otel", week_start: "2026-10-12", day: 0, start_time: "08:00", end_time: "16:00", publication_status: "draft" }] } })).status()).toBe(403);
  expect((await request.post("/api/generate", { data: { locationId: "loc-mega-otel", week_start: "2026-10-12" } })).status()).toBe(403);
  expect((await request.get("/api/events?location_id=loc-mega-otel")).status()).toBe(403);
  const own = await (await request.get("/api/locations?id=loc-mega-kafe")).json();
  expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { name: own[0].name } })).status()).toBe(200);
});

test("başka işletmeye bildirim yazılamaz", async ({ request }) => {
  await login(request, "egemetal.mudur");
  await request.post("/api/notifications", { data: { personnel_id: "P-MEGA-001", type: "info", title: "x", message: "x" } });
  await login(request, "mega.calisan.kafe");
  const list = await (await request.get("/api/notifications?personnel_id=P-MEGA-001")).json().catch(() => []);
  expect(JSON.stringify(list)).not.toContain('"title":"x"');
});

test("yayınlanmış plan: izin kapalıyken onay gerekir, onayla açılır, izin açıkken serbest", async ({ request }) => {
  const ws = "2026-09-28";
  await setPerms(request, { publish_edit: false });
  await login(request, "mega.mudur.kafe");
  const pub = await publishedRow(request, ws);
  expect((await republish(request, ws, pub)).status()).toBe(403);

  const req = await (await request.post("/api/schedule/edit-requests", { data: { location_id: "loc-mega-kafe", week_start: ws } })).json();
  await login(request, "mega.admin");
  expect((await request.patch("/api/schedule/edit-requests", { data: { id: req.id, status: "approved" } })).ok()).toBeTruthy();
  await login(request, "mega.mudur.kafe");
  expect([200, 409]).toContain((await republish(request, ws, pub)).status());
  await request.patch("/api/schedule/edit-requests", { data: { id: req.id, status: "completed" } });
  expect((await republish(request, ws, pub)).status()).toBe(403);

  await setPerms(request, undefined);           // varsayılan: izinli
  await login(request, "mega.mudur.kafe");
  expect([200, 409]).toContain((await republish(request, ws, pub)).status());
});

test("izin kapalıyken müdür kilitli ayarı, ücreti değiştiremez ve silemez; açıkken yapar; izin ayarına dokunamaz", async ({ request }) => {
  await setPerms(request, { rules: false, budget: false, personnel_delete: false });
  await login(request, "mega.mudur.kafe");
  const before = await readRules(request);
  await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: { ...before, max_weekly_hours: 70, checkin_required: !before.checkin_required, manager_permissions: {} } } });
  const after = await readRules(request);
  expect(after.max_weekly_hours).toBe(before.max_weekly_hours);           // kapalı: değişmedi
  expect(after.checkin_required).toBe(!before.checkin_required);           // serbest: değişti
  expect(after.manager_permissions).toEqual(before.manager_permissions);   // izin ayarı korunur
  await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: before } });

  const people = await (await request.get("/api/personnel?location_id=loc-mega-kafe")).json() as Person[];
  const p = people[0];
  await request.patch(`/api/personnel?id=${p.id}`, { data: { hourly_wage: 999 } });
  const p2 = (await (await request.get("/api/personnel?location_id=loc-mega-kafe")).json() as Person[]).find(x => x.id === p.id)!;
  expect(p2.hourly_wage).toBe(p.hourly_wage);
  expect((await request.delete(`/api/personnel?id=${p.id}`)).status()).toBe(403);

  await setPerms(request, undefined);
  await login(request, "mega.mudur.kafe");
  const cur = await readRules(request);
  await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: { ...cur, max_weekly_hours: 44 } } });
  expect((await readRules(request)).max_weekly_hours).toBe(44);
  await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: cur } });
});

test("personel arkadaşlarının ücretini göremez, başka şubenin grubunu okuyamaz, başka işletmeye yazamaz", async ({ request }) => {
  await login(request, "mega.calisan.kafe");
  const ppl = await (await request.get("/api/personnel?location_id=loc-mega-kafe")).json() as Record<string, unknown>[];
  const others = ppl.filter(p => !("weekly_off_day" in p));
  expect(others.length).toBeGreaterThan(0);
  expect(others.every(p => !("hourly_wage" in p) && !("phone" in p))).toBe(true);
  expect((await request.get("/api/messages?group_id=loc-loc-mega-otel")).status()).toBe(403);
  expect((await request.get("/api/messages?group_id=loc-loc-mega-kafe")).status()).toBe(200);
  const contacts = await (await request.get("/api/messages/contacts")).json() as { people: { role: string }[] };
  expect(contacts.people.some(p => p.role === "manager" || p.role === "admin")).toBe(true);
  await login(request, "egemetal.personel");
  const egeUser = (await (await request.get("/api/messages/contacts")).json() as { people: { id: string }[] }).people[0]?.id;
  await login(request, "mega.calisan.kafe");
  if (egeUser) expect((await request.post("/api/messages", { data: { to_user_id: egeUser, content: "x" } })).status()).toBe(403);
});

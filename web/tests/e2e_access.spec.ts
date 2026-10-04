// Yetki regresyon testleri: çalışan / başka şube / başka işletme yazamaz; yöneticinin yetki maddeleri
// (lib/userAccess) kişinin kendisinde durur, işletme sahibi tek tek verir, sunucu uygular.
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
const ALL = ["prepare", "publish", "approvals", "team", "plan_settings", "budget", "cross_branch", "delegate"];
/** İşletme sahibi olarak bir yöneticinin yetki maddelerini ayarlar (undefined: tam yetki). */
async function setPerms(request: APIRequestContext, perms: string[] | undefined, username = "mega.mudur.kafe") {
  await login(request, "mega.admin");
  const users = await (await request.get("/api/users")).json() as { id: string; username: string }[];
  const u = users.find(x => x.username === username)!;
  expect((await request.patch(`/api/users?id=${u.id}`, { data: { access: { perms: perms ?? ALL } } })).ok()).toBeTruthy();
  return u.id;
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

test("yayınlama yetkisi yoksa yayınlanmış plan değişmez, verilince değişir", async ({ request }) => {
  const ws = "2026-09-28";
  try {
    await setPerms(request, ALL.filter(p => p !== "publish" && p !== "delegate"));
    await login(request, "mega.mudur.kafe");
    const pub = await publishedRow(request, ws);
    expect((await republish(request, ws, pub)).status()).toBe(403);
    expect((await request.post("/api/schedule/publish", { data: { location_id: "loc-mega-kafe", week_start: ws } })).status()).toBe(403);

    await setPerms(request, undefined);
    await login(request, "mega.mudur.kafe");
    expect([200, 409]).toContain((await republish(request, ws, pub)).status());
  } finally { await setPerms(request, undefined); }
});

test("yetkisi olmayan madde: ayar korunur, ücret yazılmaz, silemez, onaylayamaz; ek özellik sadece sahipte", async ({ request }) => {
  try {
    await setPerms(request, ["prepare", "publish"]);
    await login(request, "mega.mudur.kafe");
    const before = await readRules(request);
    await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: { ...before, max_weekly_hours: 70, chat_enabled: !(before.chat_enabled !== false) } } });
    const after = await readRules(request);
    expect(after.max_weekly_hours).toBe(before.max_weekly_hours);           // Plan ayarları yok: değişmedi
    expect(after.chat_enabled).toBe(before.chat_enabled);                   // ek özellik: sadece sahip
    expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { name: "HACK" } })).status()).toBe(403);

    const people = await (await request.get("/api/personnel?location_id=loc-mega-kafe")).json() as Person[];
    const p = people[0];
    expect((await request.patch(`/api/personnel?id=${p.id}`, { data: { hourly_wage: 999 } })).status()).toBe(403); // Ekip yok
    expect((await request.delete(`/api/personnel?id=${p.id}`)).status()).toBe(403);
    expect((await request.patch("/api/leave-requests", { data: { id: "x", status: "approved" } })).status()).toBe(403); // Onaylar yok

    // Ekip var, Ücret ve bütçe yok: kişi düzenlenir ama ücret yazılmaz
    await setPerms(request, ["prepare", "team", "plan_settings"]);
    await login(request, "mega.mudur.kafe");
    await request.patch(`/api/personnel?id=${p.id}`, { data: { hourly_wage: 999 } });
    const p2 = (await (await request.get("/api/personnel?location_id=loc-mega-kafe")).json() as Person[]).find(x => x.id === p.id)!;
    expect(p2.hourly_wage).toBe(p.hourly_wage);
    const cur = await readRules(request);
    await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: { ...cur, max_weekly_hours: 44 } } });
    expect((await readRules(request)).max_weekly_hours).toBe(44);           // Plan ayarları var: değişti
    await request.patch("/api/locations?id=loc-mega-kafe", { data: { rules: cur } });
  } finally { await setPerms(request, undefined); }
});

test("yetki verme: kimse kendi yetkisini, üst kademeyi ya da sahip olmadığı maddeyi veremez", async ({ request }) => {
  const mudurId = await setPerms(request, ["prepare", "team", "delegate"]);
  await login(request, "mega.mudur.kafe");
  // Kendi yetkisini değiştiremez
  expect((await request.patch(`/api/users?id=${mudurId}`, { data: { access: { perms: ALL } } })).status()).toBe(403);
  // Şube müdürü kademesi başka şube müdürü ekleyemez, sadece şef
  expect((await request.post("/api/users", { data: { name: "X", role: "manager", location_id: "loc-mega-kafe", access: { perms: ["prepare"] } } })).status()).toBe(403);
  // Bölge müdürü patronun / kendi kademesinin yetkisine dokunamaz
  await login(request, "mega.admin");
  const users = await (await request.get("/api/users")).json() as { id: string; username: string; role: string }[];
  const sup = users.find(u => u.username === "mega.supervisor")!;
  const admin = users.find(u => u.role === "admin")!;
  await login(request, "mega.supervisor");
  expect((await request.patch(`/api/users?id=${sup.id}`, { data: { access: { perms: ALL } } })).status()).toBe(403);
  expect((await request.patch(`/api/users?id=${admin.id}`, { data: { name: "HACK" } })).status()).toBe(403);
  // Verilen yetki verenin maddeleriyle sınırlı: bölge müdürü (tam) şube müdürüne verir; şube müdürü yetkisizse veremez
  await setPerms(request, ["prepare"], "mega.supervisor");
  await login(request, "mega.supervisor");
  expect((await request.patch(`/api/users?id=${mudurId}`, { data: { access: { perms: ALL } } })).status()).toBe(403); // delegate yok
  await setPerms(request, ["prepare", "delegate"], "mega.supervisor");
  await login(request, "mega.supervisor");
  expect((await request.patch(`/api/users?id=${mudurId}`, { data: { access: { perms: ALL } } })).ok()).toBeTruthy();
  await login(request, "mega.admin");
  const after = (await (await request.get("/api/users")).json() as { id: string; permissions: string | null }[]).find(u => u.id === mudurId)!;
  expect(JSON.parse(after.permissions!).perms).toEqual(["prepare", "delegate"]);   // sadece verenin maddeleri
  await setPerms(request, undefined, "mega.supervisor");
  await setPerms(request, undefined);
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

test("bölge müdürü sadece atandığı şubeleri görür ve yönetir", async ({ request }) => {
  await login(request, "mega.admin");
  const created = await (await request.post("/api/users", { data: { name: "Test Bölge", role: "supervisor", managed_location_ids: ["loc-mega-kafe"] } })).json();
  expect(created.user?.username).toBeTruthy();
  try {
    // Patron dışında kimse bölge müdürü ekleyemez
    await login(request, "mega.supervisor");
    expect((await request.post("/api/users", { data: { name: "X", role: "supervisor", managed_location_ids: ["loc-mega-kafe"] } })).status()).toBe(403);
    // Davet bağlantısıyla bölge müdürü olarak oturum aç
    const inv = await request.get(`/api/invite?token=${created.inviteToken}`);
    expect(inv.ok()).toBeTruthy();
    const locs = await (await request.get("/api/locations")).json() as { id: string }[];
    expect(locs.map(l => l.id)).toEqual(["loc-mega-kafe"]);
    expect((await request.get("/api/shifts?location_id=loc-mega-otel&week_start=2026-09-28")).status()).not.toBe(200);
    expect((await request.patch("/api/locations?id=loc-mega-otel", { data: { name: "HACK" } })).status()).toBe(403);
    expect((await request.get("/api/events?location_id=loc-mega-otel")).status()).toBe(403);
    expect((await request.get("/api/events?location_id=loc-mega-kafe")).status()).toBe(200);
  } finally {
    await login(request, "mega.admin");
    await request.delete(`/api/users?id=${created.user.id}`);
  }
});

test("çalışan görünümü: vardiyaya giren yönetici portaldan sadece çalışan yetkisiyle istek yapar", async ({ request }) => {
  const H = { "x-optishift-employee-view": "loc-mega-kafe" };
  await login(request, "mega.admin");
  const users = await (await request.get("/api/users")).json() as { id: string; username: string }[];
  const mudur = users.find(u => u.username === "mega.mudur.kafe")!;
  expect((await request.patch(`/api/users?id=${mudur.id}`, { data: { schedulable: true } })).ok()).toBeTruthy();
  try {
    await login(request, "mega.mudur.kafe");   // yeni oturumda kişi kaydı (personnel_id) var
    const own = await (await request.get("/api/locations?id=loc-mega-kafe")).json();
    // Başlıkla: çalışan gibi, şube ayarı yazamaz; taslak vardiyaları görmez
    expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { name: own[0].name }, headers: H })).status()).toBe(403);
    const rows = await (await request.get("/api/shifts?location_id=loc-mega-kafe&week_start=2026-10-05", { headers: H })).json() as Row[];
    expect(rows.every(r => !r.publication_status || r.publication_status === "published")).toBe(true);
    // Başlıksız: yönetici yetkisi aynen
    expect((await request.patch("/api/locations?id=loc-mega-kafe", { data: { name: own[0].name } })).status()).toBe(200);
  } finally {
    await login(request, "mega.admin");
    await request.patch(`/api/users?id=${mudur.id}`, { data: { schedulable: false } });
  }
});

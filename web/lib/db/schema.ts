import {
  pgTable,
  text,
  integer,
  doublePrecision,
  serial,
  boolean,
  bigint,
  index,
} from "drizzle-orm/pg-core";

// ─── Organizations ────────────────────────────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  connected_erp: text("connected_erp"),
  erp_mapped_fields: text("erp_mapped_fields"), // JSON string

  // SaaS Billing Alanları
  plan: text("plan").default("free"), // free, pro, enterprise
  subscription_status: text("subscription_status").default("active"),
  stripe_customer_id: text("stripe_customer_id"),
  trial_ends_at: bigint("trial_ends_at", { mode: "number" }),

  // God Mode Platform Yönetimi
  suspended_at: bigint("suspended_at", { mode: "number" }),
  suspended_reason: text("suspended_reason"),
  notes: text("notes"),                           // admin iç notu
  feature_flags: text("feature_flags").default("{}"), // JSON
  max_personnel: integer("max_personnel"),        // null = sınırsız
  created_at: bigint("created_at", { mode: "number" }),
  last_activity_at: bigint("last_activity_at", { mode: "number" }),
});

// ─── Locations (Branches) ────────────────────────────────────────────────────
export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  org_id: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  operating_hours: text("operating_hours"), // JSON string
  shift_definitions: text("shift_definitions"), // JSON string
  zone_quotas: text("zone_quotas"), // JSON: {"Kasa": 2, "Reyon": 1}
  rules: text("rules"), // JSON: {max_weekly_hours, min_rest_hours, force_skills_match}
  demand_matrix: text("demand_matrix"), // JSON: {shiftDefId: {day(0-6): count}}
  leave_policy: text("leave_policy"), // JSON: {require_reason, allow_multi_day, max_days_per_request}
  rotation_template: text("rotation_template"), // JSON: RotationTemplate — crew bazlı döngüsel rotasyon
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
});

// ─── Departments ─────────────────────────────────────────────────────────────
export const departments = pgTable("departments", {
  id: text("id").primaryKey(),
  location_id: text("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  demand_matrix: text("demand_matrix"), // JSON: {shiftDefId: {day(0-6): count}}
  manager_id: text("manager_id"), // user_id — departman müdürü
});

// ─── Users (Portal Login) ─────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  personnel_id: text("personnel_id"),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password_hash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"), // admin | supervisor | manager | employee
  display_title: text("display_title"), // "Müdür" | "Müdür Yardımcısı" | "Departman Müdürü" | "Personel"
  org_id: text("org_id").notNull(),
  location_id: text("location_id"),
  department_id: text("department_id"),
  name: text("name").notNull(),
  phone: text("phone"),
  // Hesap yönetim alanları
  is_temp_password: boolean("is_temp_password").default(false),
  approval_status: text("approval_status").default("active"), // active | pending | rejected
  created_by: text("created_by"), // oluşturan kullanıcının user_id'si
  approved_by: text("approved_by"),
  approved_at: bigint("approved_at", { mode: "number" }),
  last_login_at: bigint("last_login_at", { mode: "number" }),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Invite Tokens ────────────────────────────────────────────────────────────
export const inviteTokens = pgTable("invite_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  user_id: text("user_id"),
  org_id: text("org_id").notNull().references(() => organizations.id),
  location_id: text("location_id").references(() => locations.id),
  department_id: text("department_id"),
  invited_name: text("invited_name"),
  role: text("role").notNull().default("employee"),
  created_by: text("created_by").notNull(),
  expires_at: bigint("expires_at", { mode: "number" }).notNull(),
  used_at: bigint("used_at", { mode: "number" }),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Personnel ────────────────────────────────────────────────────────────────
export const personnel = pgTable("personnel", {
  id: text("id").primaryKey(),
  org_id: text("org_id").notNull().references(() => organizations.id),
  primary_location_id: text("primary_location_id")
    .notNull()
    .references(() => locations.id),
  assigned_location_ids: text("assigned_location_ids"), // JSON array
  department_id: text("department_id"),
  user_access_level: text("user_access_level").notNull().default("employee"),
  name: text("name").notNull(),
  employee_id: text("employee_id").notNull(),
  phone: text("phone"),
  email: text("email"),
  hire_date: text("hire_date"),
  contract_end_date: text("contract_end_date"),
  title: text("title"),
  employment_type: text("employment_type").default("full_time"),
  status: text("status").default("active"),
  erp_id: text("erp_id"),
  notes: text("notes"),
  roles: text("roles"), // JSON array of role IDs
  role_levels: text("role_levels"), // JSON object
  preferred_shift_ids: text("preferred_shift_ids"), // JSON array
  preferred_days: text("preferred_days"), // JSON array
  preferred_roles: text("preferred_roles"), // JSON array
  max_weekly_hours: integer("max_weekly_hours").default(45),
  min_weekly_hours: integer("min_weekly_hours").default(0), // part-time alt sınır garantisi, 0 = kapalı
  overtime_approved: boolean("overtime_approved").default(false),
  crew_id: text("crew_id"), // crews tablosuna foreign key (opsiyonel)
  ytd_overtime_hours: doublePrecision("ytd_overtime_hours").default(0), // yılbaşından bu yana fazla mesai saati
  hourly_wage: doublePrecision("hourly_wage"), // saatlik brüt ücret (₺) — mesai maliyeti hesabı için, null = tanımsız
  assigned_department_ids: text("assigned_department_ids"), // JSON array: ["dept-1", "dept-2"]
  prev_score: doublePrecision("prev_score").default(0), // cumulative_burden olarak kullanılıyor (rolling decay)
  fairness_z_score: doublePrecision("fairness_z_score").default(0),
  hero_count: integer("hero_count").default(0),
  no_show_count: integer("no_show_count").default(0),
  late_count: integer("late_count").default(0),
  annual_leave_days_total: integer("annual_leave_days_total").default(14),
  weekly_off_day: integer("weekly_off_day"), // 0=Pzt...6=Paz, null=tanımsız
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
  updated_at: bigint("updated_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Availability (Haftalık Müsaitlik) ───────────────────────────────────────
export const availability = pgTable("availability", {
  id: serial("id").primaryKey(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  week_start: text("week_start").notNull(), // ISO date: "2026-08-22"
  day_0: text("day_0").default("available"), // available | partial | preferred_not | unavailable
  day_1: text("day_1").default("available"),
  day_2: text("day_2").default("available"),
  day_3: text("day_3").default("available"),
  day_4: text("day_4").default("available"),
  day_5: text("day_5").default("available"),
  day_6: text("day_6").default("available"),
  day_0_start: text("day_0_start"),
  day_0_end: text("day_0_end"),
  day_1_start: text("day_1_start"),
  day_1_end: text("day_1_end"),
  day_2_start: text("day_2_start"),
  day_2_end: text("day_2_end"),
  day_3_start: text("day_3_start"),
  day_3_end: text("day_3_end"),
  day_4_start: text("day_4_start"),
  day_4_end: text("day_4_end"),
  day_5_start: text("day_5_start"),
  day_5_end: text("day_5_end"),
  day_6_start: text("day_6_start"),
  day_6_end: text("day_6_end"),
  submitted_at: bigint("submitted_at", { mode: "number" }),
  deadline: text("deadline"), // ISO datetime string
  is_locked: boolean("is_locked").default(false),
});

// ─── Leave Requests (İzin Talepleri) ─────────────────────────────────────────
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  type: text("type").notNull(), // annual | sick | excuse | trade
  start_date: text("start_date").notNull(),
  end_date: text("end_date").notNull(),
  days: integer("days"),
  note: text("note"),
  status: text("status").default("pending"), // pending | approved | rejected
  reviewed_by: text("reviewed_by"),
  reviewed_at: bigint("reviewed_at", { mode: "number" }),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Shift Assignments ───────────────────────────────────────────────────────
export const shiftAssignments = pgTable("shift_assignments", {
  id: serial("id").primaryKey(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  location_id: text("location_id").notNull(),
  week_start: text("week_start").notNull(),
  day: integer("day").notNull(), // 0-6
  shift_id: text("shift_id").notNull(),
  role_id: text("role_id"),
  start_time: text("start_time"),
  end_time: text("end_time"),
  points: doublePrecision("points").default(0),
  status: text("status").default("scheduled"), // scheduled | completed | absent | swapped
  publication_status: text("publication_status").default("published"), // draft | published
  published_at: bigint("published_at", { mode: "number" }), // unix timestamp — haftanın ilk yayın anı
  check_in_at: bigint("check_in_at", { mode: "number" }), // unix timestamp
  check_out_at: bigint("check_out_at", { mode: "number" }), // unix timestamp
  // Zorunlu atama akışı (izinli personele manuel atama)
  force_assigned: boolean("force_assigned").default(false),
  force_acceptance_status: text("force_acceptance_status"), // null | 'pending' | 'accepted' | 'rejected'
  force_bonus_multiplier: doublePrecision("force_bonus_multiplier"), // rules.leave_override_bonus_multiplier snapshot
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Shift Swap Requests ─────────────────────────────────────────────────────
export const shiftSwapRequests = pgTable("shift_swap_requests", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  requester_id: text("requester_id").notNull(), // personnel_id
  requester_name: text("requester_name"),
  target_id: text("target_id").notNull(), // personnel_id
  target_name: text("target_name"),
  requester_shift_id: integer("requester_shift_id")
    .notNull()
    .references(() => shiftAssignments.id),
  target_shift_id: integer("target_shift_id")
    .notNull()
    .references(() => shiftAssignments.id),
  status: text("status").notNull().default("pending"), // pending | peer_accepted | peer_rejected | manager_approved | manager_rejected
  note: text("note"),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Shift Edit Requests ──────────────────────────────────────────────────────
export const shiftEditRequests = pgTable("shift_edit_requests", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  personnel_name: text("personnel_name"),
  shift_id: integer("shift_id")
    .notNull()
    .references(() => shiftAssignments.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  manager_note: text("manager_note"),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Open Shifts (Açık / Acil Vardiyalar) ────────────────────────────────────
export const openShifts = pgTable("open_shifts", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id")
    .notNull()
    .references(() => locations.id),
  date: text("date").notNull(), // YYYY-MM-DD
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  note: text("note"),
  hero_bonus_multiplier: doublePrecision("hero_bonus_multiplier")
    .notNull()
    .default(1.5),
  claimed_by: text("claimed_by"), // personnel_id
  claimed_by_name: text("claimed_by_name"),
  claimed_at: bigint("claimed_at", { mode: "number" }),
  status: text("status").notNull().default("open"), // open | claimed | cancelled
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Push Subscriptions (Web Push VAPID) ─────────────────────────────────────
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  org_id: text("org_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(), // subscription.keys.p256dh
  auth: text("auth").notNull(), // subscription.keys.auth
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Score History (Dönemsel Puan Anlık Görüntüsü) ───────────────────────────
export const scoreHistory = pgTable("score_history", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  personnel_name: text("personnel_name"),
  week_start: text("week_start").notNull(), // ISO Monday date, YYYY-MM-DD
  score: doublePrecision("score").notNull().default(0), // eski alan — geriye dönük uyumluluk
  // Yeni burden breakdown (adalet motoru v2)
  total_hours: doublePrecision("total_hours").default(0),
  raw_score: doublePrecision("raw_score").default(0), // difficulty × hours, modifier yok
  burden_score: doublePrecision("burden_score").default(0), // modifier'lı haftalık yük
  weekend_shifts: integer("weekend_shifts").default(0),
  night_shifts: integer("night_shifts").default(0),
  pref_not_shifts: integer("pref_not_shifts").default(0),
  clopening_count: integer("clopening_count").default(0),
  cumulative_burden: doublePrecision("cumulative_burden").default(0), // rolling decay snapshot
  fairness_z_score: doublePrecision("fairness_z_score").default(0),
  hero_count: integer("hero_count").default(0),
  no_show_count: integer("no_show_count").default(0),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Score Adjustments (Vardiya Dışı Puan Olayları) ──────────────────────────
// prev_score'a doğrudan += yazmak yasaktır; vardiyaya bağlı olmayan telafi/bonus
// puanları buraya olay olarak yazılır ve kümülatif skor lib/scoring.ts tarafından
// deterministik olarak yeniden hesaplanır.
export const scoreAdjustments = pgTable("score_adjustments", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  type: text("type").notNull(), // 'change_comp' | 'manual'
  points: doublePrecision("points").notNull(),
  week_start: text("week_start").notNull(), // ISO Monday date, YYYY-MM-DD
  ref_id: text("ref_id"), // örn. shift_assignments.id
  note: text("note"),
  created_by: text("created_by"),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
}, (t) => [
  index("idx_score_adj_person_week").on(t.personnel_id, t.week_start),
  index("idx_score_adj_loc_week").on(t.location_id, t.week_start),
]);

// ─── Break Sessions (Canlı Mola Takibi) ──────────────────────────────────────
export const breakSessions = pgTable("break_sessions", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id")
    .notNull()
    .references(() => locations.id),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  personnel_name: text("personnel_name"),
  date: text("date").notNull(), // YYYY-MM-DD
  start_at: bigint("start_at", { mode: "number" }).notNull(), // unix timestamp
  end_at: bigint("end_at", { mode: "number" }),
  duration_min: integer("duration_min"),
});

// ─── Messages (Chat Modülü) ───────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  org_id: text("org_id")
    .notNull()
    .references(() => organizations.id),
  from_user_id: text("from_user_id")
    .notNull()
    .references(() => users.id),
  to_user_id: text("to_user_id"), // NULL => group mesajı
  group_id: text("group_id"), // location_id bazlı grup kanalı
  content: text("content").notNull(),
  is_read: boolean("is_read").default(false),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Password Reset Tokens ────────────────────────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  token: text("token").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id),
  expires_at: bigint("expires_at", { mode: "number" }).notNull(), // unix timestamp
  used_at: bigint("used_at", { mode: "number" }),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Location Events (Takvim Etkinlikleri) ───────────────────────────────────
export const locationEvents = pgTable("location_events", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id")
    .notNull()
    .references(() => locations.id),
  date: text("date").notNull(), // YYYY-MM-DD başlangıç tarihi (week scope: week_start)
  end_date: text("end_date"), // YYYY-MM-DD bitiş tarihi — null=tek gün, set=aralık
  title: text("title").notNull(),
  type: text("type").notNull().default("diger"), // kampanya | etkinlik | denetim | kapali | diger
  scope: text("scope").notNull().default("day"), // day | week
  note: text("note"),
  created_by: text("created_by"),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Schedule Edit Requests (Düzenleme Onay Talepleri) ───────────────────────
export const scheduleEditRequests = pgTable("schedule_edit_requests", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull(),
  week_start: text("week_start").notNull(),
  requested_by: text("requested_by").notNull(), // user.id (müdür)
  requested_by_name: text("requested_by_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewed_by: text("reviewed_by"), // user.id (supervisor/admin)
  reviewed_by_name: text("reviewed_by_name"),
  reviewed_at: bigint("reviewed_at", { mode: "number" }),
  note: text("note"), // supervisor notu (opsiyonel)
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Schedule Publications (Yayın Geçmişi) ───────────────────────────────────
export const schedulePublications = pgTable("schedule_publications", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull(),
  week_start: text("week_start").notNull(),
  revision: integer("revision").notNull().default(0), // 0=ilk yayın, 1=R1, 2=R2...
  published_by: text("published_by"), // user_id
  published_by_name: text("published_by_name"),
  published_at: bigint("published_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
  snapshot: text("snapshot"), // JSON: atamaların anlık görüntüsü
});

// ─── Shift Proposals (Müdür → Personel vardiya değişikliği teklifi) ──────────
export const shift_proposals = pgTable("shift_proposals", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  week_start: text("week_start").notNull(),
  current_date: text("current_date").notNull(),
  current_start: text("current_start").notNull(),
  current_end: text("current_end").notNull(),
  proposed_date: text("proposed_date").notNull(),
  proposed_start: text("proposed_start").notNull(),
  proposed_end: text("proposed_end").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Crews (Ekip / Vardiya Grupları — Fabrika Modülü) ────────────────────────
export const crews = pgTable("crews", {
  id: text("id").primaryKey(),
  org_id: text("org_id")
    .notNull()
    .references(() => organizations.id),
  location_id: text("location_id")
    .notNull()
    .references(() => locations.id),
  name: text("name").notNull(), // "A Ekibi", "Sabah Grubu", vb.
  color: text("color").default("#6366f1"), // badge rengi (#hex)
  shift_preference: text("shift_preference"), // tercih edilen shift_def_id (opsiyonel)
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Overtime Records (Fazla Mesai Kayıtları — Fabrika Modülü) ───────────────
export const overtimeRecords = pgTable("overtime_records", {
  id: serial("id").primaryKey(),
  org_id: text("org_id").notNull(),
  location_id: text("location_id")
    .notNull()
    .references(() => locations.id),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  personnel_name: text("personnel_name"),
  week_start: text("week_start").notNull(), // ISO Pazartesi tarihi
  scheduled_hours: doublePrecision("scheduled_hours").notNull(), // o hafta toplam planlanan saat
  overtime_hours: doublePrecision("overtime_hours").notNull(), // eşiği aşan kısım
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  approved_by: text("approved_by"), // user_id
  approved_at: bigint("approved_at", { mode: "number" }),
  // İş Kanunu m.41: fazla mesai işçi onayına tabidir; telafi türünü işçi seçer
  employee_status: text("employee_status").notNull().default("pending"), // pending | accepted | declined
  employee_responded_at: bigint("employee_responded_at", { mode: "number" }),
  compensation_type: text("compensation_type").notNull().default("paid"), // paid (%50 zamlı ücret) | time_off (1 saat → 1,5 saat serbest zaman)
  comp_time_used_at: bigint("comp_time_used_at", { mode: "number" }), // serbest zaman kullandırıldı işareti
  note: text("note"),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  personnel_id: text("personnel_id")
    .notNull()
    .references(() => personnel.id),
  type: text("type").notNull(), // schedule | leave_approved | leave_rejected | trade_request | alert
  title: text("title").notNull(),
  message: text("message").notNull(),
  is_read: boolean("is_read").default(false),
  link: text("link"),
  created_at: bigint("created_at", { mode: "number" }).$defaultFn(
    () => Math.floor(Date.now() / 1000),
  ),
});

// ─── Platform Events (God Mode telemetri) ────────────────────────────────────
export const platformEvents = pgTable("platform_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "or_tools_call" | "login" | "shift_created" | "api_error"
  org_id: text("org_id"),
  org_name: text("org_name"),
  meta: text("meta"),           // JSON string
  created_at: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Admin Audit Log (God Mode işlem geçmişi) ────────────────────────────────
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  target_org_id: text("target_org_id"),
  target_user_id: text("target_user_id"),
  payload: text("payload"),
  ip_address: text("ip_address"),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── System Banners (Platform geneli duyurular) ───────────────────────────────
export const systemBanners = pgTable("system_banners", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"), // info | warning | error
  active: integer("active").notNull().default(1),
  starts_at: bigint("starts_at", { mode: "number" }),
  ends_at: bigint("ends_at", { mode: "number" }),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
});

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Organizations ────────────────────────────────────────────────────────────
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  connected_erp: text("connected_erp"),
  erp_mapped_fields: text("erp_mapped_fields"), // JSON string
  
  // SaaS Billing Alanları
  plan: text("plan").default("free"), // free, pro, enterprise
  subscription_status: text("subscription_status").default("active"),
  stripe_customer_id: text("stripe_customer_id"),
  trial_ends_at: integer("trial_ends_at"),
});

// ─── Locations (Branches) ────────────────────────────────────────────────────
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  org_id: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  operating_hours: text("operating_hours"), // JSON string
  shift_definitions: text("shift_definitions"), // JSON string
  zone_quotas: text("zone_quotas"), // JSON: {"Kasa": 2, "Reyon": 1}
  rules: text("rules"), // JSON: {max_weekly_hours, min_rest_hours, force_skills_match}
  demand_matrix: text("demand_matrix"), // JSON: {shiftDefId: {day(0-6): count}}
  leave_policy: text("leave_policy"),   // JSON: {require_reason, allow_multi_day, max_days_per_request}
  latitude: real("latitude"),
  longitude: real("longitude"),
});

// ─── Departments ─────────────────────────────────────────────────────────────
export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  location_id: text("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
});

// ─── Users (Portal Login) ─────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  personnel_id: text("personnel_id"),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password_hash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"), // admin | supervisor | manager | employee
  org_id: text("org_id").notNull(),
  location_id: text("location_id"),
  department_id: text("department_id"),
  name: text("name").notNull(),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Invite Tokens ────────────────────────────────────────────────────────────
export const inviteTokens = sqliteTable("invite_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  org_id: text("org_id").notNull().references(() => organizations.id),
  location_id: text("location_id").notNull().references(() => locations.id),
  department_id: text("department_id"),
  invited_name: text("invited_name"),
  role: text("role").notNull().default("employee"),
  created_by: text("created_by").notNull(),
  expires_at: integer("expires_at").notNull(),
  used_at: integer("used_at"),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Personnel ────────────────────────────────────────────────────────────────
export const personnel = sqliteTable("personnel", {
  id: text("id").primaryKey(),
  org_id: text("org_id").notNull().references(() => organizations.id),
  primary_location_id: text("primary_location_id").notNull().references(() => locations.id),
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
  overtime_approved: integer("overtime_approved", { mode: "boolean" }).default(false),
  prev_score: real("prev_score").default(0),        // cumulative_burden olarak kullanılıyor (rolling decay)
  fairness_z_score: real("fairness_z_score").default(0),
  hero_count: integer("hero_count").default(0),
  no_show_count: integer("no_show_count").default(0),
  late_count: integer("late_count").default(0),
  annual_leave_days_total: integer("annual_leave_days_total").default(14),
  weekly_off_day: integer("weekly_off_day"), // 0=Pzt...6=Paz, null=tanımsız
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
  updated_at: integer("updated_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Availability (Haftalık Müsaitlik) ───────────────────────────────────────
export const availability = sqliteTable("availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
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
  submitted_at: integer("submitted_at"),
  deadline: text("deadline"), // ISO datetime string
  is_locked: integer("is_locked", { mode: "boolean" }).default(false),
});

// ─── Leave Requests (İzin Talepleri) ─────────────────────────────────────────
export const leaveRequests = sqliteTable("leave_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
  type: text("type").notNull(), // annual | sick | excuse | trade
  start_date: text("start_date").notNull(),
  end_date: text("end_date").notNull(),
  days: integer("days"),
  note: text("note"),
  status: text("status").default("pending"), // pending | approved | rejected
  reviewed_by: text("reviewed_by"),
  reviewed_at: integer("reviewed_at"),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Shift Assignments ───────────────────────────────────────────────────────
export const shiftAssignments = sqliteTable("shift_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
  location_id: text("location_id").notNull(),
  week_start: text("week_start").notNull(),
  day: integer("day").notNull(), // 0-6
  shift_id: text("shift_id").notNull(),
  role_id: text("role_id"),
  start_time: text("start_time"),
  end_time: text("end_time"),
  points: real("points").default(0),
  status: text("status").default("scheduled"), // scheduled | completed | absent | swapped
  publication_status: text("publication_status").default("published"), // draft | published
  published_at: integer("published_at"), // unix timestamp — haftanın ilk yayın anı (yayın öncülüğü KPI'ı)
  check_in_at: integer("check_in_at"),   // unix timestamp
  check_out_at: integer("check_out_at"), // unix timestamp
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Shift Swap Requests ─────────────────────────────────────────────────────
export const shiftSwapRequests = sqliteTable("shift_swap_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  org_id: text("org_id").notNull(),
  requester_id: text("requester_id").notNull(), // personnel_id
  requester_name: text("requester_name"),
  target_id: text("target_id").notNull(),       // personnel_id
  target_name: text("target_name"),
  requester_shift_id: integer("requester_shift_id").notNull().references(() => shiftAssignments.id),
  target_shift_id: integer("target_shift_id").notNull().references(() => shiftAssignments.id),
  status: text("status").notNull().default("pending"), // pending | peer_accepted | peer_rejected | manager_approved | manager_rejected
  note: text("note"),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Shift Edit Requests ──────────────────────────────────────────────────────
export const shiftEditRequests = sqliteTable("shift_edit_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  org_id: text("org_id").notNull(),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
  personnel_name: text("personnel_name"),
  shift_id: integer("shift_id").notNull().references(() => shiftAssignments.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  manager_note: text("manager_note"),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Open Shifts (Açık / Acil Vardiyalar) ────────────────────────────────────
export const openShifts = sqliteTable("open_shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull().references(() => locations.id),
  date: text("date").notNull(),        // YYYY-MM-DD
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  note: text("note"),
  hero_bonus_multiplier: real("hero_bonus_multiplier").notNull().default(1.5),
  claimed_by: text("claimed_by"),      // personnel_id
  claimed_by_name: text("claimed_by_name"),
  claimed_at: integer("claimed_at"),
  status: text("status").notNull().default("open"), // open | claimed | cancelled
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Push Subscriptions (Web Push VAPID) ─────────────────────────────────────
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
  org_id: text("org_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),   // subscription.keys.p256dh
  auth: text("auth").notNull(),        // subscription.keys.auth
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Score History (Dönemsel Puan Anlık Görüntüsü) ───────────────────────────
export const scoreHistory = sqliteTable("score_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull(),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
  personnel_name: text("personnel_name"),
  week_start: text("week_start").notNull(), // ISO Monday date, YYYY-MM-DD
  score: real("score").notNull().default(0),         // eski alan — geriye dönük uyumluluk
  // Yeni burden breakdown (adalet motoru v2)
  total_hours: real("total_hours").default(0),
  raw_score: real("raw_score").default(0),           // difficulty × hours, modifier yok
  burden_score: real("burden_score").default(0),     // modifier'lı haftalık yük
  weekend_shifts: integer("weekend_shifts").default(0),
  night_shifts: integer("night_shifts").default(0),
  pref_not_shifts: integer("pref_not_shifts").default(0),
  clopening_count: integer("clopening_count").default(0),
  cumulative_burden: real("cumulative_burden").default(0), // rolling decay snapshot
  fairness_z_score: real("fairness_z_score").default(0),
  hero_count: integer("hero_count").default(0),
  no_show_count: integer("no_show_count").default(0),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Break Sessions (Canlı Mola Takibi) ──────────────────────────────────────
export const breakSessions = sqliteTable("break_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull().references(() => locations.id),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
  personnel_name: text("personnel_name"),
  date: text("date").notNull(), // YYYY-MM-DD
  start_at: integer("start_at").notNull(), // unix timestamp
  end_at: integer("end_at"),
  duration_min: integer("duration_min"),
});

// ─── Messages (Chat Modülü) ───────────────────────────────────────────────────
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  org_id: text("org_id").notNull().references(() => organizations.id),
  from_user_id: text("from_user_id").notNull().references(() => users.id),
  to_user_id: text("to_user_id"),   // NULL => group mesajı
  group_id: text("group_id"),        // location_id bazlı grup kanalı
  content: text("content").notNull(),
  is_read: integer("is_read", { mode: "boolean" }).default(false),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Password Reset Tokens ────────────────────────────────────────────────────
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  token: text("token").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  expires_at: integer("expires_at").notNull(), // unix timestamp
  used_at: integer("used_at"),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Location Events (Takvim Etkinlikleri) ───────────────────────────────────
export const locationEvents = sqliteTable("location_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  org_id: text("org_id").notNull(),
  location_id: text("location_id").notNull().references(() => locations.id),
  date: text("date").notNull(),       // YYYY-MM-DD
  title: text("title").notNull(),
  type: text("type").notNull().default("diger"), // kampanya | etkinlik | denetim | kapali | diger
  note: text("note"),
  created_by: text("created_by"),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personnel_id: text("personnel_id").notNull().references(() => personnel.id),
  type: text("type").notNull(), // schedule | leave_approved | leave_rejected | trade_request | alert
  title: text("title").notNull(),
  message: text("message").notNull(),
  is_read: integer("is_read", { mode: "boolean" }).default(false),
  link: text("link"),
  created_at: integer("created_at").$defaultFn(() => Math.floor(Date.now() / 1000)),
});

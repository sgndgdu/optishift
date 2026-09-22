export type Availability = "available" | "preferred_not" | "unavailable";
export type Zone = string;
export type LeaveType = "annual" | "sick" | "excuse";
export type UserRole = "admin" | "supervisor" | "manager" | "employee";

export interface Organization {
  id: string;
  name: string;
  connected_erp?: string;
  erp_mapped_fields?: Record<string, string>;
}

export interface DailyHours {
  isOpen: boolean;
  open: string;
  close: string;
}

// ─── Ekip (Crew) — Fabrika Modülü ────────────────────────────────────────────
export interface Crew {
  id: string;
  org_id: string;
  location_id: string;
  name: string;
  color: string;           // #hex badge rengi
  shift_preference?: string; // tercih edilen shift_def_id
  created_at?: number;
}

// ─── Personnel Conflict (Sosyal Kurallar — Birlikte Çalışamaz) ───────────────
export interface PersonnelConflict {
  id: number;
  org_id: string;
  location_id: string;
  personnel_id_a: string;
  personnel_id_b: string;
  note?: string | null;
  created_at?: number;
}

// ─── Personnel Document (Belge/Sertifika Uyumluluğu) ─────────────────────────
export interface PersonnelDocument {
  id: number;
  org_id: string;
  personnel_id: string;
  doc_type: string;
  expiry_date: string; // "YYYY-MM-DD"
  note?: string | null;
  created_at?: number;
}

export interface WebauthnCredential {
  id: number;
  device_name: string | null;
  created_at: number;
  last_used_at: number | null;
}

// ─── Rotasyon Şablonu — Fabrika Modülü ───────────────────────────────────────
export interface RotationTemplate {
  enabled: boolean;
  type: "3-shift" | "continental" | "4x10" | "custom";
  cycle_weeks: number;          // döngü uzunluğu (hafta)
  reference_week: string;       // döngünün başlangıç haftası (ISO Pazartesi)
  // crew_id → haftaya göre (0-based) atanan shift_def_id listesi
  // Örn: { "crew-a": ["shift-1", "shift-2", "shift-3"] }
  pattern: Record<string, string[]>;
}

// ─── Fazla Mesai Kaydı — Fabrika Modülü ──────────────────────────────────────
export interface OvertimeRecord {
  id: number;
  org_id: string;
  location_id: string;
  personnel_id: string;
  personnel_name?: string;
  week_start: string;
  scheduled_hours: number;
  overtime_hours: number;
  status: "pending" | "approved" | "rejected";
  approved_by?: string;
  approved_at?: number;
  /** İş K. m.41 — personel onayı: fazla mesai işçinin kabulüne tabidir */
  employee_status: "pending" | "accepted" | "declined";
  employee_responded_at?: number;
  /** Telafi türü (işçi seçer): zamlı ücret (%50) veya serbest zaman (1s → 1,5s izin) */
  compensation_type: "paid" | "time_off";
  comp_time_used_at?: number;
  note?: string;
  created_at: number;
}

export interface Location {
  id: string;
  org_id: string;
  name: string;
  operating_hours: Record<number, DailyHours>;
  shift_definitions: ShiftDefinition[];
  zone_quotas: Record<string, number>; // {"Kasa": 2, "Reyon": 1}
  // Kural motoru — resmi alanlar ScheduleRules'ta; UI'nın yazdığı ek ad-hoc
  // alanlar (çarpanlar, toggle'lar) için index signature ile genişletilir
  rules?: Partial<ScheduleRules> & Record<string, unknown>;
  // Kapasite matrisi: shiftDefId → { day(0-6) → gerekli kişi sayısı }
  demand_matrix?: Record<string, Record<number, number>>;
  rotation_template?: RotationTemplate;
  task_templates?: Record<string, string[]>; // {shiftDefId veya "*": ["Kasa Sayımı", ...]}
  latitude?: number;
  longitude?: number;
  self_signup_token?: string | null;
}

export interface LocationEvent {
  id: number;
  org_id: string;
  location_id: string;
  date: string;      // YYYY-MM-DD başlangıç (week scope: week_start)
  end_date?: string; // YYYY-MM-DD bitiş — null=tek gün, set=aralık
  title: string;
  type: "kampanya" | "etkinlik" | "denetim" | "kapali" | "diger";
  scope: "day" | "week"; // day = güne özel (tek gün veya aralık), week = haftanın tamamı
  note?: string;
  created_by?: string;
  created_at?: number;
}

export interface Department {
  id: string;
  location_id: string;
  name: string;
  demand_matrix?: Record<string, Record<number, number>>; // shiftDefId → {day(0-6) → count}
}

export interface Role {
  id: string;
  department_id: string;
  name: string;
  difficulty_bonus: number;
  min_per_shift: Record<string, number>;
  daily_coverage?: Record<number, Record<string, number>>; // Day(0-6) -> Shift_ID -> count
  difficulty_note?: string;
}

export interface LeaveRecord {
  id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  note: string;
}

export type EmploymentType = "full_time" | "part_time" | "intern";
export type PersonnelStatus = "active" | "inactive" | "on_leave";
export type SkillLevel = "primary" | "secondary";

// ─── Vardiya Tanımı ───────────────────────────────────────────────────────────

/**
 * Bir vardiyayı tamamen tanımlar. Kaç vardiya olduğu, saatleri ve zorluk ağırlığı
 * branch bazında admin tarafından belirlenir — 2 vardiyalı kafe de 3 vardiyalı
 * restoran da aynı sistemi kullanır.
 */
export interface ShiftDefinition {
  id: string;          // sabit unique id, örn. "s1" — localStorage key olarak kullanılır
  name: string;        // "Açılış", "Kapanış", "Ara Vardiya" vb.
  start: string;       // "HH:MM"
  end: string;         // "HH:MM"
  base_points: number; // 1–10, bu vardiyayı OR-Tools'a ne kadar "ağır" göstereceği
  is_night?: boolean;  // gece vardiyası — adalet motorunda "zor vardiya" sayılabilir (hard_shift_night)
  coverage?: Record<string, number>; // role_id -> required_count
  required_skills?: { skill: string; count: number }[]; // bu vardiyada bulunması ZORUNLU yetkinlikler (örn. gece ≥1 bakımcı) — motor hard kısıt uygular
}

// ─── Eski ZoneConfig yerine yeni Role interface'i yukarı eklendi ──────────────────────────────────────────────────────


// ─── Kural Motoru ─────────────────────────────────────────────────────────────

export type SkillsMatchMode = "required" | "warn" | "off";

export interface ScheduleRules {
  max_weekly_hours: number;   // yasal üst sınır, varsayılan 45
  min_rest_hours: number;     // iki vardiya arası min dinlenme, varsayılan 11
  skills_match: SkillsMatchMode;
  clopening_min_rest_hours?: number;        // bu saatin altındaki ardışık gün geçişi "clopening" sayılır (SADECE yayın öncesi kural ihlali uyarısı için, adalet puanını etkilemez), varsayılan 13
  change_compensation_points?: number;      // yayınlanmış vardiya değişince personele yazılan telafi puanı, varsayılan 2
  change_compensation_enabled?: boolean;    // değişiklik telafisi on/off
  // Adalet puanı — additive model (2026-09-20 rewrite): tek "zor vardiya" puanı + bonuslar, 0 = kapalı
  hard_shift_points?: number;        // zor vardiya (hafta sonu/gece/sarı gün) düz puanı, varsayılan 4
  hard_shift_weekend?: boolean;      // hafta sonu "zor vardiya" sayılsın mı, varsayılan true
  hard_shift_night?: boolean;        // gece "zor vardiya" sayılsın mı, varsayılan true
  hard_shift_preferred_not?: boolean; // sarı gün "zor vardiya" sayılsın mı, varsayılan true
  hero_bonus_points?: number;        // açık vardiya üstlenme (kahraman) düz bonus puanı, varsayılan 6
  force_bonus_points?: number;       // izinliyken kabul edilen zorunlu atama düz bonus puanı, varsayılan 5
  fairness_window_weeks?: number;    // kümülatif puan penceresi (hafta), decay YOK — düz toplam, varsayılan 4
  availability_collection_enabled?: boolean; // varsayılan true — kapalıysa vardiyaları müdür tek başına planlar, personelden müsaitlik istenmez
  checkin_required?: boolean;       // açıksa check-in yapmayan personel "geç kalan" sayılır (varsayılan false — check-in bilgi amaçlı, geç sayılmaz)
  gps_checkin_required?: boolean;   // açıksa şubeye checkin_radius_m'den uzak check-in reddedilir (varsayılan: sadece bilgilendirir, engellemez)
  checkin_radius_m?: number;        // GPS doğrulama yarıçapı (metre), varsayılan 150
  availability_reminder?: {
    enabled: boolean;
    day: number;             // 0=Pzt … 6=Paz — hatırlatmanın planlandığı gün
    time: string;            // "HH:MM"
    last_sent_week?: string; // ISO Pazartesi (YYYY-MM-DD) — bu hafta gönderildiyse tekrar gönderilmez
  };
  // Fabrika modülü — fazla mesai
  simple_mode?: boolean;               // basit mod: sidebar 6 öğe + sade ayarlar (KOBİ varsayılanı; sektör preset'i belirler)
  overtime_threshold_hours?: number;   // haftalık eşik: bu saatin üzeri mesai sayılır (varsayılan 45)
  max_ytd_overtime_hours?: number;     // yıllık fazla mesai üst sınırı (İş Kanunu: 270 saat)
  weekly_overtime_budget_hours?: number; // tüm personelin haftalık toplam mesai bütçesi (0/undefined = limitsiz)
  weekly_labor_budget_try?: number;    // haftalık planlanan işçilik maliyeti üst sınırı (₺, 0/undefined = limitsiz)
  overtime_fair_distribution?: boolean; // adil mesai dağılımı — az mesai yapana öncelik
  // Fabrika modülü — ekip/rotasyon
  crew_same_shift_hard?: boolean;      // true → aynı ekip üyeleri kesinlikle aynı vardiyaya
  // Gece koruması (Postalar Yönetmeliği)
  consecutive_night_weeks_enabled?: boolean; // true → geçen hafta gece çalışan bu hafta gece vardiyası alamaz (m.8)
  // Denkleştirme dönemi (İş K. m.63): N haftalık pencerede ortalama max_weekly_hours garantisi;
  // tek hafta tavanı 66 saat. 0/undefined = kapalı (haftalık katı limit geçerli)
  balancing_period_weeks?: number;
  night_legal_warning_enabled?: boolean; // varsayılan true — gece vardiyası >7,5s uyarısı (editör + yayın ihlali)
  handover_notes_enabled?: boolean;      // varsayılan true — check-out'ta devir notu modalı + sonraki vardiyaya not kartı
  auto_leave_entitlement_enabled?: boolean; // varsayılan false — açıkken yıllık izin hakkı kıdeme göre otomatik (İş K. m.53, kümülatif devir); kapalıyken sabit annual_leave_days_total
  // İleri seviye modüller (hepsi varsayılan false — Ayarlar'dan açılır)
  compliance_tracking_enabled?: boolean; // açıkken: süresi dolmuş belgesi olan personel o haftaki plana hiç dahil edilmez (bkz. app/api/generate/route.ts)
  task_management_enabled?: boolean; // açıkken: yeni vardiya atanınca locations.task_templates'ten shift_tasks otomatik oluşturulur
  tip_pooling_enabled?: boolean; // açıkken: müdür bahşiş havuzu açıp dönemi dağıtabilir, personel portalında "kazanılan prim" kartı görünür
  kiosk_mode_enabled?: boolean; // açıkken: /kiosk/{location_id} ortak tablet PIN girişiyle check-in/check-out yapabilir (oturumsuz)
  shift_bidding_enabled?: boolean; // açıkken: açık vardiyalara doğrudan kabul yerine teklif verilir, müdür teklifler arasından seçer
  forecasting_enabled?: boolean; // açıkken: kapasite matrisi hücrelerinde geçmiş haftalardan türetilen tahmin gösterilir
}

// ─── Shift Task (Görev ve Kontrol Listeleri) ─────────────────────────────────
export interface ShiftTask {
  id: number;
  org_id: string;
  location_id: string;
  shift_assignment_id: number;
  task_description: string;
  is_completed: boolean;
  completed_at?: number | null;
  created_at?: number;
}

// ─── Satış Verisi (Talep Tahmini) ─────────────────────────────────────────────
export interface SalesDataPoint {
  id: number;
  location_id: string;
  date: string; // YYYY-MM-DD
  revenue?: number | null;
  footfall?: number | null;
  created_at?: number;
}

// ─── Shift Bid (Tersine Vardiya Pazarı) ──────────────────────────────────────
export interface ShiftBid {
  id: number;
  open_shift_id: number;
  personnel_id: string;
  requested_bonus_points: number;
  note?: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at?: number;
}

// ─── Tip Pool (Dijital Bahşiş ve Prim Dağıtımı) ──────────────────────────────
export interface TipPool {
  id: number;
  org_id: string;
  location_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  distributed_amount: number;
  status: "draft" | "distributed";
  created_by?: string | null;
  created_at?: number;
}

export interface TipAllocation {
  id: number;
  tip_pool_id: number;
  personnel_id: string;
  worked_minutes: number;
  amount: number;
  created_at?: number;
}

// Gece çalışma yasağı nedeni (İş K. m.73 + Postalar Yönetmeliği)
export type NightRestriction = "pregnant" | "nursing" | "under18" | "medical";

// ─── Personel ─────────────────────────────────────────────────────────────────

export interface Personnel {
  id: string;
  org_id: string;
  assigned_location_ids: string[]; // Artık personel birden çok lokasyonda çalışabilir
  primary_location_id: string;
  department_id?: string;          // birincil departman (geriye dönük uyumluluk)
  assigned_department_ids?: string[]; // birden fazla departman atanabilir
  user_access_level: UserRole; // role yerine user_access_level
  name: string;
  employee_id: string;
  phone: string;
  email: string;
  hire_date: string;
  contract_end_date: string;
  title: string;
  employment_type: EmploymentType;
  status: PersonnelStatus;
  erp_id: string;
  notes: string;
  roles: string[]; // skills yerine personelin yapabileceği rollerin ID'leri
  role_levels: Record<string, SkillLevel>; // skill_levels yerine role_levels
  availability: Record<number, Availability>;
  preferred_shift_ids: string[];
  preferred_days: number[];
  preferred_roles: string[]; // preferred_zones yerine
  max_weekly_hours: number;
  min_weekly_hours?: number; // part-time alt sınır garantisi, 0/undefined = kapalı
  overtime_approved: boolean;
  crew_id?: string;              // crews tablosuna referans (fabrika modülü)
  ytd_overtime_hours?: number;   // yılbaşından bu yana fazla mesai saati
  hourly_wage?: number | null;   // saatlik brüt ücret (₺) — mesai maliyeti hesabı için
  night_restriction?: NightRestriction | null; // gece çalışma yasağı — motor gece vardiyasına atamaz
  leave_adjustment_days?: number; // yıllık izin elle düzeltme (±gün) — kalan izin lib/leave.ts'ten türetilir
  prev_score: number;
  hero_count: number;
  no_show_count: number;
  late_count: number;
  annual_leave_days_total: number;
  leave_records: LeaveRecord[];
  kiosk_pin_set?: boolean; // türetilmiş — ham bcrypt hash asla client'a dönmez
}

// ─── Vardiya Ataması ──────────────────────────────────────────────────────────

export interface ShiftAssignment {
  personnelId: string;
  day: number;
  shiftId: number;  // shifts dizisindeki index (0, 1, 2…)
  role_id?: string; // zone yerine role_id
  start_time?: string; // override edilen başlangıç saati
  end_time?: string;   // override edilen bitiş saati
  points: number;
}

export interface WeekSchedule {
  assignments: ShiftAssignment[];
  fairnessGap: number;
  scores: Record<string, number>;
}

// ─── Puan Olayları (score_adjustments) ────────────────────────────────────────
// Vardiyaya bağlı olmayan telafi/bonus puanları; prev_score'a doğrudan yazılmaz,
// kümülatif skor lib/scoring.ts tarafından bu olaylardan yeniden hesaplanır.

export interface ScoreAdjustment {
  id: number;
  org_id: string;
  location_id: string;
  personnel_id: string;
  type: "change_comp" | "manual";
  points: number;
  week_start: string; // ISO Pazartesi, YYYY-MM-DD
  ref_id?: string | null;
  note?: string | null;
  created_by?: string | null;
  created_at: number;
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const DAYS = [
  "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
] as const;

// ─── Puan Hesaplama ───────────────────────────────────────────────────────────

/**
 * Gün × Vardiya × Alan bonusu formülü.
 *
 * isLastShift: bu vardiya günün son (kapanış) vardiyası mı?
 *   → Pazar'da kapanış olması 10p minimum garantisi verir.
 * basePoints: ShiftDefinition.base_points'ten gelir — hardcode değil.
 * difficultyBonus: ZoneConfig.difficulty_bonus'tan gelir.
 */
export function calcPoints(
  day: number,
  isLastShift: boolean,
  basePoints: number,
  difficultyBonus = 0,
): number {
  let base = basePoints;
  const isFriSat = day === 4 || day === 5;
  const isSunday = day === 6;

  if (isFriSat)              base = Math.max(base, 8);
  if (isSunday && isLastShift) base = Math.max(base, 10);
  else if (isSunday)         base = Math.max(base, 5);

  return base + difficultyBonus;
}

// ─── Availability ─────────────────────────────────────────────────────────────

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available:     "Müsait",
  preferred_not: "Tercih Etmiyorum",
  unavailable:   "Kesinlikle Gelemem",
};

export const AVAILABILITY_COLORS: Record<Availability, string> = {
  available:     "bg-green-500",
  preferred_not: "bg-yellow-400",
  unavailable:   "bg-red-500",
};

// ─── Promo Code (Kampanya / Referans Kodu) ───────────────────────────────────
export interface PromoCode {
  id: number;
  code: string;
  campaign_name: string | null;
  plan: string;
  free_months: number;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  expires_at: number | null;
  created_at: number;
}

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

export interface Location {
  id: string;
  org_id: string;
  name: string;
  operating_hours: Record<number, DailyHours>;
  shift_definitions: ShiftDefinition[];
  zone_quotas: Record<string, number>; // {"Kasa": 2, "Reyon": 1}
  rules?: { max_weekly_hours: number; min_rest_hours: number; force_skills_match: boolean };
  // Kapasite matrisi: shiftDefId → { day(0-6) → gerekli kişi sayısı }
  demand_matrix?: Record<string, Record<number, number>>;
}

export interface Department {
  id: string;
  location_id: string;
  name: string;
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
  is_night?: boolean;  // gece vardiyası — adalet motoru night_multiplier uygular
  coverage?: Record<string, number>; // role_id -> required_count
}

// ─── Eski ZoneConfig yerine yeni Role interface'i yukarı eklendi ──────────────────────────────────────────────────────


// ─── Kural Motoru ─────────────────────────────────────────────────────────────

export type SkillsMatchMode = "required" | "warn" | "off";

export interface ScheduleRules {
  max_weekly_hours: number;   // yasal üst sınır, varsayılan 45
  min_rest_hours: number;     // iki vardiya arası min dinlenme, varsayılan 11
  skills_match: SkillsMatchMode;
  clopening_min_rest_hours?: number;   // bu saatin altındaki ardışık gün geçişi "clopening" sayılır, varsayılan 13
  change_compensation_points?: number; // yayınlanmış vardiya değişince personele yazılan telafi puanı, varsayılan 2
}

// ─── Personel ─────────────────────────────────────────────────────────────────

export interface Personnel {
  id: string;
  org_id: string;
  assigned_location_ids: string[]; // Artık personel birden çok lokasyonda çalışabilir
  primary_location_id: string;
  department_id?: string;
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
  prev_score: number;
  hero_count: number;
  no_show_count: number;
  late_count: number;
  annual_leave_days_total: number;
  leave_records: LeaveRecord[];
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

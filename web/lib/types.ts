export type Availability = "available" | "preferred_not" | "unavailable";
export type Zone = string;
export type LeaveType = "annual" | "sick" | "excuse";

export interface LeaveRecord {
  id: string;
  type: LeaveType;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  days: number;       // iş günü
  note: string;
}
export type EmploymentType = "full_time" | "part_time" | "intern";
export type PersonnelStatus = "active" | "inactive" | "on_leave";
export type SkillLevel = "primary" | "secondary";
export type PreferredShift = "morning" | "evening" | "any";

export const PREDEFINED_ZONES: Zone[] = ["Kasa", "Reyon", "Teras", "Mutfak"];

export interface Personnel {
  id: string;
  name: string;
  // Kimlik & İletişim
  employee_id: string;
  phone: string;
  email: string;
  hire_date: string;          // YYYY-MM-DD
  contract_end_date: string;  // "" = belirsiz süreli
  // Pozisyon
  title: string;
  employment_type: EmploymentType;
  status: PersonnelStatus;
  erp_id: string;
  notes: string;
  // Çalışma alanları — hangi istasyonlarda çalışabilir (OR-Tools'a girer)
  skills: Zone[];
  skill_levels: Record<string, SkillLevel>;
  // Vardiya tercihleri
  availability: Record<number, Availability>; // 0=Pzt … 6=Paz
  preferred_shift: PreferredShift;
  max_weekly_hours: number;
  overtime_approved: boolean;
  // Performans & Güvenilirlik
  prev_score: number;
  hero_count: number;
  no_show_count: number;
  late_count: number;
  // İzin Yönetimi
  annual_leave_days_total: number; // 0 = kıdeme göre otomatik
  leave_records: LeaveRecord[];
}

export interface ShiftAssignment {
  personnelId: string;
  day: number;
  shiftId: 0 | 1; // 0=Sabah, 1=Akşam
  points: number;
}

export interface WeekSchedule {
  assignments: ShiftAssignment[];
  fairnessGap: number;
  scores: Record<string, number>;
}

export const DAYS = [
  "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
] as const;

export const SHIFT_NAMES = [
  "Sabah Açılış (08-16)",
  "Akşam Kapanış (16-24)",
] as const;

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

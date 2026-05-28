export type Availability = "available" | "preferred_not" | "unavailable";

export type Zone = "Kasa" | "Reyon" | "Teras" | "Mutfak";

export interface Personnel {
  id: string;
  name: string;
  skills: Zone[];
  prev_score: number;
  availability: Record<number, Availability>; // 0=Pzt … 6=Paz
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
  scores: Record<string, number>; // personnelId → toplam puan
}

export const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;

export const SHIFT_NAMES = ["Sabah Açılış (08-16)", "Akşam Kapanış (16-24)"] as const;

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Müsait",
  preferred_not: "Tercih Etmiyorum",
  unavailable: "Gelemem",
};

export const AVAILABILITY_COLORS: Record<Availability, string> = {
  available: "bg-green-500",
  preferred_not: "bg-yellow-400",
  unavailable: "bg-red-500",
};

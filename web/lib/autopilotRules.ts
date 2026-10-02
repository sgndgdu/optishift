/* eslint-disable @typescript-eslint/no-explicit-any */
import { addDays } from "@/lib/date";

/**
 * Otomatik pilotun saf kuralları (istemci de kullanır: Ana Sayfa, Vardiya Planı, Ayarlar).
 * Çalıştırıcı: lib/autopilot.ts (sunucu, cron).
 */
export const AUTOPILOT_DEFAULT_DAY = 3; // Perşembe

export type AutopilotRules = { enabled?: boolean; day?: number; last_run_week?: string; last_draft_week?: string };

export function autopilotSettings(rules: any): { enabled: boolean; day: number } {
  const ap = rules?.autopilot ?? {};
  const day = Number.isInteger(ap.day) && ap.day >= 0 && ap.day <= 6 ? ap.day : AUTOPILOT_DEFAULT_DAY;
  return { enabled: ap.enabled !== false, day };
}

export type AutopilotDecision =
  | { run: true; targetWeek: string }
  | { run: false; reason: "disabled" | "not_due" | "already_ran" | "week_started" | "no_demand" | "no_setup" };

/**
 * Saf karar: bugün bu şube için taslak hazırlanmalı mı?
 * Gün kaçtıysa (cron o gün çalışmadıysa) hafta içinde sonraki günlerde telafi edilir.
 * Gelecek haftada herhangi bir satır (taslak/yayın) varsa müdür zaten başlamıştır: dokunulmaz.
 */
export function autopilotDecision(a: {
  rules: any;
  todayIdx: number;          // Pzt=0
  weekStart: string;         // bu haftanın pazartesisi
  nextWeekRows: number;
  hasDemand: boolean;
  hasSetup: boolean;         // vardiya tanımı + personel var
}): AutopilotDecision {
  const s = autopilotSettings(a.rules);
  if (!s.enabled) return { run: false, reason: "disabled" };
  if (a.todayIdx < s.day) return { run: false, reason: "not_due" };
  if (a.rules?.autopilot?.last_run_week === a.weekStart) return { run: false, reason: "already_ran" };
  if (!a.hasSetup) return { run: false, reason: "no_setup" };
  // İhtiyaç tablosu hiç doldurulmadıysa motor herkesi haftalık sınıra kadar yazar: ilk planı müdür sihirbazla yapar
  if (!a.hasDemand) return { run: false, reason: "no_demand" };
  if (a.nextWeekRows > 0) return { run: false, reason: "week_started" };
  return { run: true, targetWeek: addDays(a.weekStart, 7) };
}

export function matrixHasDemand(raw: unknown): boolean {
  try {
    const m = typeof raw === "string" ? JSON.parse(raw) : raw;
    return !!m && Object.values(m as Record<string, Record<string, number>>).some(row =>
      row && Object.values(row).some(v => Number(v) > 0));
  } catch { return false; }
}

export const AUTOPILOT_DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/* eslint-disable @typescript-eslint/no-explicit-any */
import { addDays } from "@/lib/date";

/**
 * Otomatik pilotun saf kuralları (istemci de kullanır: Ana Sayfa, Vardiya Planı, Ayarlar).
 * Çalıştırıcı: lib/autopilot.ts (sunucu, cron).
 */
export const AUTOPILOT_DEFAULT_DAY = 3; // Perşembe
export const AUTOPILOT_DEFAULT_HOUR = 8; // 08:00 (Türkiye saati)
/** Aynı haftayı iki çalıştırıcı birden hazırlamasın: süren çalışma bu kadar dakika boyunca sahiplenilir */
export const AUTOPILOT_CLAIM_MINUTES = 15;

export type AutopilotRules = {
  enabled?: boolean; day?: number; hour?: number; last_run_week?: string; last_draft_week?: string;
  claim?: { week: string; at: number };
};

export function autopilotSettings(rules: any): { enabled: boolean; day: number; hour: number } {
  const ap = rules?.autopilot ?? {};
  const day = Number.isInteger(ap.day) && ap.day >= 0 && ap.day <= 6 ? ap.day : AUTOPILOT_DEFAULT_DAY;
  const hour = Number.isInteger(ap.hour) && ap.hour >= 0 && ap.hour <= 23 ? ap.hour : AUTOPILOT_DEFAULT_HOUR;
  return { enabled: ap.enabled !== false, day, hour };
}

/** "Perşembe 08:00" */
export function autopilotWhen(s: { day: number; hour: number }): string {
  return `${AUTOPILOT_DAY_NAMES[s.day]} ${String(s.hour).padStart(2, "0")}:00`;
}

export type AutopilotDecision =
  | { run: true; targetWeek: string }
  | { run: false; reason: "disabled" | "not_due" | "already_ran" | "running" | "week_started" | "no_demand" | "no_setup" };

/**
 * Saf karar: bugün bu şube için taslak hazırlanmalı mı?
 * Seçilen gün ve saatten itibaren çalışır (saatlik çalıştırıcı). Gün ya da saat kaçtıysa sonraki çalışmalarda telafi edilir.
 * Gelecek haftada herhangi bir satır (taslak/yayın) varsa müdür zaten başlamıştır: dokunulmaz.
 */
export function autopilotDecision(a: {
  rules: any;
  todayIdx: number;          // Pzt=0
  hour?: number;             // Türkiye saatiyle şu anki saat (0-23); verilmezse sadece gün bakılır
  nowMs?: number;            // süren çalışmanın sahipliği için (verilmezse bakılmaz)
  weekStart: string;         // bu haftanın pazartesisi
  nextWeekRows: number;
  hasDemand: boolean;
  hasSetup: boolean;         // vardiya tanımı + personel var
}): AutopilotDecision {
  const s = autopilotSettings(a.rules);
  if (!s.enabled) return { run: false, reason: "disabled" };
  if (a.todayIdx < s.day) return { run: false, reason: "not_due" };
  if (a.todayIdx === s.day && typeof a.hour === "number" && a.hour < s.hour) return { run: false, reason: "not_due" };
  if (a.rules?.autopilot?.last_run_week === a.weekStart) return { run: false, reason: "already_ran" };
  const claim = a.rules?.autopilot?.claim;
  if (typeof a.nowMs === "number" && claim?.week === a.weekStart && a.nowMs - Number(claim.at) < AUTOPILOT_CLAIM_MINUTES * 60_000) {
    return { run: false, reason: "running" };
  }
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

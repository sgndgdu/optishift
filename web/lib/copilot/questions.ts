/**
 * Plan Asistanı: hazır sorular (saf).
 *
 * Her soru, haftanın durumundan (WeekSnapshot) deterministik bir cevap üretir.
 * Dil modeli eklendiğinde bu sorular araç (tool) olarak tanımlanacak: model hangi
 * soruyu soracağına karar verir, cevabı yine buradaki kod hesaplar. Böylece sayılar
 * hiçbir zaman uydurulmaz.
 */

import { DAY_NAMES } from "@/lib/constants";
import type { WeekSnapshot } from "./snapshot";
import { dayList, fmtHours, nameList } from "./checks";

export interface Answer {
  title: string;
  lines: string[];
}

export interface CopilotQuestion {
  id: string;
  label: string;
  /** Kişi seçimi ister ("Bir kişinin haftası"). */
  needsPerson?: boolean;
  answer: (snap: WeekSnapshot, personId?: string) => Answer;
}

export const QUESTIONS: CopilotQuestion[] = [
  {
    id: "extra-shift",
    label: "Kime ek vardiya verebilirim?",
    answer: snap => {
      const typical = snap.people.flatMap(p => p.shifts.map(s => s.hours));
      const shiftLen = typical.length ? typical.reduce((a, b) => a + b, 0) / typical.length : 8;
      const room = snap.people
        .filter(p => p.freeDays.length > 0 && p.hours + shiftLen <= snap.rules.maxWeeklyHours)
        .filter(p => p.longestStreak < snap.rules.maxConsecutiveDays)
        .sort((a, b) => a.loadRatio - b.loadRatio || a.hours - b.hours)
        .slice(0, 6);
      if (room.length === 0) {
        return { title: "Ek vardiya alabilecek kimse yok", lines: ["Herkes haftalık sınıra yakın ya da boş günü kalmamış."] };
      }
      return {
        title: "Ek vardiya için en uygun kişiler",
        lines: room.map(p => {
          const left = Math.floor(snap.rules.maxWeeklyHours - p.hours);
          const load = p.loadRatio < 0.8 ? " Adalet Puanı düşük, sıra onda." : "";
          return `${p.name}: ${fmtHours(p.hours)} çalışıyor, ${left} saat daha eklenebilir. Boş günleri: ${dayList(p.freeDays)}.${load}`;
        }),
      };
    },
  },
  {
    id: "gaps",
    label: "Hangi günler eksik?",
    answer: snap => {
      if (!snap.hasDemand) {
        const perDay = [0, 1, 2, 3, 4, 5, 6].map(d =>
          `${DAY_NAMES[d]}: ${snap.coverage.filter(c => c.day === d).reduce((s, c) => s + c.assigned, 0)} kişi`);
        return {
          title: "Kaç kişi gerektiği girilmediği için eksik hesaplanamıyor",
          lines: ["Günlere göre çalışan sayısı:", ...perDay],
        };
      }
      const short = snap.coverage.filter(c => c.demand !== null && c.assigned < c.demand);
      const skill = snap.coverage.filter(c => c.missingSkills.length > 0);
      if (short.length === 0 && skill.length === 0) {
        return { title: "Eksik gün yok", lines: ["Her vardiya ihtiyaç kadar dolu ve zorunlu görevler karşılanmış."] };
      }
      return {
        title: "Eksik vardiyalar",
        lines: [
          ...short.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.demand! - c.assigned} kişi eksik (${c.assigned}/${c.demand})`),
          ...skill.map(c => `${DAY_NAMES[c.day]} ${c.shiftName}: ${c.missingSkills.map(m => `${m.skill} eksik`).join(", ")}`),
        ],
      };
    },
  },
  {
    id: "busiest",
    label: "En çok kim çalışıyor?",
    answer: snap => {
      const top = [...snap.people].filter(p => p.hours > 0).sort((a, b) => b.hours - a.hours).slice(0, 6);
      if (top.length === 0) return { title: "Bu hafta kimse vardiyada değil", lines: [] };
      return {
        title: `En yoğun çalışanlar (ortalama ${fmtHours(snap.avgHours)})`,
        lines: top.map(p => {
          const extra = [p.nights ? `${p.nights} gece` : "", p.weekendShifts ? `${p.weekendShifts} hafta sonu` : ""].filter(Boolean).join(", ");
          return `${p.name}: ${fmtHours(p.hours)}, ${p.shifts.length} vardiya${extra ? ` (${extra})` : ""}`;
        }),
      };
    },
  },
  {
    id: "hard-shifts",
    label: "Gece ve hafta sonu kimde?",
    answer: snap => {
      const withHard = [...snap.people].filter(p => p.hardShifts > 0).sort((a, b) => b.hardShifts - a.hardShifts);
      const none = snap.people.filter(p => p.shifts.length > 0 && p.hardShifts === 0);
      if (withHard.length === 0) return { title: "Bu hafta gece ya da hafta sonu vardiyası yok", lines: [] };
      return {
        title: "Zor vardiyaların dağılımı",
        lines: [
          ...withHard.slice(0, 8).map(p => `${p.name}: ${p.nights} gece, ${p.weekendShifts} hafta sonu${p.loadRatio > 1.2 ? " (Adalet Puanı zaten yüksek)" : ""}`),
          ...(none.length ? [`Hiç zor vardiya almayanlar: ${nameList(none.map(p => p.name), 5)}`] : []),
        ],
      };
    },
  },
  {
    id: "leave",
    label: "Bu hafta kim izinli?",
    answer: snap => {
      const on = snap.people.filter(p => p.leaveDays.length > 0);
      if (on.length === 0) return { title: "Bu hafta onaylı izin yok", lines: [] };
      return {
        title: `${on.length} kişi izinli`,
        lines: on.map(p => `${p.name}: ${dayList(p.leaveDays)}${p.onLeaveDays.length ? `. Dikkat: ${dayList(p.onLeaveDays)} günü vardiyası da var` : ""}`),
      };
    },
  },
  {
    id: "idle",
    label: "Kim hiç vardiya almadı?",
    answer: snap => {
      const idle = snap.people.filter(p => p.shifts.length === 0);
      if (idle.length === 0) return { title: "Herkes en az bir vardiya almış", lines: [] };
      return {
        title: `${idle.length} kişi bu hafta vardiyasız`,
        lines: idle.map(p => p.leaveDays.length >= 7 ? `${p.name}: bütün hafta izinli`
          : p.freeDays.length === 0 ? `${p.name}: bütün hafta uygun değil ya da izinli`
          : `${p.name}: boş günleri ${dayList(p.freeDays)}`),
      };
    },
  },
  {
    id: "person",
    label: "Bir kişinin haftası",
    needsPerson: true,
    answer: (snap, personId) => {
      const p = snap.people.find(x => x.id === personId);
      if (!p) return { title: "Kişi bulunamadı", lines: [] };
      if (p.shifts.length === 0) {
        return { title: `${p.name} bu hafta vardiyasız`, lines: p.leaveDays.length ? [`İzinli: ${dayList(p.leaveDays)}`] : [] };
      }
      const warn = [
        p.onLeaveDays.length ? `İzinli olduğu gün vardiyada: ${dayList(p.onLeaveDays)}` : "",
        p.unavailableDays.length ? `"Gelemem" dediği gün vardiyada: ${dayList(p.unavailableDays)}` : "",
        p.preferredNotDays.length ? `"Tercih etmem" dediği gün vardiyada: ${dayList(p.preferredNotDays)}` : "",
        p.hours > snap.rules.maxWeeklyHours ? `Haftalık ${snap.rules.maxWeeklyHours} saat sınırını aşıyor` : "",
        p.minRestHours !== null && p.minRestHours < snap.rules.minRestHours ? `En kısa dinlenme ${fmtHours(p.minRestHours)}` : "",
      ].filter(Boolean);
      return {
        title: `${p.name}: ${fmtHours(p.hours)}, ${p.shifts.length} vardiya`,
        lines: [
          ...p.shifts.map(s => `${DAY_NAMES[s.day]}: ${s.shiftName} ${s.start}-${s.end}${s.night ? " (gece)" : ""}`),
          ...warn,
        ],
      };
    },
  },
];

export function answerQuestion(snap: WeekSnapshot, id: string, personId?: string): Answer | null {
  const q = QUESTIONS.find(x => x.id === id);
  return q ? q.answer(snap, personId) : null;
}

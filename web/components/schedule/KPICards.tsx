"use client";

import { CalendarDays, Scale, Users, Trophy } from "lucide-react";

interface Assignment {
  personnelId: string;
  day: number;
  shiftId: number;
  start_time?: string;
  end_time?: string;
  points: number;
}

interface PersonData {
  id: string;
  name: string;
  roles: string[];
  prev_score: number;
}

interface KPICardsProps {
  fairness_gap: number;
  assignments: Assignment[];
  personnel: PersonData[];
  scores: Record<string, number>;
}

export function KPICards({ fairness_gap, assignments, personnel, scores }: KPICardsProps) {
  const topPersonnel = personnel.reduce<{ name: string; score: number } | null>((best, p) => {
    const s = scores[p.id] ?? 0;
    if (!best || s > best.score) return { name: p.name.split(" ")[0], score: s };
    return best;
  }, null);

  const cards = [
    {
      label: "Toplam Vardiya",
      value: String(assignments.length),
      sub: "bu hafta atandı",
      icon: <CalendarDays size={14} className="text-indigo-500" />,
      accent: "bg-indigo-50",
    },
    {
      label: "Adalet Farkı",
      value: `${fairness_gap}p`,
      sub: fairness_gap === 0 ? "mükemmel dağılım" : "optimize edilebilir",
      icon: <Scale size={14} className={fairness_gap === 0 ? "text-green-500" : "text-yellow-500"} />,
      accent: fairness_gap === 0 ? "bg-green-50" : "bg-yellow-50",
      valueColor: fairness_gap === 0 ? "text-green-600" : "text-yellow-600",
    },
    {
      label: "Aktif Personel",
      value: String(personnel.length),
      sub: "çalışan planlandı",
      icon: <Users size={14} className="text-indigo-500" />,
      accent: "bg-indigo-50",
    },
    {
      label: "Haftanın En Yüklüsü",
      value: topPersonnel?.name ?? "—",
      sub: topPersonnel ? `${topPersonnel.score}p kazandı` : "",
      icon: <Trophy size={14} className="text-orange-500" />,
      accent: "bg-orange-50",
      valueColor: "text-orange-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-0 md:flex md:items-center md:bg-white md:border md:border-slate-200 md:rounded-lg md:px-4 md:py-2.5 md:shadow-sm md:overflow-x-auto text-sm">
      {cards.map((c, i) => (
        <div key={c.label} className={`flex items-center gap-2.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm md:bg-transparent md:border-0 md:rounded-none md:px-0 md:py-0 md:shadow-none ${i !== cards.length - 1 ? "md:border-r md:border-slate-100 md:pr-6" : ""}`}>
          <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${c.accent}`}>
            {c.icon}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase">{c.label}</span>
            <span className={`font-semibold ${c.valueColor ?? "text-slate-800"}`}>
              {c.value} <span className="text-slate-400 font-normal text-xs ml-1">{c.sub}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

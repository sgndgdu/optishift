"use client";
import { useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { PERSONNEL } from "@/lib/mock-data";
import { DAYS, AVAILABILITY_COLORS, AVAILABILITY_LABELS, type Availability } from "@/lib/types";

const ZONE_COLORS: Record<string, string> = {
  Kasa:   "bg-indigo-100 text-indigo-700",
  Reyon:  "bg-green-100 text-green-700",
  Teras:  "bg-orange-100 text-orange-700",
  Mutfak: "bg-pink-100 text-pink-700",
};

export default function PersonnelPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Personel</h1>
          <p className="text-slate-500 text-sm mt-1">{PERSONNEL.length} çalışan kayıtlı</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus size={16} />
          Personel Ekle
        </button>
      </div>

      <div className="space-y-3">
        {PERSONNEL.map((p) => (
          <div key={p.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Kart Başlığı */}
            <button
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {p.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800">{p.name}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {p.skills.map((s) => (
                    <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_COLORS[s] ?? "bg-slate-100 text-slate-600"}`}>
                      #{s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-indigo-600">{p.prev_score}p</div>
                <div className="text-xs text-slate-400">Adil Puan</div>
              </div>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform shrink-0 ${expanded === p.id ? "rotate-180" : ""}`}
              />
            </button>

            {/* Müsaitlik Detayı */}
            {expanded === p.id && (
              <div className="px-5 pb-5 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mt-4 mb-3">Haftalık Müsaitlik</p>
                <div className="grid grid-cols-7 gap-2">
                  {DAYS.map((day, d) => {
                    const status: Availability = p.availability[d] ?? "available";
                    return (
                      <div key={day} className="text-center">
                        <div className="text-xs text-slate-400 mb-1">{day.slice(0, 3)}</div>
                        <div
                          className={`w-full aspect-square rounded-lg ${AVAILABILITY_COLORS[status]} flex items-center justify-center`}
                          title={AVAILABILITY_LABELS[status]}
                        >
                          {status === "available" && <span className="text-white text-xs">✓</span>}
                          {status === "preferred_not" && <span className="text-white text-xs">~</span>}
                          {status === "unavailable" && <span className="text-white text-xs">✕</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 leading-tight">
                          {status === "available" ? "Müsait" : status === "preferred_not" ? "Tercihen" : "İzinli"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Müsait</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> Tercih Etmiyor</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Gelemez</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

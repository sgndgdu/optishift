"use client";

import { Info, AlertCircle } from "lucide-react";
import type { Personnel, Availability } from "@/lib/types";
import { DAYS } from "@/lib/types";
import { AVAIL_CELL, AVAIL_SHORT } from "../shared";

interface AvailabilityTabProps {
  selected: Personnel;
  requestSentFor: string | null;
  setRequestSentFor: (id: string) => void;
}

export function AvailabilityTab({ selected, requestSentFor, setRequestSentFor }: AvailabilityTabProps) {
  const isSent = requestSentFor === selected.id;
  const avail = selected.availability;
  const counts = {
    available:     Object.values(avail).filter((v) => v === "available").length,
    preferred_not: Object.values(avail).filter((v) => v === "preferred_not").length,
    unavailable:   Object.values(avail).filter((v) => v === "unavailable").length,
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <Info size={16} className="text-indigo-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-700">Müsaitlik İsteği</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {selected.name} uygulamada bildirim alır — &quot;Haftalık müsaitlik talebi geldi&quot; — ve kendi gireceği ekrandan doldurur.
            </div>
          </div>
        </div>
        <button
          onClick={() => setRequestSentFor(selected.id)}
          disabled={isSent}
          className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
            isSent
              ? "bg-green-100 text-green-700 cursor-default"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {isSent ? "✓ Bildirim Gönderildi" : "Müsaitlik İsteği Gönder"}
        </button>
        {isSent && (
          <p className="text-xs text-slate-400 text-center mt-2">Gönderi tarihi: Bugün</p>
        )}
      </div>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mevcut Durum</p>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Çalışan tarafından doldurulur</span>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {DAYS.map((day, d) => {
            const status: Availability = avail[d] ?? "available";
            const cell = AVAIL_CELL[status];
            return (
              <div key={day} className="text-center">
                <div className="text-[10px] sm:text-xs text-slate-400 mb-1 sm:mb-1.5 font-medium">{day.slice(0, 3)}</div>
                <div
                  className={`w-full aspect-square rounded-xl ${cell.bg.split(" ")[0]} flex items-center justify-center text-white text-sm font-bold shadow-sm`}
                >
                  {cell.icon}
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5 leading-tight">{AVAIL_SHORT[status]}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-5 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Müsait</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> Tercih Etmiyor</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Kesinlikle Gelemez</span>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3">
        {(["available", "preferred_not", "unavailable"] as const).map((s) => {
          const colorsMap: Record<Availability, string> = {
            available:     "bg-green-50 border-green-200 text-green-700",
            preferred_not: "bg-yellow-50 border-yellow-200 text-yellow-700",
            unavailable:   "bg-red-50 border-red-200 text-red-700",
          };
          const icons: Record<Availability, string> = { available: "✓", preferred_not: "~", unavailable: "✕" };
          return (
            <div key={s} className={`border rounded-xl p-3 text-center ${colorsMap[s]}`}>
              <div className="text-xl font-bold">{icons[s]} {counts[s]}</div>
              <div className="text-xs mt-0.5 opacity-75">{AVAIL_SHORT[s]}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-amber-50 rounded-xl p-4">
        <div className="flex gap-2">
          <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            <strong>Kırmızı günler</strong> OR-Tools motoruna kesin kısıt olarak girilir — bu personel o güne hiçbir koşulda yazılmaz.{" "}
            <strong>Sarı günler</strong> yumuşak kısıt olarak değerlendirilir, motor kaçınmaya çalışır ancak zorunluysa yazabilir.
          </p>
        </div>
      </div>
    </div>
  );
}

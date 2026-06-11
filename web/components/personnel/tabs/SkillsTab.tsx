"use client";

import { Plus, X, Info } from "lucide-react";
import type { Personnel, SkillLevel } from "@/lib/types";
import { ZONE_COLORS, ZONE_DEFAULT } from "../shared";

interface SkillsTabProps {
  selected: Personnel;
  personnel: Personnel[];
  allRoles: string[];
  freeRoles: string[];
  skillDropOpen: boolean;
  setSkillDropOpen: (open: boolean) => void;
  customSkill: string;
  setCustomSkill: (v: string) => void;
  skillRef: React.RefObject<HTMLDivElement | null>;
  addZone: (roleId: string) => void;
  removeZone: (roleId: string) => void;
  patch: (id: string, updates: Partial<Personnel>) => void;
}

export function SkillsTab({
  selected,
  personnel,
  allRoles,
  freeRoles,
  skillDropOpen,
  setSkillDropOpen,
  customSkill,
  setCustomSkill,
  skillRef,
  addZone,
  removeZone,
  patch,
}: SkillsTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">Çalışma İstasyonları</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Hangi istasyonlara atanabileceğini belirler — shift oluştururken OR-Tools bu bilgiyi kullanır
            </div>
          </div>
          <div className="relative" ref={skillRef}>
            <button
              onClick={() => setSkillDropOpen(!skillDropOpen)}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors border border-indigo-200"
            >
              <Plus size={12} /> Alan Ekle
            </button>
            {skillDropOpen && (
              <div className="absolute right-0 top-9 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden">
                {freeRoles.length > 0 ? (
                  freeRoles.map((r) => {
                    const c = ZONE_COLORS[r] ?? ZONE_DEFAULT;
                    return (
                      <button
                        key={r}
                        onClick={() => addZone(r)}
                        className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                        {r}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-3 text-xs text-slate-400">Tüm roller atandı.</div>
                )}
                <div className="border-t border-slate-100 px-3 py-2.5">
                  <div className="text-xs text-slate-400 mb-1.5">Özel alan:</div>
                  <div className="flex gap-1.5">
                    <input
                      value={customSkill}
                      onChange={(e) => setCustomSkill(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && customSkill.trim() && addZone(customSkill.trim())}
                      placeholder="Örn: Bar, Resepsiyon…"
                      className="field-input text-xs py-1"
                    />
                    <button
                      onClick={() => customSkill.trim() && addZone(customSkill.trim())}
                      className="px-2 bg-indigo-600 text-white text-xs rounded-lg shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {selected.roles.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">Henüz alan atanmamış.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {selected.roles.map((role) => {
              const level: SkillLevel = selected.role_levels[role] ?? "secondary";
              const c = ZONE_COLORS[role] ?? ZONE_DEFAULT;
              return (
                <div key={role} className="flex items-center gap-3 px-4 py-3.5">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${c.chip}`}>{role}</span>
                  <div className="flex-1" />
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0 text-xs font-medium">
                    <button
                      onClick={() => patch(selected.id, { role_levels: { ...selected.role_levels, [role]: "primary" } })}
                      className={`px-3 py-1.5 transition-colors ${
                        level === "primary" ? "bg-indigo-600 text-white" : "bg-white text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      Ana Alan
                    </button>
                    <button
                      onClick={() => patch(selected.id, { role_levels: { ...selected.role_levels, [role]: "secondary" } })}
                      className={`px-3 py-1.5 border-l border-slate-200 transition-colors ${
                        level === "secondary" ? "bg-slate-600 text-white" : "bg-white text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      Yardımcı
                    </button>
                  </div>
                  <button
                    onClick={() => removeZone(role)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-slate-100 px-5 py-3 flex gap-2 bg-slate-50">
          <Info size={12} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="font-medium text-slate-500">Ana</span> — bu istasyona birincil atanır, kota hesabında önceliklidir.{" "}
            <span className="font-medium text-slate-500">Yardımcı</span> — ihtiyaç halinde atanabilir; uyumsuzlukta uyarı verilir, müdür ezebilir.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-700">Takım İstasyon Kapsamı</div>
          <div className="text-xs text-slate-400 mt-0.5">İstasyon başına kaç kişi atanabilir</div>
        </div>
        <div className="divide-y divide-slate-50">
          {allRoles.map((role) => {
            const total = personnel.filter((p) => p.roles.includes(role)).length;
            const primaryCount = personnel.filter(
              (p) => p.roles.includes(role) && p.role_levels[role] === "primary"
            ).length;
            const c = ZONE_COLORS[role] ?? ZONE_DEFAULT;
            const thisHas = selected.roles.includes(role);
            return (
              <div key={role} className={`flex items-center gap-3 px-5 py-3.5 ${!thisHas ? "opacity-30" : ""}`}>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${c.chip}`}>{role}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${c.dot}`}
                    style={{ width: `${(total / personnel.length) * 100}%` }}
                  />
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-xs font-semibold text-slate-600">{total}</span>
                  <span className="text-xs text-slate-300 mx-1">·</span>
                  <span className="text-xs text-slate-400">{primaryCount} ana</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

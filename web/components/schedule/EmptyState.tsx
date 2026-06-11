"use client";

import { Zap, Clock, ShieldCheck, CheckCircle2, Users, Save, Settings, UserCog, Briefcase } from "lucide-react";
import type { Role, ShiftDefinition, ScheduleRules, SkillsMatchMode } from "@/lib/types";
import Link from "next/link";

function Stepper({ value, onChange, min = 0, max = 20 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 inline-flex shadow-sm">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors">−</button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums select-none text-slate-700">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors">+</button>
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1">
      <h3 className="text-base font-bold text-slate-800">{children}</h3>
      {hint && <p className="text-sm text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function RulesSection({ rules, onChange }: {
  rules: ScheduleRules; onChange: (r: ScheduleRules) => void;
}) {
  const SKILLS_OPTIONS: { value: SkillsMatchMode; label: string; desc: string }[] = [
    { value: "required", label: "Zorunlu",  desc: "Yetki yoksa atanamaz" },
    { value: "warn",     label: "Uyarı",    desc: "Yetki yoksa uyarı verir" },
    { value: "off",      label: "Kapalı",   desc: "Yetki kontrol edilmez" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Max haftalık saat */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-blue-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700">Maks. Haftalık Saat</p>
        </div>
        <div className="flex items-center gap-3">
          <Stepper value={rules.max_weekly_hours} onChange={(v) => onChange({ ...rules, max_weekly_hours: v })} min={20} max={60} />
          <span className="text-sm text-slate-500">saat</span>
        </div>
      </div>

      {/* Min dinlenme süresi */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-green-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700">Min. Dinlenme Süresi</p>
        </div>
        <div className="flex items-center gap-3">
          <Stepper value={rules.min_rest_hours} onChange={(v) => onChange({ ...rules, min_rest_hours: v })} min={8} max={24} />
          <span className="text-sm text-slate-500">saat</span>
        </div>
      </div>

      {/* Alan yetki eşleşmesi */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 size={16} className="text-indigo-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-700">Rol Yetki Şartı</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {SKILLS_OPTIONS.map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => onChange({ ...rules, skills_match: opt.value })}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                rules.skills_match === opt.value
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-transparent border-transparent text-slate-600 hover:bg-slate-50"
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rules.skills_match === opt.value ? "bg-indigo-600" : "bg-slate-300"}`} />
              <div>
                <span className="text-xs font-semibold block">{opt.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Props {
  onGenerate: () => void;
  shifts: ShiftDefinition[];
  roles: Role[];
  onRolesChange: (r: Role[]) => void;
  rules: ScheduleRules;
  onRulesChange: (r: ScheduleRules) => void;
  onSaveAsDefault: () => void;
  savedAt: string | null;
  activeCount: number;
  onLeaveCount: number;
  totalCount: number;
}

import React from "react";

export function EmptyState({
  onGenerate, shifts, roles, onRolesChange,
  rules, onRulesChange, onSaveAsDefault, savedAt,
  activeCount, onLeaveCount, totalCount,
}: Props) {

  const [selectedDay, setSelectedDay] = React.useState<number>(0);
  const DAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

  const updateMinPerShift = (roleIndex: number, shiftId: string, val: number) => {
    const updated = [...roles];
    const role = { ...updated[roleIndex] };
    
    if (!role.daily_coverage) {
      role.daily_coverage = {};
      for(let i = 0; i < 7; i++) {
        role.daily_coverage[i] = { ...role.min_per_shift };
      }
    }
    
    if (!role.daily_coverage[selectedDay]) {
      role.daily_coverage[selectedDay] = { ...role.min_per_shift };
    }
    
    role.daily_coverage[selectedDay] = { ...role.daily_coverage[selectedDay], [shiftId]: val };
    
    updated[roleIndex] = role;
    onRolesChange(updated);
  };

  const copyToAllDays = () => {
    const updated = roles.map(role => {
      const currentDayValues = role.daily_coverage?.[selectedDay] || role.min_per_shift;
      const newDailyCoverage = { ...role.daily_coverage };
      for(let i = 0; i < 7; i++) {
        newDailyCoverage[i] = { ...currentDayValues };
      }
      return { ...role, daily_coverage: newDailyCoverage };
    });
    onRolesChange(updated);
  };

  return (
    <div className="space-y-6">
      
      {/* ── Adım 1: Lokasyon Özeti ─────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <SectionTitle hint="Planlama yapılacak lokasyonun güncel yapılandırması.">
              1. Lokasyon Uçuş Öncesi Kontrolü
            </SectionTitle>
          </div>
          <Link href="/settings" className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors shrink-0">
            <Settings size={16} />
            Lokasyon Ayarlarına Git
          </Link>
        </div>
        <div className="p-6 bg-slate-50/50 flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{shifts.length}</p>
              <p className="text-xs font-medium text-slate-500">Tanımlı Vardiya</p>
            </div>
          </div>
          <div className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Briefcase size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{roles.length}</p>
              <p className="text-xs font-medium text-slate-500">Tanımlı Rol</p>
            </div>
          </div>
          <div className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
              <Users size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{activeCount}</p>
              <p className="text-xs font-medium text-slate-500">Aktif Personel {onLeaveCount > 0 && <span className="text-orange-500">({onLeaveCount} İzinde)</span>}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Adım 2: Headcount Matrix ─────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col gap-4">
          <SectionTitle hint="Haftanın her günü için hangi vardiyada hangi role minimum kaç kişi gerektiğini belirleyin.">
            2. Günlük İhtiyaç Planı (Headcount)
          </SectionTitle>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
              {DAYS_SHORT.map((day, idx) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(idx)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors shrink-0 ${
                    selectedDay === idx ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copyToAllDays}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              {DAYS_SHORT[selectedDay]} Değerlerini Tüm Haftaya Kopyala
            </button>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-slate-400 pb-4 border-b border-slate-200 w-1/4 uppercase tracking-wider">Roller</th>
                {shifts.map(shift => (
                  <th key={shift.id} className="text-left pb-4 border-b border-slate-200 w-1/4">
                    <div className="font-semibold text-slate-700 text-sm">{shift.name}</div>
                    <div className="text-xs text-slate-400 font-normal font-mono">{shift.start} - {shift.end}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role, rIdx) => (
                <tr key={role.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="py-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold text-sm">
                      <UserCog size={14} className="text-slate-400"/> {role.name}
                    </span>
                  </td>
                  {shifts.map(shift => {
                    const currentVal = role.daily_coverage?.[selectedDay]?.[shift.id] ?? role.min_per_shift[shift.id] ?? 0;
                    return (
                      <td key={shift.id} className="py-4">
                        <Stepper 
                          value={currentVal}
                          onChange={(val) => updateMinPerShift(rIdx, shift.id, val)}
                          min={0}
                          max={10}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Adım 3: Kurallar ───────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <SectionTitle hint="Algoritmanın atama yaparken kullanacağı esneklik kısıtlarını ayarlayın.">
            3. Kural Motoru
          </SectionTitle>
        </div>
        <div className="p-6 bg-slate-50/50">
          <RulesSection rules={rules} onChange={onRulesChange} />
        </div>
      </div>

      {/* ── Kaydet ─────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onSaveAsDefault}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 hover:border-indigo-200 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <Save size={16} />
            İhtiyaç ve Kuralları Kaydet
          </button>
          {savedAt && (
            <span className="text-xs text-slate-400 hidden sm:inline-block">Son kayıt: {savedAt}</span>
          )}
        </div>
      </div>
    </div>
  );
}

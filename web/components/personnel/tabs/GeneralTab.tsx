"use client";

import { useState } from "react";
import { Lock, Unlock, AlertTriangle } from "lucide-react";
import type { Personnel, EmploymentType } from "@/lib/types";
import { EMP_LABELS, TITLE_SUGGESTIONS, formatDate } from "../shared";
import { MOCK_LOCATIONS, MOCK_DEPARTMENTS, MOCK_ROLES } from "@/lib/mock-data";
import { DAYS } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = {
  admin: "Yönetici",
  supervisor: "Bölge Sorumlusu",
  manager: "Mağaza Müdürü",
  employee: "Personel"
};

interface GeneralTabProps {
  gen: Personnel;
  selected: Personnel;
  isDirty: boolean;
  unlockedSections: Set<string>;
  toggleSection: (section: string) => void;
  updateDraft: (updates: Partial<Personnel>) => void;
  saveGeneral: () => void;
  cancelDraft: () => void;
  deletePersonnel: (id: string) => void;
}

export function GeneralTab({
  gen,
  selected,
  isDirty,
  unlockedSections,
  toggleSection,
  updateDraft,
  saveGeneral,
  cancelDraft,
  deletePersonnel,
}: GeneralTabProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [tempHours, setTempHours] = useState(String(gen.max_weekly_hours));

  const location = MOCK_LOCATIONS.find(l => l.id === selected.primary_location_id);
  const locationName = location?.name || "Bilinmeyen Lokasyon";
  const deptName = MOCK_DEPARTMENTS.find(d => d.id === selected.department_id)?.name;
  
  const shifts = location?.shift_definitions || [];
  const locationDepartments = MOCK_DEPARTMENTS.filter(d => d.location_id === location?.id);
  const locationRoles = MOCK_ROLES.filter(r => locationDepartments.some(d => d.id === r.department_id));
  const roleNames = locationRoles.map(r => r.name);

  const handleHoursBlur = () => {
    setEditingHours(false);
    let val = parseInt(tempHours, 10);
    if (isNaN(val)) val = gen.max_weekly_hours;
    val = Math.max(8, Math.min(60, val));
    updateDraft({ max_weekly_hours: val });
    setTempHours(String(val));
  };

  const handleHoursKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleHoursBlur();
    }
  };

  return (
    <>
      <div className="space-y-4 flex-1 overflow-y-auto px-6 py-5 pb-2">
        {/* KİMLİK & İLETİŞİM */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          <div className="px-5 py-2.5 bg-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kimlik & İletişim</span>
            <button
              onClick={() => toggleSection("kimlik")}
              className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors ${
                unlockedSections.has("kimlik")
                  ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
            >
              {unlockedSections.has("kimlik") ? <><Unlock size={11} /> Kilitle</> : <><Lock size={11} /> Düzenle</>}
            </button>
          </div>
          {unlockedSections.has("kimlik") ? (
            <>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Sicil No</div>
                  <input
                    value={gen.employee_id}
                    onChange={(e) => updateDraft({ employee_id: e.target.value })}
                    className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300"
                  />
                </div>
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">ERP ID</div>
                  <input
                    value={gen.erp_id}
                    onChange={(e) => updateDraft({ erp_id: e.target.value })}
                    className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300"
                    placeholder="—"
                  />
                </div>
              </div>
              <div className="px-4 py-3.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Telefon</div>
                <input
                  value={gen.phone}
                  onChange={(e) => updateDraft({ phone: e.target.value })}
                  className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300"
                  placeholder="+90 5xx xxx xx xx"
                />
              </div>
              <div className="px-4 py-3.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">E-posta</div>
                <input
                  value={gen.email}
                  onChange={(e) => updateDraft({ email: e.target.value })}
                  className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300"
                  placeholder="ad@sirket.com"
                />
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">İşe Giriş</div>
                  <input
                    type="date"
                    value={gen.hire_date}
                    onChange={(e) => updateDraft({ hire_date: e.target.value })}
                    className="w-full text-sm text-slate-800 bg-transparent outline-none"
                  />
                </div>
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Sözleşme Bitiş</div>
                  <input
                    type="date"
                    value={gen.contract_end_date}
                    onChange={(e) => updateDraft({ contract_end_date: e.target.value })}
                    className="w-full text-sm text-slate-800 bg-transparent outline-none"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Sicil No</div>
                  <div className="text-sm text-slate-800">{gen.employee_id || <span className="text-slate-300">—</span>}</div>
                </div>
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">ERP ID</div>
                  <div className="text-sm text-slate-800">{gen.erp_id || <span className="text-slate-300">—</span>}</div>
                </div>
              </div>
              <div className="px-4 py-3.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Telefon</div>
                <div className="text-sm text-slate-800">{gen.phone || <span className="text-slate-300">—</span>}</div>
              </div>
              <div className="px-4 py-3.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">E-posta</div>
                <div className="text-sm text-slate-800">{gen.email || <span className="text-slate-300">—</span>}</div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">İşe Giriş</div>
                  <div className="text-sm text-slate-800">
                    {gen.hire_date ? formatDate(gen.hire_date) : <span className="text-slate-300">—</span>}
                  </div>
                </div>
                <div className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Sözleşme Bitiş</div>
                  <div className="text-sm text-slate-800">
                    {gen.contract_end_date ? formatDate(gen.contract_end_date) : <span className="text-slate-300">—</span>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* POZİSYON */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          <div className="px-5 py-2.5 bg-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pozisyon</span>
            <button
              onClick={() => toggleSection("pozisyon")}
              className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors ${
                unlockedSections.has("pozisyon")
                  ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
            >
              {unlockedSections.has("pozisyon") ? <><Unlock size={11} /> Kilitle</> : <><Lock size={11} /> Düzenle</>}
            </button>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Lokasyon (Şube)</div>
            <div className="text-sm text-slate-800">{locationName}</div>
          </div>
          {deptName && (
            <div className="px-4 py-3.5">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Departman</div>
              <div className="text-sm text-slate-800">{deptName}</div>
            </div>
          )}
          {unlockedSections.has("pozisyon") ? (
            <>
              <div className="px-4 py-3.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Erişim Yetkisi</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                    {ROLE_LABELS[selected.user_access_level] || "Bilinmeyen Yetki"}
                  </span>
                </div>
                <input
                  value={gen.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300"
                  list="drawer-title-list"
                  placeholder="Kasiyer, Barista, Garson…"
                />
                <datalist id="drawer-title-list">
                  {TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div className="px-4 py-3.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Çalışma Türü</div>
                <div className="flex gap-2">
                  {(["full_time", "part_time", "intern"] as EmploymentType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateDraft({ employment_type: t })}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        gen.employment_type === t
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {EMP_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="px-4 py-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Erişim Yetkisi</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                    {ROLE_LABELS[selected.user_access_level] || "Bilinmeyen Yetki"}
                  </span>
                </div>
                <div className="text-sm text-slate-800">
                  {gen.title || <span className="text-slate-300 italic">Belirtilmemiş</span>}
                </div>
              </div>
              <span
                className={`text-xs font-medium px-3 py-1 rounded-full shrink-0 ${
                  gen.employment_type === "full_time"
                    ? "bg-slate-100 text-slate-600"
                    : gen.employment_type === "part_time"
                    ? "bg-blue-100 text-blue-600"
                    : "bg-amber-100 text-amber-600"
                }`}
              >
                {EMP_LABELS[gen.employment_type]}
              </span>
            </div>
          )}
        </div>

        {/* ÇALIŞMA TERCİHLERİ */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100 mt-6">
          <div className="px-5 py-2.5 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Çalışma Tercihleri</span>
          </div>

          {/* GÜN TERCİHLERİ */}
          <div className="px-4 py-3.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Tercih Edilen Günler</div>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((dayName, idx) => {
                const isSelected = gen.preferred_days?.includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      const current = gen.preferred_days || [];
                      updateDraft({
                        preferred_days: isSelected
                          ? current.filter(d => d !== idx)
                          : [...current, idx].sort()
                      });
                    }}
                    className={`w-9 h-9 rounded-full text-xs font-medium transition-colors border ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"
                    }`}
                  >
                    {dayName.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* VARDİYA TERCİHLERİ */}
          <div className="px-4 py-3.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Tercih Edilen Vardiyalar</div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => updateDraft({ preferred_shift_ids: [] })}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  gen.preferred_shift_ids?.length === 0
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                Fark Etmez
              </button>
              {shifts.map((shift) => {
                const isSelected = gen.preferred_shift_ids?.includes(shift.id);
                return (
                  <button
                    key={shift.id}
                    onClick={() => {
                      const current = gen.preferred_shift_ids || [];
                      updateDraft({
                        preferred_shift_ids: isSelected
                          ? current.filter(id => id !== shift.id)
                          : [...current, shift.id]
                      });
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {shift.name} ({shift.start}-{shift.end})
                  </button>
                );
              })}
            </div>
          </div>

          {/* ALAN TERCİHLERİ */}
          <div className="px-4 py-3.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Tercih Edilen Roller</div>
            <div className="flex gap-2 flex-wrap">
              {locationRoles.map((role) => {
                const isSelected = gen.preferred_roles?.includes(role.id);
                return (
                  <button
                    key={role.id}
                    onClick={() => {
                      const current = gen.preferred_roles || [];
                      updateDraft({
                        preferred_roles: isSelected
                          ? current.filter(rid => rid !== role.id)
                          : [...current, role.id]
                      });
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Max Haftalık Saat</div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateDraft({ max_weekly_hours: Math.max(8, gen.max_weekly_hours - 1) })}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-base transition-colors"
              >
                −
              </button>
              {editingHours ? (
                <input
                  type="number"
                  min={8}
                  max={60}
                  autoFocus
                  value={tempHours}
                  onChange={(e) => setTempHours(e.target.value)}
                  onBlur={handleHoursBlur}
                  onKeyDown={handleHoursKeyDown}
                  className="w-10 text-base font-bold text-slate-800 text-center outline-none border-b border-indigo-600"
                />
              ) : (
                <span
                  onClick={() => {
                    setTempHours(String(gen.max_weekly_hours));
                    setEditingHours(true);
                  }}
                  className="text-base font-bold text-slate-800 w-10 text-center cursor-pointer hover:text-indigo-600"
                >
                  {gen.max_weekly_hours}
                </span>
              )}
              <button
                onClick={() => updateDraft({ max_weekly_hours: Math.min(60, gen.max_weekly_hours + 1) })}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-base transition-colors"
              >
                +
              </button>
              <span className="text-xs text-slate-400">saat / hafta</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <div className="text-sm font-medium text-slate-700">Fazla Mesai Onayı</div>
              <div className="text-xs text-slate-400 mt-0.5">Motor bu personeli OT&apos;ye yazabilir</div>
            </div>
            <button
              role="switch"
              aria-checked={gen.overtime_approved}
              aria-label="Fazla Mesai Onayı"
              onClick={() => updateDraft({ overtime_approved: !gen.overtime_approved })}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${gen.overtime_approved ? "bg-indigo-600" : "bg-slate-300"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${gen.overtime_approved ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        {/* NOTLAR */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          <div className="px-5 py-2.5 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notlar</span>
          </div>
          <div className="px-4 py-3.5">
            <textarea
              value={gen.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              rows={3}
              placeholder="Bu personel hakkında not ekle…"
              className="w-full text-sm text-slate-800 bg-transparent outline-none resize-none placeholder-slate-300"
            />
          </div>
        </div>

        {/* TEHLİKE BÖLGESİ (SİLME) */}
        <div className="rounded-2xl border border-red-200 bg-red-50/50 overflow-hidden mt-6">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={16} />
              <span className="text-sm font-medium">Tehlike Bölgesi</span>
            </div>
            {deleteConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  onClick={() => deletePersonnel(selected.id)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                >
                  Emin misiniz? Sil
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setDeleteConfirm(true);
                  setTimeout(() => setDeleteConfirm(false), 3000);
                }}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 hover:border-red-300 transition-colors"
              >
                Bu personeli sil
              </button>
            )}
          </div>
        </div>
      </div>

      {isDirty && (
        <div className="shrink-0 border-t border-slate-200 px-6 py-4 bg-white flex gap-3 items-center">
          <span className="flex-1 text-xs text-slate-400">Kaydedilmemiş değişiklikler var</span>
          <button
            onClick={cancelDraft}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Vazgeç
          </button>
          <button
            onClick={saveGeneral}
            className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
          >
            Kaydet
          </button>
        </div>
      )}
    </>
  );
}

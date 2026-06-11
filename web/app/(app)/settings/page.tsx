"use client";

import { useState, useEffect } from "react";
import { Save, Plus, X, AlertCircle, Bell, Send, UserCircle } from "lucide-react";
import type { Location, ShiftDefinition, Department, Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import AccountTab from "@/components/AccountTab";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function DifficultyBar({ value }: { value: number }) {
  const pct = (value / 10) * 100;
  const color =
    value <= 3 ? "bg-emerald-400" :
    value <= 6 ? "bg-amber-400" :
    value <= 8 ? "bg-orange-500" : "bg-red-500";
  const textColor =
    value <= 3 ? "text-emerald-600" :
    value <= 6 ? "text-amber-600" :
    value <= 8 ? "text-orange-600" : "text-red-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-300", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-black w-5 text-right", textColor)}>{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"hours" | "shifts" | "weights" | "roles" | "notifications" | "account">("hours");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDay, setReminderDay] = useState("0"); // 0=Pzt … 6=Paz
  const [reminderTime, setReminderTime] = useState("18:00");
  const [reminding, setReminding] = useState(false);
  const [remindResult, setRemindResult] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locationData, setLocationData] = useState<Location | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [zoneQuotas, setZoneQuotas] = useState<{ zone: string; min: number }[]>([]);
  const [ensureSeniorPerShift, setEnsureSeniorPerShift] = useState(false);
  const [maxConsecutiveDays, setMaxConsecutiveDays]     = useState(6);
  const [noNightToMorning, setNoNightToMorning]         = useState(false);
  const [includeManagersInSchedule, setIncludeManagersInSchedule] = useState(false);
  const [preferredNotMultiplier, setPreferredNotMultiplier]       = useState(1.5);
  // İzin politikası
  const [leaveRequireReason, setLeaveRequireReason]     = useState(false);
  const [leaveAllowMultiDay, setLeaveAllowMultiDay]     = useState(false);
  const [leaveMaxDays, setLeaveMaxDays]                 = useState(1);

  useEffect(() => {
    const init = async () => {
      const savedId = localStorage.getItem("optishift_selected_location");
      const userRaw = localStorage.getItem("optishift_manager_user");
      let u = null;
      if (userRaw) u = JSON.parse(userRaw);
      
      if (!u || !u.org_id) return;

      try {
        const res = await fetch(`/api/locations?org_id=${u.org_id}`);
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
           let targetLoc = data.find(x => x.id === savedId);
           let finalId = savedId;
           if (!targetLoc) {
             targetLoc = data[0];
             finalId = targetLoc.id;
             if (finalId) localStorage.setItem("optishift_selected_location", finalId);
           }
           if (finalId) setSelectedLocationId(finalId);
           
           // API'den gelen alanları parse et ve deep copy yap (frozen nesneleri önle)
           const parsedLoc = JSON.parse(JSON.stringify(targetLoc));
           if (typeof parsedLoc.shift_definitions === 'string') {
              try { parsedLoc.shift_definitions = JSON.parse(parsedLoc.shift_definitions); }
              catch { parsedLoc.shift_definitions = []; }
           }
           if (typeof parsedLoc.operating_hours === 'string') {
              try { parsedLoc.operating_hours = JSON.parse(parsedLoc.operating_hours); }
              catch { parsedLoc.operating_hours = {}; }
           }
           if (typeof parsedLoc.zone_quotas === 'string') {
              try { parsedLoc.zone_quotas = JSON.parse(parsedLoc.zone_quotas); }
              catch { parsedLoc.zone_quotas = {}; }
           }
           if (!parsedLoc.zone_quotas) parsedLoc.zone_quotas = {};
           if (typeof parsedLoc.rules === 'string') {
             try { parsedLoc.rules = JSON.parse(parsedLoc.rules); } catch { parsedLoc.rules = {}; }
           }
           setLocationData(parsedLoc);
           // zone_quotas'ı düzenlenebilir liste formatına çevir
           const quotaEntries = Object.entries(parsedLoc.zone_quotas as Record<string, number>).map(
             ([zone, min]) => ({ zone, min: Number(min) })
           );
           setZoneQuotas(quotaEntries);
           // Kural toggle'larını yükle
           setEnsureSeniorPerShift(!!(parsedLoc.rules?.ensure_senior_per_shift));
           setMaxConsecutiveDays(parsedLoc.rules?.max_consecutive_days ?? 6);
           setNoNightToMorning(!!parsedLoc.rules?.no_night_to_morning);
           setIncludeManagersInSchedule(!!parsedLoc.rules?.include_managers_in_schedule);
           if (typeof parsedLoc.rules?.preferred_not_multiplier === "number") {
             setPreferredNotMultiplier(parsedLoc.rules.preferred_not_multiplier);
           }
           // İzin politikasını yükle
           if (typeof parsedLoc.leave_policy === 'string') {
             try { parsedLoc.leave_policy = JSON.parse(parsedLoc.leave_policy); } catch { parsedLoc.leave_policy = {}; }
           }
           const lp = parsedLoc.leave_policy || {};
           setLeaveRequireReason(!!lp.require_reason);
           setLeaveAllowMultiDay(!!lp.allow_multi_day);
           setLeaveMaxDays(lp.max_days_per_request ?? 1);

           // Departmanları DB'den yükle; bölge rolleri henüz DB'de tutulmuyor (localStorage)
           let depts: Department[] = [];
           try {
             const dres = await fetch(`/api/departments?location_id=${finalId}`);
             if (dres.ok) {
               const draw = await dres.json();
               if (Array.isArray(draw)) depts = draw;
             }
           } catch { /* departman yüklenemezse boş liste */ }
           let locRoles: Role[] = [];

           const savedSettingsRaw = finalId ? localStorage.getItem(`optishift_settings_mock_${finalId}`) : null;
           if (savedSettingsRaw) {
             try {
               const savedSettings = JSON.parse(savedSettingsRaw);
               if (savedSettings.locationData) {
                  // locationData'yı sadece override etmek için. Biz zaten db'den çektik ama
               }
               if (savedSettings.departments) depts = savedSettings.departments;
               if (savedSettings.roles) locRoles = savedSettings.roles;
             } catch {}
           }
           
           setDepartments(depts);
           setRoles(locRoles);
        }
      } catch (err) {
        console.error("Settings load error:", err);
      }
    };
    init();

    const handleLocationChange = () => {
      init();
    };

    window.addEventListener("optishift_location_changed", handleLocationChange);
    return () => window.removeEventListener("optishift_location_changed", handleLocationChange);
  }, []);

  if (!locationData) {
    // Hesabım sekmesi lokasyon verisine bağımlı değil, direkt göster
    if (activeTab === "account") {
      return (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Lokasyon Ayarları</h1>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-200 px-2 bg-slate-50/50 overflow-x-auto">
              {(["hours","shifts","weights","roles","notifications","account"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 md:px-4 py-3 md:py-3.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}>
                  {tab === "hours" ? "Çalışma Saatleri" : tab === "shifts" ? "Vardiya Şablonları" : tab === "weights" ? "Ağırlıklar" : tab === "roles" ? "Bölgeler" : tab === "notifications" ? "Bildirimler" : "Hesabım"}
                </button>
              ))}
            </div>
            <div className="p-4 md:p-6">
              <div className="max-w-2xl"><AccountTab storageKey="optishift_manager_user" allowNameEdit={true} /></div>
            </div>
          </div>
        </div>
      );
    }
    return <div className="p-8 text-slate-500">Yükleniyor...</div>;
  }

  const handleSave = async () => {
    if (!locationData) return;
    // zone_quotas listesini {zone: min} objesine çevir, boş ve duplicate zone adlarını atla
    const quotasObj: Record<string, number> = {};
    for (const { zone, min } of zoneQuotas) {
      const trimmed = zone.trim();
      if (trimmed) quotasObj[trimmed] = Math.max(0, Math.floor(min));
    }
    try {
      const res = await fetch(`/api/locations?id=${locationData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shift_definitions: locationData.shift_definitions,
          operating_hours: locationData.operating_hours,
          zone_quotas: quotasObj,
          rules: {
            ensure_senior_per_shift: ensureSeniorPerShift,
            max_consecutive_days:    maxConsecutiveDays,
            no_night_to_morning:     noNightToMorning,
            include_managers_in_schedule: includeManagersInSchedule,
            preferred_not_multiplier: preferredNotMultiplier,
          },
          leave_policy: {
            require_reason:       leaveRequireReason,
            allow_multi_day:      leaveAllowMultiDay,
            max_days_per_request: leaveAllowMultiDay ? leaveMaxDays : 1,
          },
        }),
      });
      if (!res.ok) throw new Error("Sunucu hatası");
      // localStorage cache'ini de güncelle (schedule sayfası için)
      localStorage.setItem(`optishift_settings_mock_${locationData.id}`, JSON.stringify({ locationData, departments, roles }));
      localStorage.removeItem("optishift_schedule_config_v2");
      alert("Ayarlar başarıyla kaydedildi!");
    } catch (e) {
      alert("Kaydetme sırasında hata oluştu.");
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Lokasyon Ayarları</h1>
          <p className="text-slate-500 text-sm mt-0.5">{locationData.name}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* TABS */}
        <div className="flex border-b border-slate-200 px-2 bg-slate-50/50 overflow-x-auto">
          <button
            onClick={() => setActiveTab("hours")}
            className={`px-3 md:px-4 py-3 md:py-3.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "hours" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            Çalışma Saatleri
          </button>
          <button
            onClick={() => setActiveTab("shifts")}
            className={`px-3 md:px-4 py-3 md:py-3.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "shifts" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            Vardiya Şablonları
          </button>
          <button
            onClick={() => setActiveTab("weights")}
            className={`px-3 md:px-4 py-3 md:py-3.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "weights" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            Ağırlıklar
          </button>
          <button
            onClick={() => setActiveTab("roles")}
            className={`px-3 md:px-4 py-3 md:py-3.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "roles" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            Bölgeler
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`px-3 md:px-4 py-3 md:py-3.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "notifications" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            Bildirimler
          </button>
          <button
            onClick={() => setActiveTab("account")}
            className={`px-3 md:px-4 py-3 md:py-3.5 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "account" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <UserCircle size={14} />
            Hesabım
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-4 md:p-6">
          {activeTab === "hours" && (
            <div className="space-y-6">
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 flex gap-3 text-blue-800 text-sm">
                <AlertCircle className="shrink-0 text-blue-600 mt-0.5" size={18} />
                <p>
                  Lokasyonun genel açılış ve kapanış saatlerini buradan belirleyin. Personel planlaması ve vardiya şablonları 
                  yalnızca burada açık olduğunuz saatler içinde yapılabilir.
                </p>
              </div>
              <div className="space-y-3">
                {DAYS.map((dayName, idx) => {
                  const dayData = locationData.operating_hours[idx];
                  return (
                    <div key={idx} className="flex flex-wrap items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                      <div className="w-28 md:w-32 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={dayData.isOpen}
                          onChange={(e) => {
                            const newHours = { ...locationData.operating_hours };
                            newHours[idx] = { ...newHours[idx], isOpen: e.target.checked };
                            setLocationData({ ...locationData, operating_hours: newHours });
                          }}
                          className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-600 cursor-pointer"
                        />
                        <span className={`text-sm font-medium ${dayData.isOpen ? "text-slate-700" : "text-slate-400 line-through"}`}>{dayName}</span>
                      </div>
                      <div className={`flex items-center gap-2 ${dayData.isOpen ? "" : "opacity-30 pointer-events-none"}`}>
                        <input
                          type="time"
                          value={dayData.open}
                          onChange={(e) => {
                            const newHours = { ...locationData.operating_hours };
                            newHours[idx] = { ...newHours[idx], open: e.target.value };
                            setLocationData({ ...locationData, operating_hours: newHours });
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-indigo-500"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                          type="time"
                          value={dayData.close}
                          onChange={(e) => {
                            const newHours = { ...locationData.operating_hours };
                            newHours[idx] = { ...newHours[idx], close: e.target.value };
                            setLocationData({ ...locationData, operating_hours: newHours });
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-indigo-500"
                        />
                      </div>
                      {!dayData.isOpen && <div className="text-sm text-red-500 font-medium ml-4">Kapalı</div>}
                    </div>
                  );
                })}
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <Save size={16} /> Çalışma Saatlerini Kaydet
                </button>
              </div>
            </div>
          )}

          {activeTab === "shifts" && (
            <div className="space-y-6">
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4 flex gap-3 text-indigo-800 text-sm">
                <AlertCircle className="shrink-0 text-indigo-600 mt-0.5" size={18} />
                <p>
                  Lokasyonunuzda kullanılan standart vardiya bloklarını (Örn: Açılış, Ara, Kapanış) belirleyin. 
                  Personeller bu şablonları tercih edebilir, yöneticiler planı bu şablonlara göre çıkarır.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {locationData.shift_definitions.map((shift, idx) => (
                  <div key={shift.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <input 
                        value={shift.name} 
                        onChange={(e) => {
                          const newShifts = [...locationData.shift_definitions];
                          newShifts[idx].name = e.target.value;
                          setLocationData({ ...locationData, shift_definitions: newShifts });
                        }}
                        className="font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none px-1 py-0.5"
                      />
                      <button 
                        onClick={() => {
                          const newShifts = locationData.shift_definitions.filter((_, i) => i !== idx);
                          setLocationData({ ...locationData, shift_definitions: newShifts });
                        }}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="time" 
                        value={shift.start} 
                        onChange={(e) => {
                          const newShifts = [...locationData.shift_definitions];
                          newShifts[idx].start = e.target.value;
                          setLocationData({ ...locationData, shift_definitions: newShifts });
                        }}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm outline-none focus:border-indigo-500 w-full"
                      />
                      <span className="text-slate-400">-</span>
                      <input 
                        type="time" 
                        value={shift.end} 
                        onChange={(e) => {
                          const newShifts = [...locationData.shift_definitions];
                          newShifts[idx].end = e.target.value;
                          setLocationData({ ...locationData, shift_definitions: newShifts });
                        }}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm outline-none focus:border-indigo-500 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Zorluk Puanı (Base Points)</label>
                      <input 
                        type="number" 
                        value={shift.base_points} 
                        onChange={(e) => {
                          const newShifts = [...locationData.shift_definitions];
                          newShifts[idx].base_points = Number(e.target.value);
                          setLocationData({ ...locationData, shift_definitions: newShifts });
                        }}
                        className="w-20 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => {
                    const newShifts = [...locationData.shift_definitions, { id: `s${Date.now()}`, name: "Yeni Vardiya", start: "12:00", end: "20:00", base_points: 3 }];
                    setLocationData({ ...locationData, shift_definitions: newShifts });
                  }}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors min-h-[160px]"
                >
                  <Plus size={24} className="mb-2" />
                  <span className="font-medium">Yeni Vardiya Ekle</span>
                </button>
              </div>
              {/* Kural Motoru Toggleları */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Vardiya Kuralları (OR-Tools)</h3>

                {/* Kıdemli Personel Kısıtı */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Kıdemli Personel Kısıtı</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Aktif olduğunda her vardiyaya en az 1 <span className="font-semibold text-indigo-700">primary</span> seviyeli personel atanır (soft constraint).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnsureSeniorPerShift(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${ensureSeniorPerShift ? "bg-indigo-600" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ensureSeniorPerShift ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {/* Müdürü Planlamaya Dahil Et */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Müdürü Planlamaya Dahil Et</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Aktif olduğunda otomatik oluşturma müdür ve admin rolündeki kişilere de vardiya atar. Kapalıyken manuel atama yine mümkündür.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeManagersInSchedule(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${includeManagersInSchedule ? "bg-indigo-600" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${includeManagersInSchedule ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {/* Tercih Edilmeyen Gün Çarpanı */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">Tercih Edilmeyen Gün Çarpanı</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Personel bir günü <span className="font-semibold text-amber-600">sarı</span> (tercih etmiyorum) işaretlemişse ve yine de o güne atanırsa, vardiya puanı bu çarpanla çarpılır. Fedakarlık adalet puanına yansır.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 font-semibold">×</span>
                    <input
                      type="number"
                      min={1}
                      max={3}
                      step={0.25}
                      value={preferredNotMultiplier}
                      onChange={e => setPreferredNotMultiplier(Math.min(3, Math.max(1, parseFloat(e.target.value) || 1.5)))}
                      className="w-20 px-3 py-2 text-sm font-bold text-slate-800 bg-white border border-slate-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Gececi→Sabahçı Yasağı */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Gececi→Sabahçı Yasağı</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Aktif olduğunda ≥23:00 biten gece vardiyasından sonraki gün ≤12:00 başlayan sabah vardiyası atanmaz (hard constraint).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoNightToMorning(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${noNightToMorning ? "bg-indigo-600" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${noNightToMorning ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {/* Ardışık Gün Limiti */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">Maksimum Ardışık Çalışma Günü</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Personel arka arkaya en fazla bu kadar gün çalışabilir. 7 = sınır yok.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={maxConsecutiveDays}
                      onChange={e => setMaxConsecutiveDays(Math.min(7, Math.max(1, parseInt(e.target.value) || 6)))}
                      className="w-14 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400">gün</span>
                  </div>
                </div>
              </div>

              {/* İzin Politikası */}
              <div className="mt-6">
                <h3 className="text-sm font-bold text-slate-700 mb-3">İzin Politikası</h3>
                <div className="space-y-3">
                  {/* Mazeret Zorunluluğu */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">İzin İçin Mazeret Zorunlu</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Aktifse personel izin talebi oluştururken mazeret girmeden gönderemez.
                      </p>
                    </div>
                    <button
                      onClick={() => setLeaveRequireReason(v => !v)}
                      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${leaveRequireReason ? "bg-indigo-600" : "bg-slate-200"}`}
                    >
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${leaveRequireReason ? "translate-x-4" : ""}`} />
                    </button>
                  </div>

                  {/* Çoklu Gün İzin */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">Çoklu Gün İzin Talebi</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Kapalıysa personel yalnızca tek günlük izin talep edebilir. Part-time için açmayı düşünün.
                      </p>
                      {leaveAllowMultiDay && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs text-slate-500">Tek talep için max:</span>
                          <input
                            type="number"
                            min={2}
                            max={30}
                            value={leaveMaxDays}
                            onChange={e => setLeaveMaxDays(Math.min(30, Math.max(2, parseInt(e.target.value) || 2)))}
                            className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-indigo-500"
                          />
                          <span className="text-xs text-slate-400">gün</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setLeaveAllowMultiDay(v => !v)}
                      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${leaveAllowMultiDay ? "bg-indigo-600" : "bg-slate-200"}`}
                    >
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${leaveAllowMultiDay ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <Save size={16} /> Ayarları Kaydet
                </button>
              </div>
            </div>
          )}

          {activeTab === "weights" && (
            <div className="space-y-6">
              <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-4 flex gap-3 text-amber-800 text-sm">
                <AlertCircle className="shrink-0 text-amber-600 mt-0.5" size={18} />
                <p>
                  Her vardiya tipinin zorluk ağırlığını ayarlayın (1–10). OR-Tools optimizasyon motoru bu ağırlıkları
                  kullanarak personel puan dağılımını dengeler.
                </p>
              </div>

              {locationData.shift_definitions.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <p className="font-semibold">Vardiya tanımı yok.</p>
                  <p className="text-sm mt-1">Önce <button onClick={() => setActiveTab("shifts")} className="text-indigo-600 font-bold hover:underline">Vardiya Şablonları</button> sekmesinden vardiya ekleyin.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {locationData.shift_definitions.map((shift: ShiftDefinition, idx: number) => (
                    <div key={shift.id} className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <span className="font-bold text-slate-800">{shift.name}</span>
                          <span className="ml-2 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                            {shift.start} – {shift.end}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black text-slate-900">{shift.base_points}</span>
                          <span className="text-xs text-slate-400 ml-1">puan</span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={shift.base_points}
                        onChange={e => {
                          const newShifts = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                            i === idx ? { ...s, base_points: Number(e.target.value) } : s
                          );
                          setLocationData({ ...locationData, shift_definitions: newShifts });
                        }}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-600 bg-slate-200 mb-1"
                      />
                      <div className="flex justify-between text-[10px] text-slate-300 font-medium mb-3 px-0.5">
                        {[1,2,3,4,5,6,7,8,9,10].map(n => <span key={n}>{n}</span>)}
                      </div>

                      <DifficultyBar value={shift.base_points} />

                      <p className="text-xs text-slate-400 mt-2">
                        {shift.base_points <= 3 ? "Kolay vardiya — rutin, yoğun olmayan saatler" :
                         shift.base_points <= 5 ? "Orta zorluk — standart çalışma saatleri" :
                         shift.base_points <= 7 ? "Zor vardiya — yoğun veya uzun çalışma" :
                         shift.base_points <= 9 ? "Çok zor — gece/hafta sonu yoğunluğu" :
                         "En ağır vardiya — tüm bonus faktörleri aktif"}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <Save size={16} /> Ağırlıkları Kaydet
                </button>
              </div>
            </div>
          )}

          {activeTab === "roles" && (
            <div className="space-y-6">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-4 flex gap-3 text-emerald-800 text-sm">
                <AlertCircle className="shrink-0 text-emerald-600 mt-0.5" size={18} />
                <p>
                  Lokasyonunuzdaki fiziksel bölgeleri (alan, istasyon, departman) tanımlayın. Personel bu bölgelere atanabilir; vardiya planında her personelin bölgesi görünür.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {departments.map((dept, dIdx) => (
                  <div key={dept.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                    <input
                      value={dept.name}
                      onChange={(e) => {
                        const newDepts = [...departments];
                        newDepts[dIdx].name = e.target.value;
                        setDepartments(newDepts);
                      }}
                      className="flex-1 font-semibold text-slate-800 bg-transparent outline-none text-sm border-b border-transparent hover:border-slate-300 focus:border-indigo-500 py-0.5"
                      placeholder="Bölge adı"
                    />
                    <button
                      onClick={() => setDepartments(departments.filter((_, i) => i !== dIdx))}
                      className="p-1 text-slate-300 hover:text-red-400 rounded-lg transition-colors shrink-0"
                      title="Sil"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => {
                    const newDepts = [...departments, { id: `d${Date.now()}`, location_id: locationData.id, name: "Yeni Bölge" }];
                    setDepartments(newDepts);
                  }}
                  className="border-2 border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-sm font-medium"
                >
                  <Plus size={16} /> Yeni Bölge Ekle
                </button>
              </div>

              {/* Günlük Minimum Kota */}
              <div className="border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Günlük Alan Kotaları</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Her bölgede günde en az kaç kişi çalışmalı? OR-Tools bu kural dahilinde optimize eder.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {zoneQuotas.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <input
                        value={entry.zone}
                        onChange={(e) => {
                          const next = [...zoneQuotas];
                          next[idx] = { ...next[idx], zone: e.target.value };
                          setZoneQuotas(next);
                        }}
                        placeholder="Yetenek adı (Örn: Kasa)"
                        className="flex-1 text-sm bg-transparent outline-none border-b border-transparent hover:border-slate-300 focus:border-indigo-500 py-0.5 text-slate-800"
                      />
                      <span className="text-xs text-slate-400 shrink-0">min</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={entry.min}
                        onChange={(e) => {
                          const next = [...zoneQuotas];
                          next[idx] = { ...next[idx], min: Number(e.target.value) };
                          setZoneQuotas(next);
                        }}
                        className="w-16 text-sm text-center bg-white border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-indigo-500"
                      />
                      <span className="text-xs text-slate-400 shrink-0">kişi/gün</span>
                      <button
                        onClick={() => setZoneQuotas(zoneQuotas.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setZoneQuotas([...zoneQuotas, { zone: "", min: 1 }])}
                    className="w-full border border-dashed border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Kota Ekle
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <Save size={16} /> Bölgeleri Kaydet
                </button>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-6">
              <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-4 flex gap-3 text-amber-800 text-sm">
                <Bell className="shrink-0 text-amber-600 mt-0.5" size={18} />
                <p>
                  Müsaitlik girmemiş personele otomatik hatırlatma gönderin. Her hafta belirttiğiniz gün ve saatte tetiklenir.
                </p>
              </div>

              {/* Otomatik Hatırlatma Toggle */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-700 text-sm">Otomatik Müsaitlik Hatırlatması</div>
                    <div className="text-xs text-slate-400 mt-0.5">Haftada bir kez müsaitlik girmeyen personele bildirim gönderilir</div>
                  </div>
                  <button
                    onClick={() => setReminderEnabled(prev => !prev)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${reminderEnabled ? "bg-indigo-600" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${reminderEnabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {reminderEnabled && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                    <span className="text-sm text-slate-600">Her</span>
                    <select
                      value={reminderDay}
                      onChange={e => setReminderDay(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                    >
                      {["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"].map((d, i) => (
                        <option key={i} value={String(i)}>{d}</option>
                      ))}
                    </select>
                    <span className="text-sm text-slate-600">günü saat</span>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={e => setReminderTime(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                    />
                    <span className="text-sm text-slate-600">'de hatırlatma gönder</span>
                  </div>
                )}
              </div>

              {/* Manuel Gönder */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="font-semibold text-slate-700 text-sm mb-1">Şimdi Hatırlatma Gönder</div>
                <p className="text-xs text-slate-400 mb-4">Bu haftanın müsaitliğini henüz girmemiş tüm personele anında bildirim gönderir.</p>
                {remindResult && (
                  <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                    {remindResult}
                  </div>
                )}
                <button
                  disabled={reminding}
                  onClick={async () => {
                    setReminding(true);
                    setRemindResult(null);
                    try {
                      const userRaw = localStorage.getItem("optishift_manager_user");
                      const u = userRaw ? JSON.parse(userRaw) : null;
                      const locId = localStorage.getItem("optishift_selected_location") || u?.location_id || "";
                      const res = await fetch("/api/availability/remind", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ org_id: u?.org_id, location_id: locId }),
                      });
                      const data = await res.json();
                      setRemindResult(data.sent > 0
                        ? `${data.sent} personele hatırlatma gönderildi.`
                        : "Tüm personel zaten müsaitliğini girmiş.");
                    } catch {
                      setRemindResult("Hata oluştu, tekrar deneyin.");
                    }
                    setReminding(false);
                  }}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <Send size={14} /> {reminding ? "Gönderiliyor…" : "Hatırlatma Gönder"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "account" && (
            <div className="max-w-2xl">
              <AccountTab storageKey="optishift_manager_user" allowNameEdit={true} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

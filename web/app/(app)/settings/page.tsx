"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { Save, Plus, X, Send, UserCircle, Moon, Pencil, Check } from "lucide-react";
import type { Location, ShiftDefinition, Department, Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import AccountTab from "@/components/AccountTab";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

type TabKey = "shifts" | "rules" | "zones" | "account";

const TABS: { key: TabKey; label: string }[] = [
  { key: "shifts",  label: "Vardiyalar" },
  { key: "rules",   label: "Kurallar" },
  { key: "zones",   label: "Bölgeler" },
  { key: "account", label: "Hesap & Bildirimler" },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-slate-200"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  prefix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  prefix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {prefix && <span className="text-xs text-slate-400 font-semibold">{prefix}</span>}
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={e => {
          const raw = step && step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value);
          if (!isNaN(raw)) onChange(Math.min(max, Math.max(min, raw)));
        }}
        className="w-20 px-3 py-2 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      {suffix && <span className="text-xs text-slate-400 font-semibold">{suffix}</span>}
    </div>
  );
}

function RuleRow({ label, description, right }: { label: string; description: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="shrink-0 mt-0.5">{right}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-100">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-5 divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{children}</h3>;
}

// Shared time input style — same everywhere on the page
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 w-28"
    />
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("shifts");
  const [editingDeptIdx, setEditingDeptIdx] = useState<number | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Bildirim state
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDay, setReminderDay] = useState("0");
  const [reminderTime, setReminderTime] = useState("18:00");
  const [reminding, setReminding] = useState(false);
  const [remindResult, setRemindResult] = useState<string | null>(null);

  // Lokasyon state
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locationData, setLocationData] = useState<Location | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [zoneQuotas, setZoneQuotas] = useState<{ zone: string; min: number }[]>([]);

  // Kural toggle'ları
  const [ensureSeniorPerShift, setEnsureSeniorPerShift]           = useState(false);
  const [maxConsecutiveDays, setMaxConsecutiveDays]               = useState(6);
  const [noNightToMorning, setNoNightToMorning]                   = useState(false);
  const [includeManagersInSchedule, setIncludeManagersInSchedule] = useState(false);
  const [preferredNotMultiplier, setPreferredNotMultiplier]       = useState(1.5);
  const [maxPreferredNotDays, setMaxPreferredNotDays]             = useState(1);
  const [clopeningMinRestHours, setClopeningMinRestHours]         = useState(13);
  const [maxWeeklyHours, setMaxWeeklyHours]                       = useState(45);
  const [minRestHours, setMinRestHours]                           = useState(11);
  const [changeCompensationPoints, setChangeCompensationPoints]   = useState(2);
  const [leaveOverrideBonus, setLeaveOverrideBonus]               = useState(1.5);
  const [weekendMultiplier, setWeekendMultiplier]                 = useState(1.2);
  const [nightMultiplier, setNightMultiplier]                     = useState(1.3);

  // Ek toggle'lar
  const [clopeningEnabled, setClopeningEnabled]                   = useState(true);
  const [swapRequestsEnabled, setSwapRequestsEnabled]             = useState(true);
  const [editRequestsEnabled, setEditRequestsEnabled]             = useState(true);
  const [checkinRequired, setCheckinRequired]                     = useState(false);
  const [autoOpenShiftOnLate, setAutoOpenShiftOnLate]             = useState(true);
  const [lateThresholdMin, setLateThresholdMin]                   = useState(30);
  const [maxConcurrentBreaks, setMaxConcurrentBreaks]             = useState(2);
  const [prePublishCheckEnabled, setPrePublishCheckEnabled]       = useState(true);
  const [heroBonusEnabled, setHeroBonusEnabled]                   = useState(true);
  const [weekendMultiplierEnabled, setWeekendMultiplierEnabled]   = useState(true);
  const [nightMultiplierEnabled, setNightMultiplierEnabled]       = useState(true);
  const [publishLeadKpiEnabled, setPublishLeadKpiEnabled]         = useState(true);

  // İzin politikası
  const [leaveRequireReason, setLeaveRequireReason] = useState(false);
  const [leaveAllowMultiDay, setLeaveAllowMultiDay] = useState(false);
  const [leaveMaxDays, setLeaveMaxDays]             = useState(1);

  // Konum (hava durumu için) — lat/lon DB'de, kullanıcı şehir adı veya GPS butonu ile ayarlar
  const [locationLat, setLocationLat]       = useState("");
  const [locationLon, setLocationLon]       = useState("");
  const [locationCityInput, setLocationCityInput] = useState("");
  const [weatherStatus, setWeatherStatus]   = useState<"idle" | "searching" | "found" | "error">("idle");
  const [weatherLabel, setWeatherLabel]     = useState("");

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
          let targetLoc = data.find((x: { id: string }) => x.id === savedId);
          let finalId = savedId;
          if (!targetLoc) {
            targetLoc = data[0];
            finalId = targetLoc.id;
            if (finalId) localStorage.setItem("optishift_selected_location", finalId);
          }
          if (finalId) setSelectedLocationId(finalId);

          const loc = JSON.parse(JSON.stringify(targetLoc));
          if (typeof loc.shift_definitions === "string") { try { loc.shift_definitions = JSON.parse(loc.shift_definitions); } catch { loc.shift_definitions = []; } }
          if (typeof loc.operating_hours === "string")   { try { loc.operating_hours   = JSON.parse(loc.operating_hours);   } catch { loc.operating_hours = {};   } }
          if (typeof loc.zone_quotas === "string")       { try { loc.zone_quotas       = JSON.parse(loc.zone_quotas);       } catch { loc.zone_quotas = {};       } }
          if (!loc.zone_quotas) loc.zone_quotas = {};
          if (typeof loc.rules === "string")             { try { loc.rules             = JSON.parse(loc.rules);             } catch { loc.rules = {};             } }
          setLocationData(loc);

          setZoneQuotas(Object.entries(loc.zone_quotas as Record<string, number>).map(([zone, min]) => ({ zone, min: Number(min) })));

          setEnsureSeniorPerShift(!!loc.rules?.ensure_senior_per_shift);
          setMaxConsecutiveDays(loc.rules?.max_consecutive_days ?? 6);
          setNoNightToMorning(!!loc.rules?.no_night_to_morning);
          setIncludeManagersInSchedule(!!loc.rules?.include_managers_in_schedule);
          if (typeof loc.rules?.preferred_not_multiplier === "number")  setPreferredNotMultiplier(loc.rules.preferred_not_multiplier);
          if (typeof loc.rules?.max_preferred_not_days === "number")    setMaxPreferredNotDays(loc.rules.max_preferred_not_days);
          if (typeof loc.rules?.clopening_min_rest_hours === "number")  setClopeningMinRestHours(loc.rules.clopening_min_rest_hours);
          if (typeof loc.rules?.max_weekly_hours === "number")          setMaxWeeklyHours(loc.rules.max_weekly_hours);
          if (typeof loc.rules?.min_rest_hours === "number")            setMinRestHours(loc.rules.min_rest_hours);
          if (typeof loc.rules?.change_compensation_points === "number") setChangeCompensationPoints(loc.rules.change_compensation_points);
          if (typeof loc.rules?.leave_override_bonus_multiplier === "number") setLeaveOverrideBonus(loc.rules.leave_override_bonus_multiplier);
          if (typeof loc.rules?.weekend_multiplier === "number")        setWeekendMultiplier(loc.rules.weekend_multiplier);
          if (typeof loc.rules?.night_multiplier === "number")          setNightMultiplier(loc.rules.night_multiplier);

          setClopeningEnabled(loc.rules?.clopening_enabled !== false);
          setSwapRequestsEnabled(loc.rules?.swap_requests_enabled !== false);
          setEditRequestsEnabled(loc.rules?.edit_requests_enabled !== false);
          setCheckinRequired(!!loc.rules?.checkin_required);
          setAutoOpenShiftOnLate(loc.rules?.auto_open_shift_on_late !== false);
          if (typeof loc.rules?.late_threshold_min === "number")        setLateThresholdMin(loc.rules.late_threshold_min);
          if (typeof loc.rules?.max_concurrent_breaks === "number")     setMaxConcurrentBreaks(loc.rules.max_concurrent_breaks);
          setPrePublishCheckEnabled(loc.rules?.pre_publish_check !== false);
          setHeroBonusEnabled(loc.rules?.hero_bonus_enabled !== false);
          setWeekendMultiplierEnabled(loc.rules?.weekend_multiplier_enabled !== false);
          setNightMultiplierEnabled(loc.rules?.night_multiplier_enabled !== false);
          setPublishLeadKpiEnabled(loc.rules?.publish_lead_kpi_enabled !== false);

          if (typeof loc.leave_policy === "string") { try { loc.leave_policy = JSON.parse(loc.leave_policy); } catch { loc.leave_policy = {}; } }
          const lat = loc.latitude != null ? String(loc.latitude) : "";
          const lon = loc.longitude != null ? String(loc.longitude) : "";
          setLocationLat(lat);
          setLocationLon(lon);
          if (lat && lon) {
            setWeatherStatus("found");
            // Ters geocode — şehir adını göster
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=tr`)
              .then(r => r.json())
              .then((d: any) => {
                const city = d.address?.city || d.address?.town || d.address?.village || d.address?.county || "";
                const country = d.address?.country || "";
                setWeatherLabel(city ? `${city}, ${country}` : `${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}`);
              })
              .catch(() => setWeatherLabel(`${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}`));
          }
          const lp = loc.leave_policy || {};
          setLeaveRequireReason(!!lp.require_reason);
          setLeaveAllowMultiDay(!!lp.allow_multi_day);
          setLeaveMaxDays(lp.max_days_per_request ?? 1);

          let depts: Department[] = [];
          try {
            const dres = await fetch(`/api/departments?location_id=${finalId}`);
            if (dres.ok) { const draw = await dres.json(); if (Array.isArray(draw)) depts = draw; }
          } catch { /* empty */ }
          let locRoles: Role[] = [];

          const savedRaw = finalId ? localStorage.getItem(`optishift_settings_mock_${finalId}`) : null;
          if (savedRaw) {
            try {
              const saved = JSON.parse(savedRaw);
              if (saved.departments) depts = saved.departments;
              if (saved.roles) locRoles = saved.roles;
            } catch { /* empty */ }
          }
          setDepartments(depts);
          setRoles(locRoles);
        }
      } catch (err) {
        console.error("Settings load error:", err);
      }
    };

    init();
    window.addEventListener("optishift_location_changed", init);
    return () => window.removeEventListener("optishift_location_changed", init);
  }, []);

  const geocodeCity = async (city: string): Promise<{ lat: number; lon: number; label: string } | null> => {
    try {
      setWeatherStatus("searching");
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`);
      const d = await r.json();
      const result = d.results?.[0];
      if (!result) { setWeatherStatus("error"); return null; }
      const label = [result.name, result.admin1, result.country].filter(Boolean).join(", ");
      setWeatherLabel(label);
      setWeatherStatus("found");
      return { lat: result.latitude, lon: result.longitude, label };
    } catch {
      setWeatherStatus("error");
      return null;
    }
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) { alert("Tarayıcınız konum özelliğini desteklemiyor."); return; }
    setWeatherStatus("searching");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setLocationLat(String(latitude));
        setLocationLon(String(longitude));
        setWeatherStatus("found");
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=tr`)
          .then(r => r.json())
          .then((d: any) => {
            const city = d.address?.city || d.address?.town || d.address?.village || "";
            setWeatherLabel(city ? `${city}, Türkiye` : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          })
          .catch(() => setWeatherLabel(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`));
      },
      () => { setWeatherStatus("error"); alert("Konum alınamadı. Tarayıcı iznini kontrol edin."); }
    );
  };

  const handleSave = async () => {
    if (!locationData) return;

    // Şehir adı girildiyse önce geocode et
    let finalLat = locationLat;
    let finalLon = locationLon;
    if (locationCityInput.trim()) {
      const geo = await geocodeCity(locationCityInput.trim());
      if (geo) {
        finalLat = String(geo.lat);
        finalLon = String(geo.lon);
        setLocationLat(finalLat);
        setLocationLon(finalLon);
        setLocationCityInput("");
      }
    }
    const quotasObj: Record<string, number> = {};
    for (const { zone, min } of zoneQuotas) {
      const t = zone.trim();
      if (t) quotasObj[t] = Math.max(0, Math.floor(min));
    }
    try {
      const res = await fetch(`/api/locations?id=${locationData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shift_definitions: locationData.shift_definitions,
          operating_hours:   locationData.operating_hours,
          zone_quotas:       quotasObj,
          rules: {
            ensure_senior_per_shift:      ensureSeniorPerShift,
            max_consecutive_days:         maxConsecutiveDays,
            no_night_to_morning:          noNightToMorning,
            include_managers_in_schedule: includeManagersInSchedule,
            preferred_not_multiplier:     preferredNotMultiplier,
            max_preferred_not_days:       maxPreferredNotDays,
            clopening_min_rest_hours:     clopeningMinRestHours,
            max_weekly_hours:             maxWeeklyHours,
            min_rest_hours:               minRestHours,
            change_compensation_points:         changeCompensationPoints,
            leave_override_bonus_multiplier:    leaveOverrideBonus,
            weekend_multiplier:                 weekendMultiplier,
            night_multiplier:                   nightMultiplier,
            clopening_enabled:                  clopeningEnabled,
            swap_requests_enabled:              swapRequestsEnabled,
            edit_requests_enabled:              editRequestsEnabled,
            checkin_required:                   checkinRequired,
            auto_open_shift_on_late:            autoOpenShiftOnLate,
            late_threshold_min:                 lateThresholdMin,
            max_concurrent_breaks:              maxConcurrentBreaks,
            pre_publish_check:                  prePublishCheckEnabled,
            hero_bonus_enabled:                 heroBonusEnabled,
            weekend_multiplier_enabled:         weekendMultiplierEnabled,
            night_multiplier_enabled:           nightMultiplierEnabled,
            publish_lead_kpi_enabled:           publishLeadKpiEnabled,
          },
          leave_policy: {
            require_reason:       leaveRequireReason,
            allow_multi_day:      leaveAllowMultiDay,
            max_days_per_request: leaveAllowMultiDay ? leaveMaxDays : 1,
          },
          latitude:  finalLat ? parseFloat(finalLat) : null,
          longitude: finalLon ? parseFloat(finalLon) : null,
        }),
      });
      if (!res.ok) throw new Error("Sunucu hatası");
      localStorage.setItem(`optishift_settings_mock_${locationData.id}`, JSON.stringify({ locationData, departments, roles }));
      localStorage.removeItem("optishift_schedule_config_v2");
      alert("Ayarlar kaydedildi!");
    } catch {
      alert("Kaydetme sırasında hata oluştu.");
    }
  };

  const pointsColor = (v: number) =>
    v <= 3 ? "text-emerald-600" : v <= 6 ? "text-amber-600" : v <= 8 ? "text-orange-600" : "text-red-600";

  const TabBar = () => (
    <div className="flex border-b border-slate-200 px-2 bg-slate-50/50 overflow-x-auto">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === tab.key
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          {tab.key === "account" && <UserCircle size={13} />}
          {tab.label}
        </button>
      ))}
    </div>
  );

  if (!locationData) {
    if (activeTab === "account") {
      return (
        <div className="max-w-4xl space-y-6">
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Lokasyon Ayarları</h1>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <TabBar />
            <div className="p-6"><AccountTab storageKey="optishift_manager_user" allowNameEdit={true} /></div>
          </div>
        </div>
      );
    }
    return <div className="p-8 text-slate-500">Yükleniyor...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Lokasyon Ayarları</h1>
        <p className="text-slate-500 text-sm mt-0.5">{locationData.name}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <TabBar />

        <div className="p-5 md:p-6">

          {/* ─── VARDIYALAR ─── */}
          {activeTab === "shifts" && (
            <div className="space-y-8">

              {/* 1. Çalışma Saatleri — lokasyonun açık olduğu saatler */}
              <div>
                <SectionLabel>Çalışma Saatleri</SectionLabel>
                <p className="text-xs text-slate-400 mb-3">Lokasyonun her gün kaçta açılıp kaçta kapandığını belirleyin. Vardiya saatleri bu aralık içinde kalmalıdır.</p>
                <div className="space-y-1">
                  {DAYS.map((dayName, idx) => {
                    const dayData = locationData.operating_hours[idx];
                    return (
                      <div key={idx} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                        <label className="flex items-center gap-2 cursor-pointer w-32">
                          <input
                            type="checkbox"
                            checked={dayData.isOpen}
                            onChange={e => {
                              const next = { ...locationData.operating_hours };
                              next[idx] = { ...next[idx], isOpen: e.target.checked };
                              setLocationData({ ...locationData, operating_hours: next });
                            }}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-600 cursor-pointer"
                          />
                          <span className={`text-sm font-medium ${dayData.isOpen ? "text-slate-700" : "text-slate-400 line-through"}`}>{dayName}</span>
                        </label>
                        <div className={`flex items-center gap-2 ${dayData.isOpen ? "" : "opacity-30 pointer-events-none"}`}>
                          <TimeInput value={dayData.open} onChange={v => {
                            const next = { ...locationData.operating_hours };
                            next[idx] = { ...next[idx], open: v };
                            setLocationData({ ...locationData, operating_hours: next });
                          }} />
                          <span className="text-slate-300 text-sm">–</span>
                          <TimeInput value={dayData.close} onChange={v => {
                            const next = { ...locationData.operating_hours };
                            next[idx] = { ...next[idx], close: v };
                            setLocationData({ ...locationData, operating_hours: next });
                          }} />
                        </div>
                        {!dayData.isOpen && <span className="text-xs text-slate-400">Kapalı</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* 2. Vardiya Tanımları */}
              <div>
                <SectionLabel>Vardiya Tanımları</SectionLabel>
                <p className="text-xs text-slate-400 mb-3">Her vardiya bloğunun adını, saatlerini ve zorluk ağırlığını tanımlayın.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {locationData.shift_definitions.map((shift: ShiftDefinition, idx: number) => (
                    <div key={shift.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                      {/* Ad + Gece badge + Sil */}
                      <div className="flex items-center gap-2">
                        <input
                          value={shift.name}
                          onChange={e => {
                            const next = [...locationData.shift_definitions];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setLocationData({ ...locationData, shift_definitions: next });
                          }}
                          className="flex-1 font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none px-1 py-0.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                              i === idx ? { ...s, is_night: !s.is_night } : s
                            );
                            setLocationData({ ...locationData, shift_definitions: next });
                          }}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors",
                            shift.is_night
                              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                              : "bg-white border-slate-200 text-slate-300 hover:text-slate-500"
                          )}
                        >
                          <Moon size={10} /> Gece
                        </button>
                        <button
                          onClick={() => {
                            const next = locationData.shift_definitions.filter((_: ShiftDefinition, i: number) => i !== idx);
                            setLocationData({ ...locationData, shift_definitions: next });
                          }}
                          className="text-slate-300 hover:text-red-400 p-1 transition-colors"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {/* Saat — same TimeInput component as operating hours above */}
                      <div className="flex items-center gap-2">
                        <TimeInput value={shift.start} onChange={v => {
                          const next = [...locationData.shift_definitions];
                          next[idx] = { ...next[idx], start: v };
                          setLocationData({ ...locationData, shift_definitions: next });
                        }} />
                        <span className="text-slate-300 text-sm">–</span>
                        <TimeInput value={shift.end} onChange={v => {
                          const next = [...locationData.shift_definitions];
                          next[idx] = { ...next[idx], end: v };
                          setLocationData({ ...locationData, shift_definitions: next });
                        }} />
                      </div>

                      {/* Zorluk slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Zorluk ağırlığı</span>
                          <span className={cn("text-sm font-black", pointsColor(shift.base_points))}>{shift.base_points}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={shift.base_points}
                          onChange={e => {
                            const next = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                              i === idx ? { ...s, base_points: Number(e.target.value) } : s
                            );
                            setLocationData({ ...locationData, shift_definitions: next });
                          }}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600 bg-slate-200"
                        />
                        <div className="flex justify-between text-[9px] text-slate-300 px-0.5">
                          <span>Kolay</span><span>Orta</span><span>Zor</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => {
                      const next = [
                        ...locationData.shift_definitions,
                        { id: `s${Date.now()}`, name: "Yeni Vardiya", start: "12:00", end: "20:00", base_points: 3 },
                      ];
                      setLocationData({ ...locationData, shift_definitions: next });
                    }}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors min-h-[180px]"
                  >
                    <Plus size={22} className="mb-2" />
                    <span className="font-medium text-sm">Yeni Vardiya Ekle</span>
                  </button>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* 3. Yük Çarpanları */}
              <div>
                <SectionLabel>Yük Çarpanları</SectionLabel>
                <p className="text-xs text-slate-400 mb-3">Hafta sonu ve gece vardiyaları adalet hesabında daha ağır sayılır. Kapalıysa o tip vardiyalar normal puan alır.</p>
                <div className="space-y-3">
                  <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Toggle on={weekendMultiplierEnabled} onToggle={() => setWeekendMultiplierEnabled(v => !v)} />
                      <div className={weekendMultiplierEnabled ? "" : "opacity-40"}>
                        <p className="text-sm font-semibold text-slate-800">Hafta Sonu Çarpanı</p>
                        <p className="text-xs text-slate-500 mt-0.5">Cmt–Paz vardiyelerin yük katsayısı</p>
                      </div>
                    </div>
                    <div className={weekendMultiplierEnabled ? "" : "opacity-40 pointer-events-none"}>
                      <NumberInput value={weekendMultiplier} onChange={setWeekendMultiplier} min={1} max={3} step={0.1} prefix="×" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Toggle on={nightMultiplierEnabled} onToggle={() => setNightMultiplierEnabled(v => !v)} />
                      <div className={nightMultiplierEnabled ? "" : "opacity-40"}>
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                          <Moon size={13} className="text-indigo-400" /> Gece Vardiyası Çarpanı
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">"Gece" işaretli vardiyaların yük katsayısı</p>
                      </div>
                    </div>
                    <div className={nightMultiplierEnabled ? "" : "opacity-40 pointer-events-none"}>
                      <NumberInput value={nightMultiplier} onChange={setNightMultiplier} min={1} max={3} step={0.1} prefix="×" />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Toggle on={heroBonusEnabled} onToggle={() => setHeroBonusEnabled(v => !v)} />
                      <div className={heroBonusEnabled ? "" : "opacity-40"}>
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                          ⭐ Kahraman Bonusu
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Açık vardiyayı üstlenen personele 1.5× puan bonusu verilir</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* 4. Adalet & Telafi */}
              <div>
                <SectionLabel>Adalet & Telafi</SectionLabel>
                <div className="space-y-0 border border-slate-200 rounded-xl overflow-hidden">
                  <RuleRow
                    label="Tercih Edilmeyen Gün Çarpanı"
                    description={<>Personel bir günü <span className="font-semibold text-amber-600">sarı</span> işaretlemişse ve o güne atanırsa vardiya yükü bu katsayıyla çarpılır.</>}
                    right={<NumberInput value={preferredNotMultiplier} onChange={setPreferredNotMultiplier} min={1} max={3} step={0.25} prefix="×" />}
                  />
                  <div className="border-t border-slate-100">
                    <RuleRow
                      label="Haftalık Sarı Gün Hakkı"
                      description="Personel haftada en fazla bu kadar günü 'tercih etmiyorum' olarak işaretleyebilir."
                      right={<NumberInput value={maxPreferredNotDays} onChange={setMaxPreferredNotDays} min={0} max={7} suffix="gün" />}
                    />
                  </div>
                  <div className="border-t border-slate-100">
                    <RuleRow
                      label="Clopening Eşiği"
                      description="Kapanış→Açılış geçişinde bu saatin altında dinlenme varsa ihlal modalında işaretlenir."
                      right={<NumberInput value={clopeningMinRestHours} onChange={setClopeningMinRestHours} min={11} max={24} suffix="saat" />}
                    />
                  </div>
                  <div className="border-t border-slate-100">
                    <RuleRow
                      label="Yayın Sonrası Değişiklik Telafisi"
                      description="Yayınlanmış bir vardiyanın saati değiştirildiğinde personele verilecek telafi puanı."
                      right={<NumberInput value={changeCompensationPoints} onChange={setChangeCompensationPoints} min={0} max={10} suffix="puan" />}
                    />
                  </div>
                  <div className="border-t border-slate-100">
                    <RuleRow
                      label="Zorunlu Atama Bonus Çarpanı"
                      description="İzinliyken müdür tarafından atanan personel kabul ederse puan yükü bu katsayıyla çarpılır."
                      right={<NumberInput value={leaveOverrideBonus} onChange={setLeaveOverrideBonus} min={1} max={3} step={0.25} prefix="×" />}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={handleSave} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm">
                  <Save size={16} /> Vardiyaları Kaydet
                </button>
              </div>
            </div>
          )}

          {/* ─── KURALLAR ─── */}
          {activeTab === "rules" && (
            <div className="space-y-4">
              <SectionCard title="Planlama Kısıtları">
                <RuleRow
                  label="Kıdemli Personel Kısıtı"
                  description={<>Her vardiyaya en az 1 <span className="font-semibold text-indigo-700">primary</span> seviyeli personel atanır (soft constraint).</>}
                  right={<Toggle on={ensureSeniorPerShift} onToggle={() => setEnsureSeniorPerShift(v => !v)} />}
                />
                <RuleRow
                  label="Gececi→Sabahçı Yasağı"
                  description="≥23:00 biten gece vardiyasından sonra ≤12:00 başlayan sabah vardiyası atanmaz (hard constraint)."
                  right={<Toggle on={noNightToMorning} onToggle={() => setNoNightToMorning(v => !v)} />}
                />
                <RuleRow
                  label="Müdürü Planlamaya Dahil Et"
                  description="Otomatik oluşturma müdür ve admin rolündeki kişilere de vardiya atar."
                  right={<Toggle on={includeManagersInSchedule} onToggle={() => setIncludeManagersInSchedule(v => !v)} />}
                />
                <RuleRow
                  label="Clopening Uyarısı"
                  description={<>Kapanış→açılış geçişinde <span className="font-semibold">{clopeningMinRestHours} saat</span> altında dinlenme varsa ihlal modalında işaretlenir ve OR-Tools cezalandırır.</>}
                  right={<Toggle on={clopeningEnabled} onToggle={() => setClopeningEnabled(v => !v)} />}
                />
                <RuleRow
                  label="Haftalık Maksimum Çalışma"
                  description="Personelin haftada çalışabileceği yasal üst sınır. OR-Tools bu saati aşan atama yapmaz."
                  right={<NumberInput value={maxWeeklyHours} onChange={setMaxWeeklyHours} min={20} max={60} suffix="saat" />}
                />
                <RuleRow
                  label="Minimum Dinlenme Süresi"
                  description="İki vardiya arasında bulunması gereken en az dinlenme süresi (hard constraint)."
                  right={<NumberInput value={minRestHours} onChange={setMinRestHours} min={8} max={16} suffix="saat" />}
                />
                <RuleRow
                  label="Maks. Ardışık Çalışma"
                  description="Personel arka arkaya en fazla bu kadar gün çalışabilir. 7 = sınır yok."
                  right={<NumberInput value={maxConsecutiveDays} onChange={setMaxConsecutiveDays} min={1} max={7} suffix="gün" />}
                />
              </SectionCard>

              <SectionCard title="Personel Talepleri">
                <RuleRow
                  label="Vardiya Takas Talebi"
                  description="Personel, başka bir çalışanla vardiya takası talebinde bulunabilir. Müdür onayı gerekir."
                  right={<Toggle on={swapRequestsEnabled} onToggle={() => setSwapRequestsEnabled(v => !v)} />}
                />
                <RuleRow
                  label="Vardiya Değişiklik Talebi"
                  description="Personel, atandığı vardiyanın saatini veya gününü değiştirmek için müdüre talep gönderebilir."
                  right={<Toggle on={editRequestsEnabled} onToggle={() => setEditRequestsEnabled(v => !v)} />}
                />
              </SectionCard>

              <SectionCard title="Canlı Operasyon">
                <RuleRow
                  label="Check-in Zorunluluğu"
                  description="Personel portaldaki vardiya kartından check-in yapmadan aktif sayılmaz. Check-in yoksa geç kalan listesine düşer."
                  right={<Toggle on={checkinRequired} onToggle={() => setCheckinRequired(v => !v)} />}
                />
                <RuleRow
                  label="Geç Kalan → Otomatik Açık Vardiya"
                  description={
                    <span>
                      Vardiya başlangıcından <span className="font-semibold">{lateThresholdMin} dakika</span> sonra hâlâ check-in olmayan personelin vardiyası otomatik açık vardiyaya dönüşür.
                      {autoOpenShiftOnLate && (
                        <span className="flex items-center gap-2 mt-2">
                          <span>Eşik:</span>
                          <input
                            type="number" min={10} max={120} value={lateThresholdMin}
                            onChange={e => setLateThresholdMin(Math.min(120, Math.max(10, parseInt(e.target.value) || 30)))}
                            className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-indigo-500"
                          />
                          <span>dakika</span>
                        </span>
                      )}
                    </span>
                  }
                  right={<Toggle on={autoOpenShiftOnLate} onToggle={() => setAutoOpenShiftOnLate(v => !v)} />}
                />
                <RuleRow
                  label="Eş Zamanlı Mola Limiti"
                  description="Aynı anda molaya çıkabilecek maksimum kişi sayısı. Aşılınca müdür panelinde uyarı gösterilir."
                  right={<NumberInput value={maxConcurrentBreaks} onChange={setMaxConcurrentBreaks} min={1} max={10} suffix="kişi" />}
                />
              </SectionCard>

              <SectionCard title="Yayın Akışı">
                <RuleRow
                  label="Yayın Öncesi İhlal Kontrolü"
                  description="'Yayınla' butonuna basılmadan önce kural ihlalleri taranır ve onay modalı gösterilir."
                  right={<Toggle on={prePublishCheckEnabled} onToggle={() => setPrePublishCheckEnabled(v => !v)} />}
                />
              </SectionCard>

              <SectionCard title="İzin Politikası">
                <RuleRow
                  label="İzin İçin Mazeret Zorunlu"
                  description="Personel izin talebi oluştururken mazeret girmeden gönderemez."
                  right={<Toggle on={leaveRequireReason} onToggle={() => setLeaveRequireReason(v => !v)} />}
                />
                <RuleRow
                  label="Çoklu Gün İzin Talebi"
                  description={
                    <span>
                      Personel birden fazla günü kapsayan izin talebi oluşturabilir.
                      {leaveAllowMultiDay && (
                        <span className="flex items-center gap-2 mt-2">
                          <span>Tek talep için max:</span>
                          <input
                            type="number" min={2} max={30} value={leaveMaxDays}
                            onChange={e => setLeaveMaxDays(Math.min(30, Math.max(2, parseInt(e.target.value) || 2)))}
                            className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-indigo-500"
                          />
                          <span>gün</span>
                        </span>
                      )}
                    </span>
                  }
                  right={<Toggle on={leaveAllowMultiDay} onToggle={() => setLeaveAllowMultiDay(v => !v)} />}
                />
              </SectionCard>

              <SectionCard title="Konum & Hava Durumu">
                <RuleRow
                  label="Şube Konumu"
                  description="Ayarlandıktan sonra vardiya takviminde o haftanın günlük hava durumu ikonları görünür."
                  right={
                    <div className="flex flex-col items-end gap-2 min-w-[220px]">
                      {/* Mevcut konum göstergesi */}
                      {weatherStatus === "found" && weatherLabel && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg w-full justify-between">
                          <span>📍 <span className="font-semibold">{weatherLabel}</span></span>
                          <button
                            onClick={() => { setLocationLat(""); setLocationLon(""); setWeatherLabel(""); setWeatherStatus("idle"); }}
                            className="text-emerald-400 hover:text-red-400 transition-colors ml-1"
                            title="Konumu sıfırla"
                          >×</button>
                        </div>
                      )}
                      {weatherStatus === "searching" && (
                        <span className="text-xs text-slate-400 animate-pulse">Aranıyor...</span>
                      )}
                      {weatherStatus === "error" && (
                        <span className="text-xs text-red-500">Bulunamadı, tekrar deneyin.</span>
                      )}
                      {/* Şehir / ilçe ara */}
                      {weatherStatus !== "found" && (
                        <div className="flex items-center gap-1.5 w-full">
                          <input
                            type="text"
                            value={locationCityInput}
                            onChange={e => setLocationCityInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && locationCityInput.trim()) {
                                geocodeCity(locationCityInput.trim()).then(geo => {
                                  if (geo) { setLocationLat(String(geo.lat)); setLocationLon(String(geo.lon)); setLocationCityInput(""); }
                                });
                              }
                            }}
                            placeholder="İstanbul, Kadıköy..."
                            className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => {
                              if (!locationCityInput.trim()) return;
                              geocodeCity(locationCityInput.trim()).then(geo => {
                                if (geo) { setLocationLat(String(geo.lat)); setLocationLon(String(geo.lon)); setLocationCityInput(""); }
                              });
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors shrink-0"
                          >
                            Ara
                          </button>
                        </div>
                      )}
                      {/* Cihaz konumu */}
                      <button
                        onClick={useDeviceLocation}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg px-2.5 py-1.5 hover:bg-indigo-100 transition-colors w-full justify-center font-medium"
                      >
                        📍 Cihaz konumumu kullan
                      </button>
                    </div>
                  }
                />
              </SectionCard>

              <div className="flex justify-end">
                <button onClick={handleSave} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm">
                  <Save size={16} /> Kuralları Kaydet
                </button>
              </div>
            </div>
          )}

          {/* ─── BÖLGELER ─── */}
          {activeTab === "zones" && (
            <div className="space-y-6">
              <p className="text-sm text-slate-500">
                Lokasyondaki fiziksel alanları tanımlayın (Bar, Mutfak, Kasa vb.). Personel bu bölgelere atanabilir.
                İsim değiştirmek için kalem ikonuna tıklayın.
              </p>

              {/* Bölge listesi — read-only by default, explicit edit to change name */}
              <div className="space-y-2">
                {departments.map((dept, dIdx) => (
                  <div
                    key={dept.id}
                    className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 group"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0" />

                    {editingDeptIdx === dIdx ? (
                      <input
                        ref={editInputRef}
                        value={dept.name}
                        onChange={e => {
                          const next = [...departments];
                          next[dIdx] = { ...next[dIdx], name: e.target.value };
                          setDepartments(next);
                        }}
                        onBlur={() => setEditingDeptIdx(null)}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === "Escape") setEditingDeptIdx(null);
                        }}
                        className="flex-1 font-semibold text-slate-800 bg-transparent outline-none text-sm border-b-2 border-indigo-400 py-0.5"
                      />
                    ) : (
                      <span className="flex-1 font-semibold text-slate-800 text-sm select-none">{dept.name}</span>
                    )}

                    {editingDeptIdx === dIdx ? (
                      <button
                        onClick={() => setEditingDeptIdx(null)}
                        className="p-1 text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
                        title="Tamam"
                      >
                        <Check size={15} />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingDeptIdx(dIdx);
                          setTimeout(() => editInputRef.current?.focus(), 0);
                        }}
                        className="p-1 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="İsmi düzenle"
                      >
                        <Pencil size={14} />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setDepartments(departments.filter((_, i) => i !== dIdx));
                        if (editingDeptIdx === dIdx) setEditingDeptIdx(null);
                      }}
                      className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                      title="Sil"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => {
                    const newIdx = departments.length;
                    setDepartments([...departments, { id: `d${Date.now()}`, location_id: locationData.id, name: "Yeni Bölge" }]);
                    setTimeout(() => {
                      setEditingDeptIdx(newIdx);
                      editInputRef.current?.focus();
                    }, 50);
                  }}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-sm font-medium"
                >
                  <Plus size={16} /> Yeni Bölge Ekle
                </button>
              </div>

              <hr className="border-slate-100" />

              {/* Günlük Alan Kotaları */}
              <div>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-700">Günlük Alan Kotaları</p>
                  <p className="text-xs text-slate-400 mt-0.5">Her bölgede günde en az kaç kişi çalışmalı? OR-Tools bu kısıtı zorunlu tutar.</p>
                </div>
                <div className="space-y-2">
                  {zoneQuotas.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                      <input
                        value={entry.zone}
                        onChange={e => { const n = [...zoneQuotas]; n[idx] = { ...n[idx], zone: e.target.value }; setZoneQuotas(n); }}
                        placeholder="Bölge adı (Örn: Kasa)"
                        className="flex-1 text-sm bg-transparent outline-none border-b border-transparent hover:border-slate-300 focus:border-indigo-500 py-0.5 text-slate-800 font-medium"
                      />
                      <span className="text-xs text-slate-400 shrink-0">min</span>
                      <input
                        type="number" min={0} max={99}
                        value={entry.min}
                        onChange={e => { const n = [...zoneQuotas]; n[idx] = { ...n[idx], min: Number(e.target.value) }; setZoneQuotas(n); }}
                        className="w-16 text-sm text-center bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 font-bold"
                      />
                      <span className="text-xs text-slate-400 shrink-0">kişi/gün</span>
                      <button onClick={() => setZoneQuotas(zoneQuotas.filter((_, i) => i !== idx))} className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setZoneQuotas([...zoneQuotas, { zone: "", min: 1 }])}
                    className="w-full border border-dashed border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Kota Ekle
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={handleSave} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm">
                  <Save size={16} /> Bölgeleri Kaydet
                </button>
              </div>
            </div>
          )}

          {/* ─── HESAP & BİLDİRİMLER ─── */}
          {activeTab === "account" && (
            <div className="space-y-8">
              <div>
                <SectionLabel>Bildirimler</SectionLabel>
                <div className="space-y-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-700 text-sm">Yayın Öncülüğü KPI</div>
                        <div className="text-xs text-slate-400 mt-0.5">Müdür dashboard'unda "kaç gün önceden yayınlandı" KPI kartı gösterilir</div>
                      </div>
                      <Toggle on={publishLeadKpiEnabled} onToggle={() => setPublishLeadKpiEnabled(v => !v)} />
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-semibold text-slate-700 text-sm">Otomatik Müsaitlik Hatırlatması</div>
                        <div className="text-xs text-slate-400 mt-0.5">Müsaitlik girmeyen personele haftada bir bildirim gönderilir</div>
                      </div>
                      <Toggle on={reminderEnabled} onToggle={() => setReminderEnabled(v => !v)} />
                    </div>
                    {reminderEnabled && (
                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-sm text-slate-600">
                        <span>Her</span>
                        <select
                          value={reminderDay}
                          onChange={e => setReminderDay(e.target.value)}
                          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                        >
                          {DAYS.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
                        </select>
                        <span>günü saat</span>
                        <TimeInput value={reminderTime} onChange={setReminderTime} />
                        <span>hatırlatma gönder</span>
                      </div>
                    )}
                  </div>

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
                          setRemindResult(data.sent > 0 ? `${data.sent} personele hatırlatma gönderildi.` : "Tüm personel zaten müsaitliğini girmiş.");
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
              </div>

              <hr className="border-slate-100" />

              <div>
                <SectionLabel>Hesabım</SectionLabel>
                <div className="max-w-2xl">
                  <AccountTab storageKey="optishift_manager_user" allowNameEdit={true} />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

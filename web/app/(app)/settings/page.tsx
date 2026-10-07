"use client";

import TimeSelect from "@/components/ui/TimeInput";
import { businessToday, formatDateTR } from "@/lib/date";
import { trNum } from "@/lib/format";
import { FEATURES } from "@/lib/features";
import { isModuleOn } from "@/lib/moduleVisibility";
import { SALES_EMAIL } from "@/lib/plans";
import { Fragment, useState, useEffect, useRef, createContext, useContext, type ReactNode, type ComponentType } from "react";
import {
  Save, Plus, X, PhoneCall, Pencil, Check, Scale, Trash2, ChevronDown,
  MessageSquare, Megaphone, BookOpen, UserX, AlertTriangle, FileCheck, TrendingUp, ListChecks, Timer,
} from "lucide-react";
import type { Location, ShiftDefinition, Department } from "@/lib/types";
import { cn } from "@/lib/utils";
import { sortDepartments } from "@/lib/departments";
import { DifficultyPicker } from "@/components/ui/DifficultyPicker";
import { AUTOPILOT_DAY_NAMES, AUTOPILOT_DEFAULT_DAY, AUTOPILOT_DEFAULT_HOUR, autopilotSettings } from "@/lib/autopilotRules";
import { isCategoryLocked, LOCK_NOTE, type LockCategory } from "@/lib/ruleLocks";
import { hasPerm, parseAccess, type UserAccess } from "@/lib/userAccess";
import BranchAccountTab from "@/components/BranchAccountTab";
import { geocodePlace } from "@/lib/geo";
import { summarizeOperatingHours } from "@/lib/operatingHours";
import IndustryPicker from "@/components/IndustryPicker";
import { getIndustry, industryFromRules } from "@/lib/templates";
import { QRCodeSVG } from "qrcode.react";
import { DAILY_DRIVING_EXTENDED_HOURS, DAILY_MAX_NET_HOURS, isNightDef, netWorkHours } from "@/lib/legal";
import { BreakPicker } from "@/components/ui/BreakPicker";
import { WORK_CYCLES, distributeOffsets, weekStates, type WorkCycleConfig } from "@/lib/workCycle";
import { getWeekStart } from "@/lib/date";
import { DAY_SHORT } from "@/lib/constants";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { StatusPill } from "@/components/ui/StatusPill";
import { DayPointsGrid, SpecialDatesEditor } from "@/components/settings/HardDays";
import { resolveHardDayRules, type HardDayRules } from "@/lib/fairness";
import { TURKISH_HOLIDAYS } from "@/lib/holidays";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];


type TabKey = "basic" | "advanced" | "features" | "account";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "basic",    label: "Temel Ayarlar",       short: "Temel" },
  { key: "advanced", label: "Gelişmiş Seçenekler", short: "Gelişmiş" },
  { key: "features", label: "Ek Özellikler",       short: "Özellikler" },
  { key: "account",  label: "Hesabım",             short: "Hesabım" },
];

// Eski sekme adlarıyla gelen derin linkler (?tab=shifts, ?tab=rules...) yeni yapıya eşlenir.
// Gelişmiş Seçenekler altındaki bir başlığa işaret ediyorsa o başlık açık gelir.
const LEGACY_TABS: Record<string, { tab: TabKey; group?: string }> = {
  shifts:   { tab: "basic" },
  requests: { tab: "advanced", group: "requests" },
  rules:    { tab: "advanced", group: "planning" },
  fairness: { tab: "advanced", group: "fairness" },
  zones:    { tab: "basic" },
  crews:    { tab: "advanced", group: "cycle" },
  location: { tab: "basic" },
};

function tabFromUrl(): { tab: TabKey; group?: string } {
  if (typeof window === "undefined") return { tab: "basic" };
  const params = new URLSearchParams(window.location.search);
  const t = params.get("tab") ?? "";
  if (TABS.some(x => x.key === t)) return { tab: t as TabKey, group: params.get("group") ?? undefined };
  return LEGACY_TABS[t] ?? { tab: "basic" };
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-forest-600" : "bg-slate-200"}`}
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
  width,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  prefix?: string;
  width?: string;
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
        className={`${width ?? "w-20"} px-3 py-2 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent`}
      />
      {suffix && <span className="text-xs text-slate-400 font-semibold">{suffix}</span>}
    </div>
  );
}

// true: bu kullanıcı (müdür) kilitli alanları değiştiremez (lib/ruleLocks). Sunucu da ayrıca korur.
// Kategori bu kullanıcı için kilitli mi (müdür + izin kapalı). Sunucu da ayrıca korur.
const SettingsLockCtx = createContext<(cat: LockCategory) => boolean>(() => false);

function LockNote() {
  // span: açıklama paragrafının içinde de kullanılır (<p> içinde <p> olamaz)
  return <span className="block text-xs font-semibold text-amber-700 mt-1">🔒 {LOCK_NOTE}</span>;
}

/** Kilitli bölüm: müdür görür, değiştiremez. */
function LockArea({ cat, children }: { cat: LockCategory; children: ReactNode }) {
  const locked = useContext(SettingsLockCtx)(cat);
  if (!locked) return <>{children}</>;
  return (
    <div className="space-y-3">
      <LockNote />
      <fieldset disabled className="min-w-0 border-0 p-0 m-0 opacity-60 space-y-4">{children}</fieldset>
    </div>
  );
}

function RuleRow({ label, description, right, wide = false, lock }: { label: string; description: ReactNode; right: ReactNode; wide?: boolean; lock?: LockCategory }) {
  const isLocked = useContext(SettingsLockCtx);
  const locked = !!lock && isLocked(lock);
  // Telefonda dar etiket sütunu olmasın: etiket + denetim üst satırda, açıklama tam genişlikte altta
  if (wide) {
    // Geniş denetim (konum, saat listesi): telefonda alt alta, masaüstünde yan yana
    return (
      <fieldset disabled={locked} className="min-w-0 border-0 p-0 m-0 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold text-slate-900", locked && "opacity-60")}>{label}</p>
          <RuleDescription description={description} locked={locked} />
        </div>
        <div className={cn("w-full sm:w-auto shrink-0", locked && "opacity-60")}>{right}</div>
      </fieldset>
    );
  }
  return (
    <fieldset disabled={locked} className="min-w-0 border-0 p-0 m-0 py-4">
      <div className="flex items-center justify-between gap-4">
        <p className={cn("min-w-0 text-sm font-semibold text-slate-900", locked && "opacity-60")}>{label}</p>
        <div className={cn("shrink-0", locked && "opacity-60")}>{right}</div>
      </div>
      <RuleDescription description={description} locked={locked} />
    </fieldset>
  );
}

function RuleDescription({ description, locked }: { description: ReactNode; locked: boolean }) {
  return (
    <div>
      <p className={cn("text-xs text-slate-500 mt-1 leading-relaxed", locked && "opacity-60")}>{description}</p>
      {locked && <LockNote />}
    </div>
  );
}

// Statik kart kabuğu — .stripe-card ile aynı taban (rounded-2xl + ince gölge),
// hover büyümesi yok çünkü tıklanabilir/link değil (bkz. Design Kararları #1)
const GroupTitleCtx = createContext<string | null>(null);

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  // Grubun içinde grup başlığıyla aynı başlık tekrar yazılmaz
  const groupTitle = useContext(GroupTitleCtx);
  if (groupTitle === title) return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 divide-y divide-slate-100">{children}</div>
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 pt-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="px-4 divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-900 mb-2">{children}</h3>;
}

// Gelişmiş Seçenekler: kapalı gelen başlıklar (aşamalı gösterim)
function SettingsGroup({ id, title, description, open, onToggle, children }: {
  id: string; title: string; description: string; open: boolean; onToggle: (id: string) => void; children: ReactNode;
}) {
  return (
    <div id={`group-${id}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{description}</p>
        </div>
        <ChevronDown size={16} className={cn("text-slate-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && <GroupTitleCtx.Provider value={title}><div className="px-3 sm:px-4 py-4 space-y-4 bg-slate-50 border-t border-slate-100">{children}</div></GroupTitleCtx.Provider>}
    </div>
  );
}

// Ek Özellikler: tek bir özelliğin aç/kapa kartı; açıkken kendi ayarları kartın içinde görünür
function FeatureCard({ icon: Icon, title, description, on, onToggle, children }: {
  icon: ComponentType<{ size?: number }>; title: string; description: string; on: boolean; onToggle: () => void; children?: ReactNode;
}) {
  const locked = useContext(SettingsLockCtx)("features");
  return (
    <div className={cn(
      "rounded-2xl border border-slate-200 bg-white p-4",
      on && children ? "md:col-span-2" : "",
    )}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 shrink-0", on ? "text-primary" : "text-slate-400")}><Icon size={16} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
        <fieldset disabled={locked} className={cn("min-w-0 border-0 p-0 m-0", locked && "opacity-50")} title={locked ? LOCK_NOTE : undefined}>
          <Toggle on={on} onToggle={onToggle} />
        </fieldset>
      </div>
      {on && children && <div className="mt-4 pt-4 border-t border-slate-100">{children}</div>}
    </div>
  );
}

function FeatureGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

// Shared time input style — same everywhere on the page
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TimeSelect value={value} onChange={onChange}
      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 w-28" />
  );
}

export default function SettingsPage() {
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  // Yöneticinin yetki maddeleri (lib/userAccess) kilitli alanları belirler (lib/ruleLocks isCategoryLocked);
  // yetki kişinin kartında verilir. Sunucu da ayrıca korur.
  const [viewerAccess, setViewerAccess] = useState<UserAccess | null>(null);
  const isCatLocked = (cat: LockCategory) => viewerRole !== null && isCategoryLocked({ role: viewerRole, access: viewerAccess }, cat);
  // ?tab=features gibi derin linkler desteklenir (eski sekme adları LEGACY_TABS ile eşlenir)
  // "Plan ayarları" yetkisi olmayan yönetici (departman şefi dahil, lib/userAccess) şube ayarlarını değiştiremez: sadece Hesabım
  // localStorage ve adres sadece tarayıcıda var: ilk çizimden sonra okunur (sunucu çizimiyle uyuşmazlık olmasın)
  const [accountOnly, setAccountOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let only = false;
    try {
      const u = JSON.parse(localStorage.getItem("optishift_manager_user") || "{}");
      const viewer = { role: u.role ?? null, access: parseAccess(u.access) };
      only = !hasPerm(viewer, "plan_settings");
    } catch { /* varsayılan: tam ayarlar */ }
    const fromUrl = tabFromUrl();
    /* eslint-disable react-hooks/set-state-in-effect */
    setAccountOnly(only);
    setActiveTab(only ? "account" : fromUrl.tab);
    if (fromUrl.group) setOpenGroups({ [fromUrl.group]: true });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const toggleGroup = (id: string) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  // Çalışma saatleri tek satır özetle gelir; 7 günlük düzenleyici isteğe bağlı açılır
  const [hoursOpen, setHoursOpen] = useState(false);

  // Departman yönetimi — anında DB'ye kaydedilir (/api/departments)
  const [newDeptName, setNewDeptName] = useState("");
  // Alt departman ekleme: hangi departmanın altına (lib/departments, tek kat)
  const [subParentId, setSubParentId] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState("");
  const [deptError, setDeptError] = useState<string | null>(null);

  // Bildirim state
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDay, setReminderDay] = useState("0");
  // Otomatik pilot (lib/autopilotRules): varsayılan açık, Perşembe 08:00
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);
  const [autopilotDay, setAutopilotDay] = useState(String(AUTOPILOT_DEFAULT_DAY));
  const [autopilotHour, setAutopilotHour] = useState(String(AUTOPILOT_DEFAULT_HOUR));
  const [reminderTime, setReminderTime] = useState("18:00");

  // Lokasyon state
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locationData, setLocationData] = useState<Location | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Kural toggle'ları
  const [maxConsecutiveDays, setMaxConsecutiveDays]               = useState(6);
  const [maxOnCallPerWeek, setMaxOnCallPerWeek]                   = useState(3);
  const [noNightToMorning, setNoNightToMorning]                   = useState(false);
  const [implicitPrefsEnabled, setImplicitPrefsEnabled]           = useState(true);
  const [maxPreferredNotDays, setMaxPreferredNotDays]             = useState(1);
  const [clopeningMinRestHours, setClopeningMinRestHours]         = useState(13);
  const [maxWeeklyHours, setMaxWeeklyHours]                       = useState(45);
  const [minRestHours, setMinRestHours]                           = useState(11);
  const [changeCompensationPoints, setChangeCompensationPoints]   = useState(2);
  // Adalet puanı — additive model (2026-09-20): tek "zor vardiya" puanı + bonuslar, 0 = kapalı
  const [hardDays, setHardDays]                                   = useState<HardDayRules>(() => resolveHardDayRules({}));
  const [heroBonusPoints, setHeroBonusPoints]                     = useState(6);
  const [forceBonusPoints, setForceBonusPoints]                   = useState(5);

  // Ek toggle'lar
  const [clopeningEnabled, setClopeningEnabled]                   = useState(true);
  const [swapRequestsEnabled, setSwapRequestsEnabled]             = useState(true);
  const [availabilityCollectionEnabled, setAvailabilityCollectionEnabled] = useState(true);
  const [editRequestsEnabled, setEditRequestsEnabled]             = useState(true);
  const [chatEnabled, setChatEnabled]                             = useState(true);
  const [leaveRequestsEnabled, setLeaveRequestsEnabled]           = useState(true);
  const [overtimeTrackingEnabled, setOvertimeTrackingEnabled]     = useState(true);
  const [openShiftsEnabled, setOpenShiftsEnabled]                 = useState(true);
  const [personnelConflictsEnabled, setPersonnelConflictsEnabled] = useState(true);
  const [complianceTrackingEnabled, setComplianceTrackingEnabled] = useState(false); // ileri seviye modül — varsayılan kapalı
  const [taskManagementEnabled, setTaskManagementEnabled] = useState(false); // ileri seviye modül — varsayılan kapalı
  const [kioskModeEnabled, setKioskModeEnabled] = useState(false); // ileri seviye modül — varsayılan kapalı
  const [kioskLinkCopied, setKioskLinkCopied] = useState(false);
  const [forecastingEnabled, setForecastingEnabled] = useState(false); // ileri seviye modül — varsayılan kapalı
  const [handoverLogEnabled, setHandoverLogEnabled] = useState(false); // ileri seviye modül — varsayılan kapalı
  const [fatigueRadarEnabled, setFatigueRadarEnabled] = useState(false); // ileri seviye modül — varsayılan kapalı
  const [salesData, setSalesData] = useState<{ id: number; date: string; revenue: number | null; footfall: number | null }[]>([]);
  const [newSalesDate, setNewSalesDate] = useState("");
  const [newSalesRevenue, setNewSalesRevenue] = useState("");
  const [salesDataError, setSalesDataError] = useState("");
  const [taskTemplates, setTaskTemplates] = useState<Record<string, string[]>>({}); // {shiftDefId veya "*": [görev satırları]}
  const [checkinRequired, setCheckinRequired]                     = useState(false);
  const [gpsCheckinRequired, setGpsCheckinRequired]               = useState(false);
  const [checkinRadiusM, setCheckinRadiusM]                       = useState(150);
  const [autoOpenShiftOnLate, setAutoOpenShiftOnLate]             = useState(true);
  const [morningBriefEnabled, setMorningBriefEnabled]             = useState(true);
  const [lateThresholdMin, setLateThresholdMin]                   = useState(30);
  const [maxConcurrentBreaks, setMaxConcurrentBreaks]             = useState(2);
  const [changeCompensationEnabled, setChangeCompensationEnabled] = useState(true);
  const [maxBreakDurationMin, setMaxBreakDurationMin]             = useState(15);
  const [fairnessWindowWeeks, setFairnessWindowWeeks]             = useState(4);
  const [clopeningPenaltyWeight, setClopeningPenaltyWeight]       = useState(30);

  // Fazla mesai kuralları
  const [overtimeThresholdHours, setOvertimeThresholdHours]       = useState(45);
  const [maxYtdOvertimeHours, setMaxYtdOvertimeHours]             = useState(270);
  const [overtimeFairDistribution, setOvertimeFairDistribution]   = useState(true);
  const [balancingPeriodWeeks, setBalancingPeriodWeeks]           = useState(0);
  const [nightLegalWarning, setNightLegalWarning]                 = useState(true);
  const [handoverNotesEnabled, setHandoverNotesEnabled]           = useState(true);
  const [autoLeaveEntitlement, setAutoLeaveEntitlement]           = useState(false);


  // Sosyal Kurallar — Birlikte Çalışamaz çiftleri
  const [conflictPairs, setConflictPairs] = useState<any[]>([]);
  // Çalışma döngüsü (rules.work_cycle): aktif personel, anında kaydedilir
  const [cyclePersonnel, setCyclePersonnel] = useState<{ id: string; name: string }[]>([]);
  const [cycleSaving, setCycleSaving] = useState(false);
  // Anında kaydedilen döngü sayfanın genel kayıt durumuna (kaydedilmemiş değişiklik çubuğu) karışmaz
  const [savedWorkCycle, setSavedWorkCycle] = useState<WorkCycleConfig | null | undefined>(undefined);
  // Aktif personelin rolleri: önerilen zorunlu rolü uygulamadan önce rol sahibi var mı diye bakılır


  const savedSnapshot = useRef<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (type: "ok" | "error", text: string) => {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  // Değişiklikleri geri al — init'i yeniden tetikler, tüm state sunucudan tazelenir
  const discardChanges = () => {
    window.dispatchEvent(new Event("optishift_location_changed"));
    showToast("ok", "Değişiklikler geri alındı");
  };

  // İzin politikası

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
      setViewerRole(u.role ?? null);
      setViewerAccess(parseAccess(u.access));

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
          if (finalId) {
            fetch(`/api/sales-data?location_id=${finalId}`)
              .then(r => r.ok ? r.json() : [])
              .then(d => setSalesData(Array.isArray(d) ? d : []))
              .catch(() => {});
          }

          const loc = JSON.parse(JSON.stringify(targetLoc));
          if (typeof loc.shift_definitions === "string") { try { loc.shift_definitions = JSON.parse(loc.shift_definitions); } catch { loc.shift_definitions = []; } }
          if (!loc.shift_definitions) loc.shift_definitions = [];
          let loadedTaskTemplates: Record<string, string[]> = {};
          if (typeof loc.task_templates === "string") { try { loadedTaskTemplates = JSON.parse(loc.task_templates) || {}; } catch { loadedTaskTemplates = {}; } }
          else if (loc.task_templates) loadedTaskTemplates = loc.task_templates;
          setTaskTemplates(loadedTaskTemplates);
          if (typeof loc.operating_hours === "string")   { try { loc.operating_hours   = JSON.parse(loc.operating_hours);   } catch { loc.operating_hours = {};   } }
          if (!loc.operating_hours) loc.operating_hours = {};
          if (typeof loc.rules === "string")             { try { loc.rules             = JSON.parse(loc.rules);             } catch { loc.rules = {};             } }
          setLocationData(loc);
          setSavedWorkCycle(undefined);


          setMaxConsecutiveDays(loc.rules?.max_consecutive_days ?? 6);
          setMaxOnCallPerWeek(loc.rules?.max_on_call_per_week ?? 3);
          setNoNightToMorning(!!loc.rules?.no_night_to_morning);
          setImplicitPrefsEnabled(loc.rules?.implicit_preferences_enabled !== false);
          if (typeof loc.rules?.max_preferred_not_days === "number")    setMaxPreferredNotDays(loc.rules.max_preferred_not_days);
          if (typeof loc.rules?.clopening_min_rest_hours === "number")  setClopeningMinRestHours(loc.rules.clopening_min_rest_hours);
          if (typeof loc.rules?.max_weekly_hours === "number")          setMaxWeeklyHours(loc.rules.max_weekly_hours);
          if (typeof loc.rules?.min_rest_hours === "number")            setMinRestHours(loc.rules.min_rest_hours);
          if (typeof loc.rules?.change_compensation_points === "number") setChangeCompensationPoints(loc.rules.change_compensation_points);
          setHardDays(resolveHardDayRules(loc.rules));
          if (typeof loc.rules?.hero_bonus_points === "number")         setHeroBonusPoints(loc.rules.hero_bonus_points);
          if (typeof loc.rules?.force_bonus_points === "number")        setForceBonusPoints(loc.rules.force_bonus_points);

          setClopeningEnabled(loc.rules?.clopening_enabled !== false);
          setSwapRequestsEnabled(loc.rules?.swap_requests_enabled !== false);
          setAvailabilityCollectionEnabled(loc.rules?.availability_collection_enabled !== false);
          const ap = autopilotSettings(loc.rules);
          setAutopilotEnabled(ap.enabled);
          setAutopilotDay(String(ap.day));
          setAutopilotHour(String(ap.hour));
          const ar = loc.rules?.availability_reminder;
          if (ar) {
            setReminderEnabled(!!ar.enabled);
            if (typeof ar.day === "number") setReminderDay(String(ar.day));
            if (typeof ar.time === "string") setReminderTime(ar.time);
          }
          setEditRequestsEnabled(loc.rules?.edit_requests_enabled !== false);
          setCheckinRequired(!!loc.rules?.checkin_required);
          setChatEnabled(loc.rules?.chat_enabled !== false);
          setLeaveRequestsEnabled(loc.rules?.leave_requests_enabled !== false);
          setOvertimeTrackingEnabled(isModuleOn(loc.rules, "overtime_tracking_enabled"));
          setOpenShiftsEnabled(loc.rules?.open_shifts_enabled !== false);
          setPersonnelConflictsEnabled(isModuleOn(loc.rules, "personnel_conflicts_enabled"));
          setComplianceTrackingEnabled(loc.rules?.compliance_tracking_enabled === true);
          setTaskManagementEnabled(loc.rules?.task_management_enabled === true);
          setKioskModeEnabled(loc.rules?.kiosk_mode_enabled === true);
          setForecastingEnabled(loc.rules?.forecasting_enabled === true);
          setHandoverLogEnabled(loc.rules?.handover_log_enabled === true);
          setFatigueRadarEnabled(loc.rules?.fatigue_radar_enabled === true);
          setGpsCheckinRequired(!!loc.rules?.gps_checkin_required);
          if (typeof loc.rules?.checkin_radius_m === "number")           setCheckinRadiusM(loc.rules.checkin_radius_m);
          setAutoOpenShiftOnLate(loc.rules?.auto_open_shift_on_late !== false);
          setMorningBriefEnabled(loc.rules?.morning_brief_enabled !== false);
          if (typeof loc.rules?.late_threshold_min === "number")        setLateThresholdMin(loc.rules.late_threshold_min);
          if (typeof loc.rules?.max_concurrent_breaks === "number")     setMaxConcurrentBreaks(loc.rules.max_concurrent_breaks);
          setChangeCompensationEnabled(loc.rules?.change_compensation_enabled !== false);
          if (typeof loc.rules?.max_break_duration_min === "number")    setMaxBreakDurationMin(loc.rules.max_break_duration_min);
          if (typeof loc.rules?.fairness_window_weeks === "number")     setFairnessWindowWeeks(loc.rules.fairness_window_weeks);
          if (typeof loc.rules?.clopening_penalty_weight === "number")  setClopeningPenaltyWeight(loc.rules.clopening_penalty_weight);
          if (typeof loc.rules?.overtime_threshold_hours === "number")  setOvertimeThresholdHours(loc.rules.overtime_threshold_hours);
          if (typeof loc.rules?.max_ytd_overtime_hours === "number")    setMaxYtdOvertimeHours(loc.rules.max_ytd_overtime_hours);
          if (typeof loc.rules?.overtime_fair_distribution === "boolean") setOvertimeFairDistribution(loc.rules.overtime_fair_distribution);
          if (typeof loc.rules?.balancing_period_weeks === "number") setBalancingPeriodWeeks(loc.rules.balancing_period_weeks);
          setNightLegalWarning(loc.rules?.night_legal_warning_enabled !== false);
          setHandoverNotesEnabled(isModuleOn(loc.rules, "handover_notes_enabled"));
          setAutoLeaveEntitlement(loc.rules?.auto_leave_entitlement_enabled === true);

          // Sosyal kurallar: birlikte çalışamaz çiftleri + personel listesi
          try {
            const [pcRes, pRes] = await Promise.all([
              fetch(`/api/personnel-conflicts?location_id=${finalId}`),
              fetch(`/api/personnel?location_id=${finalId}`),
            ]);
            if (pcRes.ok) { const pcData = await pcRes.json(); if (Array.isArray(pcData)) setConflictPairs(pcData); }
            if (pRes.ok) {
              const pData = await pRes.json();
              if (Array.isArray(pData)) {
                setCyclePersonnel((pData as { id: string; name: string; status?: string }[]).filter(p => p.status === "active")
                  .map(p => ({ id: p.id, name: p.name }))
                  .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr")));
              }
            }
          } catch { /* ignore */ }

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

          let depts: Department[] = [];
          try {
            const dres = await fetch(`/api/departments?location_id=${finalId}`);
            if (dres.ok) { const draw = await dres.json(); if (Array.isArray(draw)) depts = draw; }
          } catch { /* empty */ }
          setDepartments(depts);

          savedSnapshot.current = JSON.stringify({
            shift_definitions: loc.shift_definitions ?? [],
            operating_hours: loc.operating_hours ?? {},
            maxConsecutiveDays: loc.rules?.max_consecutive_days ?? 6,
            maxOnCallPerWeek: loc.rules?.max_on_call_per_week ?? 3,
            noNightToMorning: !!loc.rules?.no_night_to_morning,
            implicitPrefsEnabled: loc.rules?.implicit_preferences_enabled !== false,
            maxPreferredNotDays: typeof loc.rules?.max_preferred_not_days === "number" ? loc.rules.max_preferred_not_days : 1,
            clopeningMinRestHours: typeof loc.rules?.clopening_min_rest_hours === "number" ? loc.rules.clopening_min_rest_hours : 13,
            maxWeeklyHours: typeof loc.rules?.max_weekly_hours === "number" ? loc.rules.max_weekly_hours : 45,
            minRestHours: typeof loc.rules?.min_rest_hours === "number" ? loc.rules.min_rest_hours : 11,
            changeCompensationPoints: typeof loc.rules?.change_compensation_points === "number" ? loc.rules.change_compensation_points : 2,
            hardDays: resolveHardDayRules(loc.rules),
            heroBonusPoints: typeof loc.rules?.hero_bonus_points === "number" ? loc.rules.hero_bonus_points : 6,
            forceBonusPoints: typeof loc.rules?.force_bonus_points === "number" ? loc.rules.force_bonus_points : 5,
            clopeningEnabled: loc.rules?.clopening_enabled !== false,
            swapRequestsEnabled: loc.rules?.swap_requests_enabled !== false,
            availabilityCollectionEnabled: loc.rules?.availability_collection_enabled !== false,
            reminderEnabled: !!loc.rules?.availability_reminder?.enabled,
            reminderDay: String(loc.rules?.availability_reminder?.day ?? 0),
            reminderTime: loc.rules?.availability_reminder?.time ?? "18:00",
            autopilotEnabled: autopilotSettings(loc.rules).enabled,
            autopilotDay: String(autopilotSettings(loc.rules).day),
            autopilotHour: String(autopilotSettings(loc.rules).hour),
            editRequestsEnabled: loc.rules?.edit_requests_enabled !== false,
            checkinRequired: !!loc.rules?.checkin_required,
            chatEnabled: loc.rules?.chat_enabled !== false,
            leaveRequestsEnabled: loc.rules?.leave_requests_enabled !== false,
            overtimeTrackingEnabled: isModuleOn(loc.rules, "overtime_tracking_enabled"),
            openShiftsEnabled: loc.rules?.open_shifts_enabled !== false,
            personnelConflictsEnabled: isModuleOn(loc.rules, "personnel_conflicts_enabled"),
            complianceTrackingEnabled: loc.rules?.compliance_tracking_enabled === true,
            taskManagementEnabled: loc.rules?.task_management_enabled === true,
            kioskModeEnabled: loc.rules?.kiosk_mode_enabled === true,
            forecastingEnabled: loc.rules?.forecasting_enabled === true,
            handoverLogEnabled: loc.rules?.handover_log_enabled === true,
            fatigueRadarEnabled: loc.rules?.fatigue_radar_enabled === true,
            taskTemplates: loadedTaskTemplates,
            gpsCheckinRequired: !!loc.rules?.gps_checkin_required,
            checkinRadiusM: typeof loc.rules?.checkin_radius_m === "number" ? loc.rules.checkin_radius_m : 150,
            autoOpenShiftOnLate: loc.rules?.auto_open_shift_on_late !== false,
            morningBriefEnabled: loc.rules?.morning_brief_enabled !== false,
            lateThresholdMin: typeof loc.rules?.late_threshold_min === "number" ? loc.rules.late_threshold_min : 30,
            maxConcurrentBreaks: typeof loc.rules?.max_concurrent_breaks === "number" ? loc.rules.max_concurrent_breaks : 2,
            maxBreakDurationMin: typeof loc.rules?.max_break_duration_min === "number" ? loc.rules.max_break_duration_min : 15,
            fairnessWindowWeeks: typeof loc.rules?.fairness_window_weeks === "number" ? loc.rules.fairness_window_weeks : 4,
            clopeningPenaltyWeight: typeof loc.rules?.clopening_penalty_weight === "number" ? loc.rules.clopening_penalty_weight : 30,
            locationLat: lat,
            locationLon: lon,
            changeCompensationEnabled: loc.rules?.change_compensation_enabled !== false,
            overtimeThresholdHours: typeof loc.rules?.overtime_threshold_hours === "number" ? loc.rules.overtime_threshold_hours : 45,
            maxYtdOvertimeHours: typeof loc.rules?.max_ytd_overtime_hours === "number" ? loc.rules.max_ytd_overtime_hours : 270,
            overtimeFairDistribution: typeof loc.rules?.overtime_fair_distribution === "boolean" ? loc.rules.overtime_fair_distribution : true,
            balancingPeriodWeeks: typeof loc.rules?.balancing_period_weeks === "number" ? loc.rules.balancing_period_weeks : 0,
            nightLegalWarning: loc.rules?.night_legal_warning_enabled !== false,
            handoverNotesEnabled: isModuleOn(loc.rules, "handover_notes_enabled"),
            autoLeaveEntitlement: loc.rules?.auto_leave_entitlement_enabled === true,
          });
          setIsDirty(false);
        }
      } catch (err) {
        console.error("Settings load error:", err);
      }
    };

    init();
    window.addEventListener("optishift_location_changed", init);
    return () => window.removeEventListener("optishift_location_changed", init);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!savedSnapshot.current || !locationData) return;
    const current = JSON.stringify({
      shift_definitions: locationData.shift_definitions ?? [],
      operating_hours: locationData.operating_hours ?? {},
      maxConsecutiveDays, maxOnCallPerWeek, noNightToMorning, implicitPrefsEnabled,
      maxPreferredNotDays, clopeningMinRestHours,
      maxWeeklyHours, minRestHours, changeCompensationPoints,
      hardDays, heroBonusPoints, forceBonusPoints,
      clopeningEnabled, swapRequestsEnabled,
      availabilityCollectionEnabled,
      reminderEnabled, reminderDay, reminderTime, autopilotEnabled, autopilotDay, autopilotHour,
      editRequestsEnabled, checkinRequired, gpsCheckinRequired, checkinRadiusM, autoOpenShiftOnLate, morningBriefEnabled, lateThresholdMin,
      chatEnabled, leaveRequestsEnabled, overtimeTrackingEnabled, openShiftsEnabled, personnelConflictsEnabled, complianceTrackingEnabled, taskManagementEnabled, kioskModeEnabled, forecastingEnabled, handoverLogEnabled, fatigueRadarEnabled, taskTemplates,
      maxConcurrentBreaks,
      maxBreakDurationMin, fairnessWindowWeeks, clopeningPenaltyWeight,
      locationLat, locationLon,
      changeCompensationEnabled,
      overtimeThresholdHours, maxYtdOvertimeHours, overtimeFairDistribution, balancingPeriodWeeks, nightLegalWarning, handoverNotesEnabled, autoLeaveEntitlement,
    });
    setIsDirty(current !== savedSnapshot.current);
  }, [
    locationData,
    maxConsecutiveDays, maxOnCallPerWeek, noNightToMorning, implicitPrefsEnabled,
    maxPreferredNotDays, clopeningMinRestHours,
    maxWeeklyHours, minRestHours, changeCompensationPoints,
    hardDays, heroBonusPoints, forceBonusPoints,
    clopeningEnabled, swapRequestsEnabled,
    availabilityCollectionEnabled,
    reminderEnabled, reminderDay, reminderTime, autopilotEnabled, autopilotDay, autopilotHour,
    editRequestsEnabled, checkinRequired, gpsCheckinRequired, checkinRadiusM, autoOpenShiftOnLate, morningBriefEnabled, lateThresholdMin,
    chatEnabled, leaveRequestsEnabled, overtimeTrackingEnabled, openShiftsEnabled, personnelConflictsEnabled, complianceTrackingEnabled, taskManagementEnabled, kioskModeEnabled, forecastingEnabled, handoverLogEnabled, fatigueRadarEnabled, taskTemplates,
    maxConcurrentBreaks,
    maxBreakDurationMin, fairnessWindowWeeks, clopeningPenaltyWeight,
    locationLat, locationLon,
    changeCompensationEnabled,
    overtimeThresholdHours, maxYtdOvertimeHours, overtimeFairDistribution, balancingPeriodWeeks, nightLegalWarning, handoverNotesEnabled, autoLeaveEntitlement,
  ]);

  const geocodeCity = async (city: string): Promise<{ lat: number; lon: number; label: string } | null> => {
    try {
      setWeatherStatus("searching");
      // "İstanbul, Kadıköy" gibi aramalar için ilçe + il eşleştirmesi (lib/geo.ts)
      const result = await geocodePlace(city);
      if (!result) { setWeatherStatus("error"); return null; }
      setWeatherLabel(result.label);
      setWeatherStatus("found");
      return { lat: result.latitude, lon: result.longitude, label: result.label };
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

  const handleAddSalesData = async () => {
    if (!selectedLocationId || !newSalesDate || !newSalesRevenue) return;
    setSalesDataError("");
    try {
      const res = await fetch("/api/sales-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: selectedLocationId, date: newSalesDate, revenue: Number(newSalesRevenue) }),
      });
      const data = await res.json();
      if (!res.ok) { setSalesDataError(data.error ?? "Kaydedilemedi"); return; }
      const refreshed = await fetch(`/api/sales-data?location_id=${selectedLocationId}`).then(r => r.json());
      setSalesData(Array.isArray(refreshed) ? refreshed : []);
      setNewSalesDate(""); setNewSalesRevenue("");
    } catch { setSalesDataError("Kaydedilemedi"); }
  };

  const handleDeleteSalesData = async (id: number) => {
    await fetch(`/api/sales-data?id=${id}`, { method: "DELETE" });
    setSalesData(prev => prev.filter(s => s.id !== id));
  };

  // Kaydedilmemiş değişiklik varken sayfadan çıkışta uyar
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      if ((window as Window & { __optishiftSkipUnloadGuard?: boolean }).__optishiftSkipUnloadGuard) return;
      e.preventDefault(); e.returnValue = "";
    };
    const beforeLocChange = (e: Event) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    window.addEventListener("optishift_before_location_change", beforeLocChange);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("optishift_before_location_change", beforeLocChange);
    };
  }, [isDirty]);

  const handleSave = async () => {
    if (!locationData) return;
    setSavingAll(true);

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

    // Kaydetme anında taze rules çek: sayfa açıkken sunucunun yazdığı anahtarlar
    // (örn. availability_reminder.last_sent_week) bayat kopyayla ezilmesin.
    // locations PATCH rules'u merge etmez — replace eder; koruma buradadır.
    let baseRules: Record<string, unknown> =
      locationData.rules && typeof locationData.rules === "object" ? { ...locationData.rules } : {};
    try {
      const fresh = await fetch(`/api/locations?id=${locationData.id}`).then(r => r.json());
      const fr = Array.isArray(fresh) ? fresh[0]?.rules : null;
      if (fr) baseRules = typeof fr === "string" ? JSON.parse(fr) : { ...fr };
    } catch { /* taze çekilemezse load-anı kopyası kullanılır */ }

    try {
      const res = await fetch(`/api/locations?id=${locationData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shift_definitions: locationData.shift_definitions,
          operating_hours:   locationData.operating_hours,
          task_templates:    taskTemplates,
          rules: {
            // Önce mevcut rules yayılır: bu sayfanın state'inde temsil edilmeyen
            // anahtarlar (sunucu tarafının yazdıkları dahil) kaydetmede silinmez
            ...baseRules,
            ensure_senior_per_shift:      false, // kıdemli kuralı kaldırıldı (2026-10-07)
            max_consecutive_days:         maxConsecutiveDays,
            max_on_call_per_week:         maxOnCallPerWeek,
            no_night_to_morning:          noNightToMorning,
            // Ayarı kaldırıldı (2026-10-04): her zaman açık, varsayılan yeter
            implicit_preferences_enabled: true,
            max_preferred_not_days:       maxPreferredNotDays,
            clopening_min_rest_hours:     clopeningMinRestHours,
            max_weekly_hours:             maxWeeklyHours,
            min_rest_hours:               minRestHours,
            change_compensation_points:         changeCompensationPoints,
            hard_day_points:                    hardDays.dayPoints,
            holiday_points:                     hardDays.holidayPoints,
            pref_not_points:                    hardDays.prefNotPoints,
            special_date_points:                hardDays.specialDates.filter(d => d.date && d.points > 0).map(d => ({ ...d, name: d.name.trim() })),
            hero_bonus_points:                  heroBonusPoints,
            force_bonus_points:                 forceBonusPoints,
            clopening_enabled:                  true, // "Mümkünse en az dinlenme" ayarı kaldırıldı: varsayılan 13 saat, hep açık
            swap_requests_enabled:              swapRequestsEnabled,
            availability_collection_enabled:    availabilityCollectionEnabled,
            availability_reminder: {
              enabled: reminderEnabled,
              day: parseInt(reminderDay) || 0,
              time: reminderTime,
              last_sent_week: (baseRules.availability_reminder as { last_sent_week?: string } | undefined)?.last_sent_week,
            },
            // Çalışma kayıtları (last_run_week, last_draft_week) sunucudaki taze kopyadan korunur
            autopilot: {
              ...((baseRules.autopilot as Record<string, unknown> | undefined) ?? {}),
              enabled: autopilotEnabled,
              day: parseInt(autopilotDay),
              hour: parseInt(autopilotHour),
            },
            // Müdür bu alanı gönderse de sunucu yok sayar (applyRuleLocks)
            edit_requests_enabled:              editRequestsEnabled,
            checkin_required:                   checkinRequired,
            chat_enabled:                       chatEnabled,
            leave_requests_enabled:             leaveRequestsEnabled,
            overtime_tracking_enabled:          overtimeTrackingEnabled,
            open_shifts_enabled:                openShiftsEnabled,
            personnel_conflicts_enabled:        personnelConflictsEnabled,
            compliance_tracking_enabled:        complianceTrackingEnabled,
            task_management_enabled:            taskManagementEnabled,
            kiosk_mode_enabled:                 kioskModeEnabled,
            forecasting_enabled:                forecastingEnabled,
            handover_log_enabled:               handoverLogEnabled,
            fatigue_radar_enabled:              fatigueRadarEnabled,
            gps_checkin_required:               gpsCheckinRequired,
            checkin_radius_m:                   checkinRadiusM,
            auto_open_shift_on_late:            autoOpenShiftOnLate,
            auto_cover_enabled:                 false, // kendiliğinden yedek kaldırıldı (2026-10-07)
            morning_brief_enabled:              morningBriefEnabled,
            late_threshold_min:                 lateThresholdMin,
            max_concurrent_breaks:              maxConcurrentBreaks,
            change_compensation_enabled:        changeCompensationEnabled,
            max_break_duration_min:             maxBreakDurationMin,
            fairness_window_weeks:              fairnessWindowWeeks,
            clopening_penalty_weight:           clopeningPenaltyWeight,
            overtime_threshold_hours:           overtimeThresholdHours,
            max_ytd_overtime_hours:             maxYtdOvertimeHours,
            overtime_fair_distribution:         overtimeFairDistribution,
            consecutive_night_weeks_enabled:    false, // kaldırıldı (2026-10-07)
            balancing_period_weeks:             balancingPeriodWeeks,
            night_legal_warning_enabled:        nightLegalWarning,
            handover_notes_enabled:             handoverNotesEnabled,
            auto_leave_entitlement_enabled:     autoLeaveEntitlement,
          },
          latitude:  finalLat ? parseFloat(finalLat) : null,
          longitude: finalLon ? parseFloat(finalLon) : null,
        }),
      });
      if (!res.ok) throw new Error("Sunucu hatası");
      localStorage.removeItem("optishift_schedule_config_v2");
      savedSnapshot.current = JSON.stringify({
        shift_definitions: locationData.shift_definitions ?? [],
        operating_hours: locationData.operating_hours ?? {},
        maxConsecutiveDays, maxOnCallPerWeek, noNightToMorning, implicitPrefsEnabled,
        maxPreferredNotDays, clopeningMinRestHours,
        maxWeeklyHours, minRestHours, changeCompensationPoints,
        hardDays, heroBonusPoints, forceBonusPoints,
        clopeningEnabled, swapRequestsEnabled,
        availabilityCollectionEnabled,
        reminderEnabled, reminderDay, reminderTime, autopilotEnabled, autopilotDay, autopilotHour,
        editRequestsEnabled, checkinRequired, gpsCheckinRequired, checkinRadiusM, autoOpenShiftOnLate, morningBriefEnabled, lateThresholdMin,
        chatEnabled, leaveRequestsEnabled, overtimeTrackingEnabled, openShiftsEnabled, personnelConflictsEnabled, complianceTrackingEnabled, taskManagementEnabled, kioskModeEnabled, forecastingEnabled, handoverLogEnabled, fatigueRadarEnabled, taskTemplates,
        maxConcurrentBreaks,
        maxBreakDurationMin, fairnessWindowWeeks, clopeningPenaltyWeight,
        locationLat: finalLat,
        locationLon: finalLon,
        changeCompensationEnabled,
      overtimeThresholdHours, maxYtdOvertimeHours, overtimeFairDistribution, balancingPeriodWeeks, nightLegalWarning, handoverNotesEnabled, autoLeaveEntitlement,
        });
      setIsDirty(false);
      showToast("ok", "Ayarlar kaydedildi");
    } catch {
      showToast("error", "Kaydetme sırasında hata oluştu");
    }
    setSavingAll(false);
  };

  // ── Departman CRUD — anında DB'ye yazılır, handleSave'den bağımsız ──
  const handleAddDepartment = async (parentId: string | null = null) => {
    const name = (parentId ? newSubName : newDeptName).trim();
    if (!name || !selectedLocationId) return;
    setDeptError(null);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: selectedLocationId, name, parent_id: parentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sunucu hatası");
      setDepartments(prev => [...prev, data]);
      if (parentId) { setNewSubName(""); setSubParentId(null); } else setNewDeptName("");
    } catch (err) {
      setDeptError(err instanceof Error && err.message ? err.message : "Departman eklenemedi.");
    }
  };

  const handleRenameDepartment = async (id: string) => {
    const name = editingDeptName.trim();
    const dept = departments.find(d => d.id === id);
    setEditingDeptId(null);
    if (!name || !dept || name === dept.name) return;
    setDeptError(null);
    try {
      const res = await fetch(`/api/departments?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      setDepartments(prev => prev.map(d => (d.id === id ? { ...d, name } : d)));
    } catch {
      setDeptError("Departman adı güncellenemedi.");
    }
  };

  const handleDeleteDepartment = async (dept: Department) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = (dept as any).personnel_count ?? 0;
    const msg = count > 0
      ? `"${dept.name}" departmanını silmek istediğinize emin misiniz? ${count} kişinin departmanı boşalır ve bu departmanın ihtiyaç tablosu silinir.`
      : `"${dept.name}" departmanını silmek istediğinize emin misiniz? Bu departmanın ihtiyaç tablosu da silinir.`;
    if (!confirm(msg)) return;
    setDeptError(null);
    try {
      const res = await fetch(`/api/departments?id=${dept.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      // Alt departmanları üst düzeye çıkar (sunucu da aynısını yapar)
      setDepartments(prev => prev.filter(d => d.id !== dept.id).map(d => (d.parent_id === dept.id ? { ...d, parent_id: null } : d)));
    } catch {
      setDeptError("Departman silinemedi.");
    }
  };

  // Vardiya süresi (saat) — gece geçişini destekler; yasal gece sınırı (7,5s) uyarısında kullanılır
  const shiftDurationHours = (shift: { start?: string; end?: string }) => {
    if (!shift.start || !shift.end) return 0;
    const [sh, sm] = shift.start.split(":").map(Number);
    const [eh, em] = shift.end.split(":").map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return 0;
    let dur = (eh * 60 + em) - (sh * 60 + sm);
    if (dur <= 0) dur += 1440;
    return Math.round((dur / 60) * 10) / 10;
  };

  // ── İşletme türü (lib/templates) ─────────────────────────────────────────
  // Anında kaydedilir (departmanlar gibi); kaydetme barından bağımsızdır. Taze rules
  // üzerine yazılır, sonra sayfa yeniden yüklenir; kaydedilmemiş değişiklik varken kapalıdır.
  const savedIndustry = industryFromRules(locationData?.rules);
  // Zor günler: sıradaki resmi tatil ve özel gün önerileri için bugünün tarihi (Türkiye saati)
  const todayIso = businessToday();
  const nextHoliday = TURKISH_HOLIDAYS.find(h => h.date >= todayIso) ?? null;
  // Vardiyalı (7/24, dönüşümlü) çalışan sektörler: çalışma döngüsü ve denkleştirme sadece bunlarda (ya da zaten ayarlıysa) görünür
  const shiftWorkBusiness = !savedIndustry || ["manufacturing", "healthcare", "security", "logistics", "callcenter"].includes(savedIndustry.key);
  // Gece vardiyası var mı (tek kural lib/legal isNightTime)
  const hasNightShift = ((locationData?.shift_definitions ?? []) as ShiftDefinition[]).some(d => {
    return isNightDef(d);
  });
  const savedVariant = (locationData?.rules as Record<string, unknown> | undefined)?.industry_variant as string | undefined;
  const [industryDraft, setIndustryDraft] = useState<{ industry: string; variant: string } | null>(null);
  const [industrySaving, setIndustrySaving] = useState(false);
  const pickedIndustry = industryDraft?.industry ?? savedIndustry?.key ?? null;
  const pickedVariant = industryDraft?.variant ?? savedVariant ?? savedIndustry?.variants[0].key ?? null;
  const industryChanged = !!industryDraft && (industryDraft.industry !== savedIndustry?.key || industryDraft.variant !== savedVariant);

  // Sadece hiç seçilmemiş (eski) şubede bir kez; sunucu da seçilmiş türü değiştirmez
  const saveIndustry = async () => {
    if (!locationData || !industryDraft) return;
    setIndustrySaving(true);
    try {
      const fresh = await fetch(`/api/locations?id=${locationData.id}`).then(r => r.json());
      const fr = Array.isArray(fresh) ? fresh[0]?.rules : null;
      const base: Record<string, unknown> = fr ? (typeof fr === "string" ? JSON.parse(fr) : { ...fr }) : {};
      const rules = { ...base, industry: industryDraft.industry, industry_variant: industryDraft.variant };
      const res = await fetch(`/api/locations?id=${locationData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) throw new Error();
      setIndustryDraft(null);
      showToast("ok", "İşletme türü kaydedildi.");
      window.dispatchEvent(new Event("optishift_location_changed"));
    } catch {
      showToast("error", "İşletme türü kaydedilemedi.");
    } finally {
      setIndustrySaving(false);
    }
  };

  // Çalışma döngüsü: deseni seç, aktif personele eşit dağıt (kaydırmalar), anında kaydet
  const workCycle = (() => {
    const r = locationData?.rules;
    const obj = typeof r === "string" ? (() => { try { return JSON.parse(r); } catch { return {}; } })() : (r ?? {});
    return savedWorkCycle !== undefined ? (savedWorkCycle ?? undefined) : (obj as Record<string, unknown>).work_cycle as WorkCycleConfig | undefined;
  })();
  const saveWorkCycle = async (pattern: string) => {
    if (!locationData) return;
    setCycleSaving(true);
    try {
      const fresh = await fetch(`/api/locations?id=${locationData.id}`).then(r => r.json());
      const fr = Array.isArray(fresh) ? fresh[0]?.rules : null;
      const base: Record<string, unknown> = fr ? (typeof fr === "string" ? JSON.parse(fr) : { ...fr }) : {};
      const rules = pattern
        ? { ...base, work_cycle: { pattern, anchor: getWeekStart(), offsets: distributeOffsets(cyclePersonnel.map(p => p.id), pattern) } }
        : Object.fromEntries(Object.entries(base).filter(([k]) => k !== "work_cycle"));
      const res = await fetch(`/api/locations?id=${locationData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) throw new Error();
      setSavedWorkCycle(((rules as Record<string, unknown>).work_cycle as WorkCycleConfig | undefined) ?? null);
      showToast("ok", pattern ? "Çalışma döngüsü kaydedildi ve ekibe dağıtıldı." : "Çalışma döngüsü kapatıldı.");
    } catch {
      showToast("error", "Çalışma döngüsü kaydedilemedi.");
    } finally {
      setCycleSaving(false);
    }
  };

  const TabBar = () => (
    <Tabs fill value={activeTab} onChange={setActiveTab}
      items={TABS.filter(tab => (!accountOnly || tab.key === "account") && (tab.key !== "features" || viewerRole === "admin")).map(tab => ({ id: tab.key, label: tab.short }))} />
  );

  if (!locationData) {
    if (activeTab === "account") {
      return (
        <Page width="narrow">
          <PageHeader title="Ayarlar" />
          <TabBar />
          <BranchAccountTab viewerRole={viewerRole} />
        </Page>
      );
    }
    return <div className="p-8 text-slate-500">Yükleniyor...</div>;
  }

  return (
    <SettingsLockCtx.Provider value={isCatLocked}>
    <Page width="narrow">
      <PageHeader title="Ayarlar" description={locationData.name} />

      <TabBar />

      {/* Temel: tek kart; Gelişmiş/Özellikler/Hesabım kendi kart ve listelerini çizer (kart içinde kart yok) */}
      <div className={activeTab === "basic" ? "bg-white rounded-2xl border border-slate-200 p-4 sm:p-5" : ""}>

          {/* ─── TEMEL AYARLAR ─── */}
          {activeTab === "basic" && (
            <div className="space-y-8">
              {/* İşletme türü: roller, belge kataloğu, sektör dili ve önerilen kurallar buna bağlı */}
              <div>
                <SectionLabel>İşletme Türü</SectionLabel>
                {savedIndustry ? (
                  <>
                    <p className="text-sm font-semibold text-slate-800">
                      {savedIndustry.variants.find(v => v.key === savedVariant)?.label ?? savedIndustry.variants[0].label}
                      <span className="font-normal text-slate-500"> · {savedIndustry.label}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Belge kontrolü, yasal uyarılar ve öneriler seçtiğiniz işletme türüne göre yapılır.
                      {viewerRole === "admin" && !industryDraft && (
                        <> <button type="button" onClick={() => setIndustryDraft({ industry: savedIndustry.key, variant: savedVariant ?? savedIndustry.variants[0].key })}
                          className="font-semibold text-forest-700 hover:underline">Değiştir</button></>
                      )}
                    </p>
                    {viewerRole === "admin" && industryDraft && (
                      <div className="mt-3 space-y-3">
                        <IndustryPicker compact industry={pickedIndustry} variant={pickedVariant}
                          onChange={(industry, variant) => setIndustryDraft({ industry, variant })} />
                        <p className="text-xs text-slate-500">Vardiyalarınız ve ayarlarınız değişmez. Görev listesi ve öneriler yeni türe göre güncellenir.</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => saveIndustry()} disabled={industrySaving || isDirty || !industryChanged}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-forest-700 text-white hover:bg-forest-800 disabled:opacity-50">Türü Kaydet</button>
                          <button onClick={() => setIndustryDraft(null)} disabled={industrySaving} className="px-2 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Vazgeç</button>
                          {isDirty && <span className="text-xs text-amber-700">Önce aşağıdaki kaydedilmemiş değişiklikleri kaydedin.</span>}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 mb-3">
                      Henüz seçilmedi. Belge kontrolü ve Ana Sayfa&apos;daki öncelikler işletme türüne göre çalışır.
                    </p>
                    {/* İşletme düzeyinde karar: sadece hesap sahibi seçer */}
                    {viewerRole === "admin" ? (
                    <IndustryPicker compact industry={pickedIndustry} variant={pickedVariant}
                      onChange={(industry, variant) => setIndustryDraft({ industry, variant })} />
                    ) : <p className="text-xs text-slate-500">İşletme türünü hesap sahibi seçer.</p>}
                    {industryChanged && (
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <button onClick={() => saveIndustry()} disabled={industrySaving || isDirty}
                          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-forest-700 text-white hover:bg-forest-800 disabled:opacity-50">Türü Kaydet</button>
                        <button onClick={() => setIndustryDraft(null)} disabled={industrySaving} className="px-2 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Vazgeç</button>
                        {isDirty && <span className="text-xs text-amber-700">Önce aşağıdaki kaydedilmemiş değişiklikleri kaydedin.</span>}
                      </div>
                    )}
                  </>
                )}
                {savedIndustry && !industryChanged && (
                  <details className="mt-3 text-xs text-slate-600">
                    <summary className="cursor-pointer font-semibold text-slate-500 hover:text-slate-800">{getIndustry(savedIndustry.key)!.label} için yasal notlar ({savedIndustry.legalNotes.length})</summary>
                    <ul className="mt-2 space-y-2">
                      {savedIndustry.legalNotes.map(n => (
                        <li key={n.title} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                          <p className="font-bold text-slate-700">{n.title}</p>
                          <p className="mt-0.5">{n.text}</p>
                          {n.basis && <p className="mt-0.5 text-slate-400">Dayanak: {n.basis}</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>


                {/* Departmanlar Temel'de (2026-10-04): kafe/fabrikada plan tablosunun ana yapısı; anında kaydedilir */}
                <div>
                  <SectionLabel>Departmanlar</SectionLabel>
                  <p className="text-xs text-slate-400 mb-3">
                    İsteğe bağlı. Mutfak, salon, kasa gibi bölümler eklerseniz her birine kaç kişi gerektiğini ayrı girersiniz.
                    Ekledikten sonra Ekip sayfasından kişileri departmanlara dağıtın; departmanı olmayan kişi otomatik plana girmez.
                  </p>

                  {deptError && (
                    <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{deptError}</div>
                  )}

                  {/* Yeni departman */}
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      value={newDeptName}
                      onChange={e => setNewDeptName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleAddDepartment(); }}
                      placeholder="Yeni departman adı (örn: Kasa)"
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20"
                    />
                    <button
                      disabled={!newDeptName.trim()}
                      onClick={() => handleAddDepartment()}
                      className="flex items-center gap-1.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
                    >
                      <Plus size={14} /> Ekle
                    </button>
                  </div>

                  {/* Departman listesi */}
                  {departments.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                      Henüz departman yok. Departman yoksa kaç kişi gerektiği tek tablo olarak girilir.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {sortDepartments(departments).map(dept => (
                        <Fragment key={dept.id}>
                        <div className={cn("flex items-center gap-2 sm:gap-3 bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-3", dept.parent_id && "ml-5 sm:ml-6")}>
                          <div className={cn("rounded-full shrink-0", dept.parent_id ? "w-2 h-2 bg-forest-300" : "w-2.5 h-2.5 bg-forest-400")} />
                          {editingDeptId === dept.id ? (
                            <input
                              value={editingDeptName}
                              onChange={e => setEditingDeptName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleRenameDepartment(dept.id);
                                if (e.key === "Escape") setEditingDeptId(null);
                              }}
                              autoFocus
                              className="flex-1 px-2 py-1 text-sm border border-forest-400 rounded-lg outline-none"
                            />
                          ) : (
                            <span className="flex-1 min-w-0 truncate font-semibold text-slate-800 text-sm">{dept.name}</span>
                          )}
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(dept as any).personnel_count !== undefined && (
                            <StatusPill tone="neutral" className="shrink-0 hidden sm:inline-flex">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {(dept as any).personnel_count} kişi
                            </StatusPill>
                          )}
                          {editingDeptId === dept.id ? (
                            <>
                              <button onClick={() => handleRenameDepartment(dept.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg shrink-0" title="Kaydet"><Check size={14} /></button>
                              <button onClick={() => setEditingDeptId(null)} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg shrink-0" title="Vazgeç"><X size={14} /></button>
                            </>
                          ) : (
                            <>
                              {!dept.parent_id && (
                                <button onClick={() => { setSubParentId(subParentId === dept.id ? null : dept.id); setNewSubName(""); }}
                                  className="px-2 py-1 text-xs font-semibold text-forest-700 hover:bg-forest-50 rounded-lg shrink-0">
                                  <span className="sm:hidden">+ Alt</span><span className="hidden sm:inline">+ Alt departman</span>
                                </button>
                              )}
                              <button onClick={() => { setEditingDeptId(dept.id); setEditingDeptName(dept.name); }} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg shrink-0" title="İsmi düzenle"><Pencil size={13} /></button>
                              <button onClick={() => handleDeleteDepartment(dept)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg shrink-0" title="Sil"><X size={13} /></button>
                            </>
                          )}
                        </div>
                        {subParentId === dept.id && (
                          <div className="ml-5 sm:ml-6 flex items-center gap-2">
                            <input
                              value={newSubName}
                              onChange={e => setNewSubName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleAddDepartment(dept.id); if (e.key === "Escape") setSubParentId(null); }}
                              autoFocus
                              placeholder={`${dept.name} altında yeni bölüm`}
                              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20"
                            />
                            <button disabled={!newSubName.trim()} onClick={() => handleAddDepartment(dept.id)}
                              className="flex items-center gap-1.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0">
                              <Plus size={14} /> Ekle
                            </button>
                          </div>
                        )}
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>

              {/* 1. Çalışma Saatleri — lokasyonun açık olduğu saatler */}
              <div>
                <SectionLabel>Çalışma Saatleri</SectionLabel>
                <p className="text-xs text-slate-400 mb-3">Her gün kaçta açılıp kaçta kapandığınızı belirleyin. Vardiyalar bu aralık içinde kalmalıdır.</p>
                {/* Tek satır özet; 7 günlük düzenleyici "Düzenle" ile açılır */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                  <p className="text-sm font-semibold text-slate-700 min-w-0">{summarizeOperatingHours(locationData.operating_hours)}</p>
                  <button type="button" onClick={() => setHoursOpen(o => !o)} aria-expanded={hoursOpen}
                    className="text-xs font-semibold text-forest-700 hover:text-forest-900 shrink-0">
                    {hoursOpen ? "Kapat" : "Düzenle"}
                  </button>
                </div>
                {hoursOpen && <div className="space-y-1 mt-2">
                  {DAYS.map((dayName, idx) => {
                    const dayData = (locationData.operating_hours ?? {})[idx] ?? { isOpen: true, open: "00:00", close: "23:59" };
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
                            className="w-4 h-4 text-forest-600 border-slate-300 rounded focus:ring-forest-600 cursor-pointer"
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
                </div>}
              </div>

              {/* 2. Vardiya Tanımları */}
              <div>
                <SectionLabel>Vardiya Tanımları</SectionLabel>
                <p className="text-xs text-slate-400 mb-3">Her vardiyanın adını, başlangıç ve bitişini, molasını ve ne kadar zor olduğunu belirleyin.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(locationData.shift_definitions ?? []).map((shift: ShiftDefinition, idx: number) => (
                    <div key={shift.id} className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-white space-y-3">
                      {/* Ad + Gece badge + Sil */}
                      <div className="flex items-center gap-2">
                        <input
                          value={shift.name}
                          onChange={e => {
                            const next = [...locationData.shift_definitions];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setLocationData({ ...locationData, shift_definitions: next });
                          }}
                          className="flex-1 min-w-0 font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-forest-500 outline-none px-1 py-0.5 text-sm"
                        />
                        {/* İcap nöbeti kaldırıldı (kullanıcı kararı 2026-10-06): düğme sadece eski kayıtta kapatmak için görünür */}
                        {shift.on_call && (
                        <button
                          type="button"
                          title="Nöbet: kişi evde bekler, çağrılırsa işe gelir. Nöbet çalışma süresine sayılmaz ve aynı gün normal vardiyayla birlikte verilebilir."
                          onClick={() => {
                            const next = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                              i === idx ? { ...s, on_call: !s.on_call } : s
                            );
                            setLocationData({ ...locationData, shift_definitions: next });
                          }}
                          className={cn(
                            "shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors",
                            shift.on_call
                              ? "bg-violet-50 border-violet-300 text-violet-700"
                              : "bg-white border-slate-200 text-slate-300 hover:text-slate-500"
                          )}
                        >
                          <PhoneCall size={10} /> Nöbet
                        </button>
                        )}
                        <button
                          onClick={() => {
                            const next = locationData.shift_definitions.filter((_: ShiftDefinition, i: number) => i !== idx);
                            setLocationData({ ...locationData, shift_definitions: next });
                          }}
                          aria-label="Vardiyayı sil" title="Vardiyayı sil"
                          className="shrink-0 text-slate-400 hover:text-red-500 p-1.5 -mr-1.5 transition-colors"
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
                      {/* Mola: vardiyanın içinde, çalışma süresine sayılmaz (lib/legal breakMinutes). Boş = yasal asgari */}
                      {!shift.on_call && (
                        <BreakPicker id={`break-${idx}`} start={shift.start} end={shift.end} value={shift.break_minutes}
                          onChange={v => {
                            const next = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                              i === idx ? { ...s, break_minutes: v } : s
                            );
                            setLocationData({ ...locationData, shift_definitions: next });
                          }} />
                      )}
                      {shift.on_call && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-2 py-1.5">
                          <span className="flex-1 min-w-[180px]">Nöbet: kişi evde bekler. Bekleme çalışma süresine ve fazla mesaiye sayılmaz. Kişi çağrılırsa ne kadar çalıştığı Vardiya Planı&apos;ndan girilir.</span>
                          <label className="flex items-center gap-1 font-semibold">
                            Nöbet ücreti
                            <input type="number" min={0} step={50} value={shift.on_call_pay ?? ""} placeholder="0"
                              onChange={e => {
                                const v = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value));
                                const next = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                                  i === idx ? { ...s, on_call_pay: v } : s
                                );
                                setLocationData({ ...locationData, shift_definitions: next });
                              }}
                              className="w-20 border border-violet-200 rounded-md px-1.5 py-0.5 bg-white text-slate-800" />
                            ₺
                          </label>
                        </div>
                      )}
                      {!shift.on_call && (savedIndustry?.key === "logistics" || (shift.driving_hours ?? 0) > 0) && (
                        <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5">
                          <span className="font-semibold">Direksiyon süresi</span>
                          <input type="number" min={0} max={12} step={0.5} value={shift.driving_hours ?? ""} placeholder="0"
                            onChange={e => {
                              const v = e.target.value === "" ? undefined : Math.max(0, Math.min(12, Number(e.target.value)));
                              const next = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                                i === idx ? { ...s, driving_hours: v } : s
                              );
                              setLocationData({ ...locationData, shift_definitions: next });
                            }}
                            className="w-16 border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-800" />
                          <span>saat</span>
                          <span className="text-slate-400 basis-full sm:basis-auto">Plan AETR sürüş sınırlarına uyar: günde en fazla 9 (haftada 2 gün 10), haftada 56, iki haftada 90 saat.</span>
                        </label>
                      )}
                      {(shift.driving_hours ?? 0) > DAILY_DRIVING_EXTENDED_HOURS && (
                        <p className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                          ⚠ Günlük direksiyon süresi 10 saati aşamaz (AETR). Bu vardiya kimseye yazılmaz.
                        </p>
                      )}
                      {!shift.on_call && netWorkHours(shiftDurationHours(shift), shift.break_minutes) > DAILY_MAX_NET_HOURS && (
                        <p className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                          ⚠ Mola düşülünce çalışma süresi günlük 11 saati aşıyor (İş Kanunu m.63). Vardiyayı kısaltın.
                        </p>
                      )}
                      {isNightDef(shift) && nightLegalWarning && netWorkHours(shiftDurationHours(shift), shift.break_minutes) > 7.5 && (
                        <p className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                          ⚠ Gece çalışması en fazla 7,5 saat olabilir. Vardiyayı kısaltmanız önerilir.
                        </p>
                      )}

                      {/* Zorluk: tek seçici (components/ui/DifficultyPicker) */}
                      <DifficultyPicker value={shift.base_points} onChange={val => {
                        const next = locationData.shift_definitions.map((s: ShiftDefinition, i: number) =>
                          i === idx ? { ...s, base_points: val } : s
                        );
                        setLocationData({ ...locationData, shift_definitions: next });
                      }} />
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
                    className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[40px] w-fit rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Plus size={15} />
                    <span>Vardiya ekle</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ─── GELİŞMİŞ SEÇENEKLER ─── */}
          {activeTab === "advanced" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Çoğu işletme bu ayarları hiç değiştirmeden kullanır. Açmak için başlığa dokunun.
              </p>
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
              <SettingsGroup id="autopilot" title="Otomatik Pilot" description="Gelecek haftanın planını her hafta seçtiğiniz gün ve saatte taslak olarak hazırlama" open={!!openGroups["autopilot"]} onToggle={toggleGroup}>
              <div className="space-y-4">
                <SectionCard title="Otomatik Pilot">
                  <RuleRow
                    label="Planı her hafta otomatik hazırla"
                    description={
                      <span>
                        Gelecek haftanın planı seçtiğiniz gün ve saatte taslak olarak hazırlanır. Siz kontrol edip yayınlarsınız.
                        Ekip taslağı görmez. O haftanın planını kendiniz hazırlamaya başladıysanız otomatik taslak hazırlanmaz.
                        {autopilotEnabled && (
                          <span className="flex flex-wrap items-center gap-2 mt-2">
                            <span>Her</span>
                            <select
                              value={autopilotDay}
                              onChange={e => setAutopilotDay(e.target.value)}
                              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-forest-400 bg-white"
                            >
                              {AUTOPILOT_DAY_NAMES.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
                            </select>
                            <span>günü saat</span>
                            <select
                              value={autopilotHour}
                              onChange={e => setAutopilotHour(e.target.value)}
                              aria-label="Saat"
                              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-forest-400 bg-white tabular-nums"
                            >
                              {Array.from({ length: 24 }, (_, h) => <option key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</option>)}
                            </select>
                          </span>
                        )}
                      </span>
                    }
                    right={<Toggle on={autopilotEnabled} onToggle={() => setAutopilotEnabled(v => !v)} />}
                  />
                  <RuleRow
                    label="Sabah özeti"
                    description="Her sabah 08:00'de tek bildirim: bugün kimler çalışıyor, kim izinde, hangi işler kararınızı bekliyor ve çözümleri. Bugün planı ve bekleyen işi olmayan günde gönderilmez."
                    right={<Toggle on={morningBriefEnabled} onToggle={() => setMorningBriefEnabled(v => !v)} />}
                  />
                </SectionCard>
              </div>
              </SettingsGroup>
              <SettingsGroup id="requests" title="Ekip Talepleri" description="Uygunluk, hatırlatma, vardiya değiştirme ve izin kuralları" open={!!openGroups["requests"]} onToggle={toggleGroup}>
              <div className="space-y-4">
                <SectionCard title="Uygunluk">
                  <RuleRow
                    label="Uygunluk Toplama"
                    description="Kapalıysa ekipten uygunluk istenmez, planı siz yaparsınız."
                    right={<Toggle on={availabilityCollectionEnabled} onToggle={() => setAvailabilityCollectionEnabled(v => !v)} />}
                  />
                  {availabilityCollectionEnabled && (
                    <RuleRow
                      label='Haftalık "Tercih Etmem" Hakkı'
                      description="Ekip üyesi haftada en fazla bu kadar günü &quot;Tercih etmem&quot; olarak işaretleyebilir. Bu işaret, gerekirse gelebileceği anlamına gelir."
                      right={<NumberInput value={maxPreferredNotDays} onChange={setMaxPreferredNotDays} min={0} max={7} suffix="gün" />}
                    />
                  )}
                  {availabilityCollectionEnabled && (
                    <RuleRow
                      label="Otomatik Uygunluk Hatırlatması"
                      description={
                        <span>
                          Seçilen gün ve saatte, gelecek haftanın uygunluğunu girmemiş kişilere haftada bir kez bildirim gönderilir.
                          {reminderEnabled && (
                            <span className="flex flex-wrap items-center gap-2 mt-2">
                              <span>Her</span>
                              <select
                                value={reminderDay}
                                onChange={e => setReminderDay(e.target.value)}
                                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-forest-400 bg-white"
                              >
                                {DAYS.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
                              </select>
                              <span>günü saat</span>
                              <TimeInput value={reminderTime} onChange={setReminderTime} />
                            </span>
                          )}
                        </span>
                      }
                      right={<Toggle on={reminderEnabled} onToggle={() => setReminderEnabled(v => !v)} />}
                    />
                  )}
                </SectionCard>
                <SectionCard title="Vardiya Talepleri">
                  <RuleRow
                    label="Vardiya Değiştirme Talebi"
                    description="Ekip üyeleri kendi aralarında vardiya değiştirebilir, sorumlu onaylar."
                    right={<Toggle on={swapRequestsEnabled} onToggle={() => setSwapRequestsEnabled(v => !v)} />}
                  />
                  <RuleRow
                    label="Vardiya Değişiklik Talebi"
                    description="Ekip üyesi vardiyasında hata görürse düzeltme isteği gönderir."
                    right={<Toggle on={editRequestsEnabled} onToggle={() => setEditRequestsEnabled(v => !v)} />}
                  />
                </SectionCard>
                <SectionCard title="İzin Politikası">
                  <RuleRow
                    label="İzin Talepleri"
                    description="Ekip üyeleri uygulamadan izin ister, sorumlu onaylar."
                    right={<Toggle on={leaveRequestsEnabled} onToggle={() => setLeaveRequestsEnabled(v => !v)} />}
                  />
                  <RuleRow
                    label="Kıdeme Göre İzin Hak Edişi"
                    description="Açıkken yıllık izin hakkı işe giriş tarihinden otomatik hesaplanır: 1-5 yıl 14, 5+ yıl 20, 15+ yıl 26 gün (İş K. m.53); kullanılmayan izin devreder. Kapalıyken kişi kartındaki sabit gün geçerlidir."
                    right={<Toggle on={autoLeaveEntitlement} onToggle={() => setAutoLeaveEntitlement(v => !v)} />}
                  />
                </SectionCard>
              </div>
              </SettingsGroup>
              <SettingsGroup id="planning" title="Planlama Kuralları" description="Çalışma ve dinlenme sınırları, gece kuralları, bütçe, yayın" open={!!openGroups["planning"]} onToggle={toggleGroup}>
                <SectionCard title="Çalışma Süresi">
                  <RuleRow
                    lock="rules" label="Haftalık En Fazla Çalışma"
                    description="Kimseye bundan fazla vardiya yazılmaz. Kişinin kartında daha düşük sınır verilebilir."
                    right={<NumberInput value={maxWeeklyHours} onChange={setMaxWeeklyHours} min={20} max={60} suffix="saat" />}
                  />
                  <RuleRow
                    lock="rules" label="Fazla Mesai Başlangıcı"
                    description="Haftada bunu aşan çalışma fazla mesai sayılır (maliyet ×1,5)."
                    right={<NumberInput value={overtimeThresholdHours} onChange={setOvertimeThresholdHours} min={1} max={60} suffix="saat" />}
                  />
                  {/* Fazla mesai takibi açıkken: yıllık sınır ve dağılım (Özellikler sadece aç/kapat) */}
                  {overtimeTrackingEnabled && (<>
                  <RuleRow
                    lock="rules" label="Yıllık Fazla Mesai Sınırı"
                    description="Kişi başı yıllık fazla mesai üst sınırı (İş Kanunu m.41: 270)."
                    right={<NumberInput value={maxYtdOvertimeHours} onChange={setMaxYtdOvertimeHours} min={0} max={500} suffix="saat/yıl" />}
                  />
                  <RuleRow
                    lock="rules" label="Mesaiyi dengeli dağıt"
                    description="Bu yıl çok mesai yapan kişiye ek vardiya daha zor yazılır."
                    right={<Toggle on={overtimeFairDistribution} onToggle={() => setOvertimeFairDistribution(v => !v)} />}
                  />
                  </>)}
                  {(shiftWorkBusiness || balancingPeriodWeeks > 0) && <RuleRow
                    lock="rules" label="Denkleştirme Dönemi"
                    description="0 kapalı demektir. 2-8 hafta seçerseniz yoğun haftalardaki fazla çalışma, aynı dönemdeki hafif haftalarla dengelenir. Bir haftada en fazla 66 saat çalışılabilir (İş K. m.63)."
                    right={<NumberInput value={balancingPeriodWeeks} onChange={setBalancingPeriodWeeks} min={0} max={8} suffix="hafta" />}
                  />}
                  <RuleRow
                    lock="rules" label="Arka Arkaya En Fazla Çalışma Günü"
                    description="Kimse arka arkaya bu kadar günden fazla çalışmaz. Haftada 1 gün izin her zaman verilir."
                    right={<NumberInput value={maxConsecutiveDays} onChange={setMaxConsecutiveDays} min={1} max={7} suffix="gün" />}
                  />
                  {(locationData?.shift_definitions ?? []).some((d: ShiftDefinition) => d.on_call) && (
                    <RuleRow
                      lock="rules" label="Haftalık Nöbet Sınırı"
                      description="Bir kişiye haftada en fazla bu kadar nöbet yazılır. Nöbetler ayrıca Adalet Puanı'yla dengeli dağıtılır."
                      right={<NumberInput value={maxOnCallPerWeek} onChange={setMaxOnCallPerWeek} min={0} max={7} suffix="icap" />}
                    />
                  )}
                </SectionCard>
                {/* Dinlenme tek yerde: kesin alt sınır + esnek tercih (eski kapanış→açılış tespiti/eşiği/hassasiyeti tek satır) */}
                <SectionCard title="Dinlenme">
                  <RuleRow
                    lock="rules" label="En Az Dinlenme Süresi"
                    description="İki vardiya arasında en az bu kadar dinlenme olur."
                    right={<NumberInput value={minRestHours} onChange={setMinRestHours} min={8} max={16} suffix="saat" />}
                  />
                  {(hasNightShift || noNightToMorning) && <RuleRow
                    lock="rules" label="Geceden sonra sabah vardiyası yok"
                    description="23:00 ve sonrasında biten vardiyanın ertesi günü öğlene kadar başlayan vardiya verilmez."
                    right={<Toggle on={noNightToMorning} onToggle={() => setNoNightToMorning(v => !v)} />}
                  />}
                </SectionCard>
                {hasNightShift && (
                <SectionCard title="Gece Çalışması">
                  <RuleRow
                    lock="rules" label="Gece 7,5 Saat Uyarısı"
                    description="Gece vardiyasında (22:00 sonrası başlayan ya da gece yarısını geçen) çalışma 7,5 saati aşarsa vardiya düzenleme penceresinde ve yayın öncesi kontrolde uyarı gösterilir (yasal sınır). Sadece bilgilendirir, engellemez."
                    right={<Toggle on={nightLegalWarning} onToggle={() => setNightLegalWarning(v => !v)} />}
                  />
                </SectionCard>
                )}
              </SettingsGroup>
              <SettingsGroup id="live" title="Vardiya Girişi" description="Giriş yöntemi (telefon, konum, ortak tablet), geç kalma" open={!!openGroups["live"]} onToggle={toggleGroup}>
                {/* Girişle ilgili her şey TEK yerde: yöntem seçimi kiosk_mode_enabled ve gps_checkin_required'ı birlikte yazar */}
                <SectionCard title="Vardiya Girişi">
                  <RuleRow
                    label="Vardiyaya giriş yapılsın"
                    description="Açıkken ekip vardiyaya geldiğinde giriş yapar; giriş yapmayan geç kalan sayılır. Kapalıyken giriş, geç kalma ve QR ayarları gizlenir."
                    right={<Toggle on={checkinRequired} onToggle={() => setCheckinRequired(v => !v)} />}
                  />
                  {/* Giriş kapalıyken yöntem, geç kalma ve QR anlamsız: hiçbiri çalışmaz (dashboard isLate checkin_required'a bakar) */}
                  {checkinRequired && (<>
                  <div className="py-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-900">Giriş nasıl yapılır?</p>
                    {([
                      { id: "phone", label: "Kendi telefonundan", desc: "Ekip üyesi telefonundaki vardiya kartından ya da işyerine asılan QR kodu okutarak giriş yapar." },
                      { id: "gps", label: "Telefondan, konum doğrulamalı", desc: "İşyerine belirlediğiniz mesafeden uzaktaki giriş reddedilir." },
                      { id: "kiosk", label: "İşyerindeki ortak tabletten, PIN ile", desc: "Ekip üyesi hesabına girmeden, 4 haneli PIN ile giriş ve çıkış yapar." },
                    ] as const).map(opt => {
                      const current = kioskModeEnabled ? "kiosk" : gpsCheckinRequired ? "gps" : "phone";
                      const on = current === opt.id;
                      // Ortak tablet "Ek özellikler" iznine bağlı; konum seçimi değil
                      const featuresLocked = isCatLocked("features") && (opt.id === "kiosk" || current === "kiosk");
                      return (
                        <label key={opt.id} className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer", on ? "border-forest-300 bg-forest-50/60" : "border-slate-200", featuresLocked && "opacity-50 cursor-not-allowed")}>
                          <input type="radio" name="checkin-method" checked={on} disabled={featuresLocked}
                            onChange={() => { setKioskModeEnabled(opt.id === "kiosk"); setGpsCheckinRequired(opt.id === "gps"); }}
                            className="mt-0.5 accent-forest-600" />
                          <span>
                            <span className="block text-sm font-semibold text-slate-800">{opt.label}</span>
                            <span className="block text-xs text-slate-500">{opt.desc}</span>
                          </span>
                        </label>
                      );
                    })}
                    {gpsCheckinRequired && !kioskModeEnabled && (
                      <p className="flex items-center gap-2 text-xs text-slate-600">
                        <span>İzin verilen mesafe:</span>
                        <input
                          type="number" min={20} max={2000} value={checkinRadiusM}
                          onChange={e => setCheckinRadiusM(Math.min(2000, Math.max(20, parseInt(e.target.value) || 150)))}
                          className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-forest-500"
                        />
                        <span>metre</span>
                      </p>
                    )}
                    {kioskModeEnabled && (
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/kiosk/${selectedLocationId}`);
                            setKioskLinkCopied(true);
                            setTimeout(() => setKioskLinkCopied(false), 2000);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${kioskLinkCopied ? "bg-emerald-500 text-white" : "bg-forest-50 text-forest-700 hover:bg-forest-100"}`}
                        >
                          {kioskLinkCopied ? "Kopyalandı" : "Tablet Bağlantısını Kopyala"}
                        </button>
                        <p className="text-xs text-slate-400 mt-1.5">Bu bağlantıyı ortak tabletin tarayıcısında sabit sekme olarak açın. Kişilerin PIN&apos;leri Ekip sayfasında, kişinin kartında yazar.</p>
                      </div>
                    )}
                  </div>
                  <RuleRow
                    label="Geç kalanın vardiyası açık vardiyaya dönsün"
                    description={
                      <span>
                        Vardiya başlangıcından <span className="font-semibold">{lateThresholdMin} dakika</span> sonra hâlâ giriş yapmayan kişinin vardiyası otomatik açık vardiyaya dönüşür.
                        {autoOpenShiftOnLate && (
                          <span className="flex items-center gap-2 mt-2">
                            <span>Eşik:</span>
                            <input
                              type="number" min={10} max={120} value={lateThresholdMin}
                              onChange={e => setLateThresholdMin(Math.min(120, Math.max(10, parseInt(e.target.value) || 30)))}
                              className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-forest-500"
                            />
                            <span>dakika</span>
                          </span>
                        )}
                      </span>
                    }
                    right={<Toggle on={autoOpenShiftOnLate} onToggle={() => setAutoOpenShiftOnLate(v => !v)} />}
                  />
                  </>)}
                  {FEATURES.breaks && (<>
                  <RuleRow
                    label="Eş Zamanlı Mola Limiti"
                    description="Aynı anda molaya çıkabilecek en fazla kişi sayısı. Aşılınca sorumlunun ekranında uyarı gösterilir."
                    right={<NumberInput value={maxConcurrentBreaks} onChange={setMaxConcurrentBreaks} min={1} max={10} suffix="kişi" />}
                  />
                  <RuleRow
                    label="Uzun Mola Uyarı Eşiği"
                    description="Mola bu süreden uzun sürerse kart kırmızıya döner ve sorumlunun ekranında 'Uzun mola!' uyarısı çıkar."
                    right={<NumberInput value={maxBreakDurationMin} onChange={setMaxBreakDurationMin} min={5} max={60} suffix="dk" />}
                  />
                  </>)}
                </SectionCard>

                {checkinRequired && !kioskModeEnabled && (
                <SectionCard title="Giriş için QR kod">
                  <p className="text-xs text-slate-500 mb-4">
                    Bu QR kodu işyerinize (giriş kapısı, pano vb.) asın. Ekip telefon kamerasıyla okuttuğunda doğrudan giriş ekranı açılır, bugün vardiyası varsa ve henüz giriş yapmadıysa otomatik giriş dener.
                  </p>
                  <div className="flex items-center gap-6">
                    <div className="bg-white p-3 border border-slate-200 rounded-2xl shrink-0">
                      <QRCodeSVG
                        value={typeof window !== "undefined" ? `${window.location.origin}/portal?qr=1` : "/portal?qr=1"}
                        size={140}
                      />
                    </div>
                    <div className="text-xs text-slate-500 space-y-2">
                      <p>Yazdırıp panoya asabilir ya da ekrandan doğrudan gösterebilirsiniz.</p>
                      <button
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                      >
                        Yazdır
                      </button>
                    </div>
                  </div>
                </SectionCard>
                )}
                {/* İşyeri konumu (2026-10-05 Temel'den taşındı): konumlu giriş ve plan ekranındaki hava durumu */}
                <SectionCard title="İşyeri konumu">
                <RuleRow
                  wide
                  label="Konum"
                  description="Konum doğrulamalı giriş ve plan ekranındaki hava durumu bu konumu kullanır."
                  right={
                    <div className="flex flex-col items-stretch sm:items-end gap-2 sm:min-w-[220px]">
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
                            className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
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
                        className="flex items-center gap-1.5 text-xs text-forest-600 border border-forest-200 bg-forest-50 rounded-lg px-2.5 py-1.5 hover:bg-forest-100 transition-colors w-full justify-center font-medium"
                      >
                        📍 Cihaz konumumu kullan
                      </button>
                    </div>
                  }
                />
              </SectionCard>
              </SettingsGroup>
              <SettingsGroup id="fairness" title="Adalet Puanı" description="Vardiyaların ekibe eşit dağıtılması" open={!!openGroups["fairness"]} onToggle={toggleGroup}>
                <LockArea cat="rules">

                {/* Açıklama: puanın ne olduğu ve neye yaradığı, tek örnekle */}
                <div className="bg-forest-50 border border-forest-100 rounded-xl p-4 flex gap-3">
                  <Scale size={18} className="text-forest-500 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 text-xs text-forest-700">
                    <p className="text-sm font-semibold text-forest-800">Adalet Puanı nedir?</p>
                    <p>Kişi çalıştığı her vardiyadan puan alır. Puanı yüksek olan kişi çok çalışmış demektir. Otomatik plan, puanı düşük olana daha çok, puanı yüksek olana daha az vardiya vererek iş yükünü eşitler.</p>
                    <p>Örnek: orta zorlukta 8 saatlik vardiya 8 puandır. Vardiyanın ne kadar zor olduğu Temel › Vardiya Tanımları&apos;ndan gelir. Aşağıdakiler bunun üstüne eklenen puanlardır.</p>
                  </div>
                </div>
                <SectionCard title="Zor günler">
                  <p className="text-xs text-slate-500 pt-4">Zor sayılan günde çalışan kişiye ek puan yazılır. Böylece bu günler ekibe sırayla düşer. 0 yazılan gün zor sayılmaz. Bir gün birden fazla nedenle zor sayılıyorsa en yüksek puan yazılır, puanlar toplanmaz. Örnek: Pazar 4, bayram 8 puansa Pazar&apos;a denk gelen bayramda 8 puan yazılır.</p>
                  <RuleRow wide
                    label="Haftanın günleri"
                    description="Her güne ayrı puan verin. Örnek: Cuma 2, Cumartesi 4, Pazar 4. Cumartesi 8 saat çalışan kişi 8 yerine 12 puan alır."
                    right={<div className="w-full sm:w-[22rem]"><DayPointsGrid value={hardDays.dayPoints} onChange={v => setHardDays(h => ({ ...h, dayPoints: v }))} /></div>}
                  />
                  <RuleRow
                    label="Resmi tatil ve bayram günleri"
                    description={<>Türkiye resmi tatil takvimine göre otomatik uygulanır.{nextHoliday && <> Sıradaki: {nextHoliday.name} ({formatDateTR(nextHoliday.date)}).</>}</>}
                    right={<NumberInput value={hardDays.holidayPoints} onChange={v => setHardDays(h => ({ ...h, holidayPoints: v }))} min={0} max={20} suffix="puan" />}
                  />
                  <RuleRow
                    label="Kişinin tercih etmem dediği gün"
                    description="Kişi uygunluk girerken &quot;mümkünse çalışmam&quot; dediği günde çalışırsa."
                    right={<NumberInput value={hardDays.prefNotPoints} onChange={v => setHardDays(h => ({ ...h, prefNotPoints: v }))} min={0} max={20} suffix="puan" />}
                  />
                  <RuleRow wide
                    label="İşletmenize özel günler"
                    description="Belirli bir tarihe ek puan verin. Örnek: yerel festival, yılbaşı gecesi, büyük bir maç günü. Aşağıdaki öneriler takvimdeki yaklaşan günlerdir."
                    right={null}
                  />
                  <div className="pb-4 -mt-1 border-t-0">
                    <SpecialDatesEditor value={hardDays.specialDates} onChange={v => setHardDays(h => ({ ...h, specialDates: v }))}
                      industry={savedIndustry?.key ?? null} today={todayIso} />
                  </div>
                </SectionCard>
                {/* Vardiya dışı olaylarla yazılan puanlar (eski adı "Bonus Puanları") */}
                <SectionCard title="Ekibe kolaylık sağlayana ek puan">
                  <p className="text-xs text-slate-500 pt-4 pb-3">Bu durumlarda kişiye fazladan puan yazılır. Puanı yükselen kişiye sonraki planlarda daha az vardiya verilir. Böylece ekibe kolaylık sağlayan kişi ödüllendirilir. 0 yazarsanız kapanır.</p>
                  <RuleRow
                    label="Boşta kalan vardiyayı alınca"
                    description="Açık Vardiyalar'dan gönüllü olarak bir vardiya alan kişiye."
                    right={<NumberInput value={heroBonusPoints} onChange={setHeroBonusPoints} min={0} max={20} suffix="puan" />}
                  />
                  <RuleRow
                    label="Yayından sonra vardiyası değişince"
                    description="Plan yayınlandıktan sonra vardiyası değiştirilen kişiye, düzeni bozulduğu için."
                    right={
                      <div className="flex items-center gap-2">
                        <div className={changeCompensationEnabled ? "" : "opacity-40 pointer-events-none"}>
                          <NumberInput value={changeCompensationPoints} onChange={setChangeCompensationPoints} min={0} max={10} suffix="puan" />
                        </div>
                        <Toggle on={changeCompensationEnabled} onToggle={() => setChangeCompensationEnabled(v => !v)} />
                      </div>
                    }
                  />
                  <RuleRow
                    label="İzin gününde çağrılınca"
                    description="İzinli olduğu gün çalışmaya çağrılan ve bunu kabul eden kişiye."
                    right={<NumberInput value={forceBonusPoints} onChange={setForceBonusPoints} min={0} max={20} suffix="puan" />}
                  />
                </SectionCard>
                <SectionCard title="Ne kadar geriye bakılsın?">
                  <RuleRow
                    label="Son kaç hafta sayılsın?"
                    description={<>Puan, son bu kadar haftanın toplamıdır. Daha eski haftalar hesaba katılmaz. Örnek: 4 hafta seçiliyse son 4 haftada çok çalışan kişiye sıradaki planda daha az vardiya verilir.</>}
                    right={<NumberInput value={fairnessWindowWeeks} onChange={setFairnessWindowWeeks} min={1} max={12} suffix="hafta" />}
                  />
                </SectionCard>
                </LockArea>
              </SettingsGroup>
              {/* Postalar (A/B/C vardiya grupları) ve vardiya rotasyonu 2026-10-04'te kaldırıldı (kullanıcı kararı);
                  kişi başı çalış/dinlen döngüsü kalır. "Rotasyon" artık şubeler arası (kişinin kartında). */}
              {(shiftWorkBusiness || !!workCycle?.pattern) && (
              <SettingsGroup id="cycle" title="Çalışma Döngüsü" description="Çalışma ve dinlenme sırası (örn. 4 gün çalış, 4 gün dinlen)" open={!!openGroups["cycle"]} onToggle={toggleGroup}>
                <SectionCard title="Çalışma döngüsü">
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-500">Kişiler bu sıraya eşit dağıtılır, böylece her gün benzer sayıda kişi çalışır. Dinlenme günlerinde kimseye vardiya yazılmaz, gündüz ya da gece günlerinde sadece o vardiya verilir. Değişiklik anında kaydedilir.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={workCycle?.pattern ?? ""} disabled={cycleSaving}
                        onChange={e => saveWorkCycle(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                        <option value="">Döngü yok</option>
                        {Object.entries(WORK_CYCLES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                      </select>
                      {workCycle?.pattern && (
                        <button onClick={() => saveWorkCycle(workCycle.pattern)} disabled={cycleSaving}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                          Herkesi yeniden dağıt
                        </button>
                      )}
                    </div>
                    {workCycle?.pattern && WORK_CYCLES[workCycle.pattern] && (
                      <>
                        <p className="text-xs text-slate-400">{WORK_CYCLES[workCycle.pattern].description} Yeni gelen kişiler için &quot;Herkesi yeniden dağıt&quot;a basın.</p>
                        <div className="overflow-x-auto">
                          <table className="text-xs">
                            <thead><tr><th className="text-left pr-3 font-semibold text-slate-500">Bu hafta</th>{DAY_SHORT.map(d => <th key={d} className="px-1 font-semibold text-slate-500">{d}</th>)}</tr></thead>
                            <tbody>
                              {cyclePersonnel.map(p => {
                                const st = weekStates(workCycle, p.id, getWeekStart());
                                return (
                                  <tr key={p.id}>
                                    <td className="pr-3 py-0.5 text-slate-700 whitespace-nowrap">{p.name}</td>
                                    {(st ?? Array(7).fill(null)).map((x, i) => (
                                      <td key={i} className="px-1 py-0.5 text-center">
                                        <span className={cn("inline-block w-6 rounded font-bold",
                                          x === "O" ? "bg-slate-100 text-slate-400" : x === "N" ? "bg-indigo-100 text-indigo-700" : x === "D" ? "bg-amber-100 text-amber-700" : x === "W" ? "bg-forest-100 text-forest-700" : "text-slate-300")}>
                                          {x === "O" ? "–" : x === "N" ? "G" : x === "D" ? "Gü" : x === "W" ? "Ç" : "?"}
                                        </span>
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <p className="text-xs text-slate-400 mt-1">Ç: çalışır · Gü: gündüz · G: gece · –: dinlenme · ?: döngüye dağıtılmamış</p>
                        </div>
                      </>
                    )}
                  </div>
                </SectionCard>
              </SettingsGroup>
              )}
              </div>
            </div>
          )}

          {/* ─── EK ÖZELLİKLER ─── */}
          {activeTab === "features" && (
            (() => {
              // İşletme türü bir özelliği "kullanılmaz" diye işaretlemişse (profil modules[key] === false)
              // ve özellik kapalıysa kart alttaki katlanır bölüme iner; kaybolmaz, isteyen açar.
              const fitsIndustry = (key: string, on: boolean) => on || !savedIndustry || (savedIndustry.modules as Record<string, boolean | undefined>)[key] !== false;
              const fits = {
                  chat: fitsIndustry("chat_enabled", chatEnabled),
                  openShifts: fitsIndustry("open_shifts_enabled", openShiftsEnabled),
                  handover: fitsIndustry("handover_log_enabled", (handoverNotesEnabled || handoverLogEnabled)),
                  conflicts: fitsIndustry("personnel_conflicts_enabled", personnelConflictsEnabled),
                  fatigue: fitsIndustry("fatigue_radar_enabled", fatigueRadarEnabled),
                  compliance: fitsIndustry("compliance_tracking_enabled", complianceTrackingEnabled),
                  forecast: fitsIndustry("forecasting_enabled", forecastingEnabled),
                  tasks: fitsIndustry("task_management_enabled", taskManagementEnabled),
                  overtime: fitsIndustry("overtime_tracking_enabled", overtimeTrackingEnabled),
              };
              const card = {
                  chat: (
                <FeatureCard icon={MessageSquare} title="Mesajlar"
                  description="Ekip üyeleri ve sorumlular uygulama içinden mesajlaşır."
                  on={chatEnabled} onToggle={() => setChatEnabled(v => !v)} />
                  ),
                  openShifts: (
                <FeatureCard icon={Megaphone} title="Açık Vardiyalar"
                  description="Boşalan vardiyayı ekibe duyurursunuz, isteyen biri alır. Geç kalan kişinin vardiyası da buraya eklenebilir."
                  on={openShiftsEnabled} onToggle={() => setOpenShiftsEnabled(v => !v)} />
                  ),
                  // Devir-teslim TEK özellik: eski "Vardiya Devri Notu" (handover_notes_enabled) ile onaylı defter (handover_log_enabled) birleşti
                  handover: (
                <FeatureCard icon={BookOpen} title="Devir-Teslim Notu"
                  description="Vardiyadan çıkan kişi sonraki vardiyaya not bırakır. Sonraki vardiyadakiler bu notu okur."
                  on={handoverNotesEnabled || handoverLogEnabled}
                  onToggle={() => {
                    if (handoverNotesEnabled || handoverLogEnabled) { setHandoverNotesEnabled(false); setHandoverLogEnabled(false); }
                    else setHandoverNotesEnabled(true);
                  }}>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={handoverLogEnabled}
                      onChange={e => { setHandoverLogEnabled(e.target.checked); if (!e.target.checked) setHandoverNotesEnabled(true); }}
                      className="mt-0.5 w-4 h-4 rounded accent-forest-600" />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Notu okumadan vardiyaya giriş yapılamasın</span>
                      <span className="block text-xs text-slate-500 mt-0.5">Okundu bilgisi kaydedilir, notlar Devir-Teslim sayfasında saklanır. Hastane, fabrika, güvenlik gibi işlerde önerilir.</span>
                    </span>
                  </label>
                </FeatureCard>
                  ),
                  conflicts: (
                <FeatureCard icon={UserX} title="Birlikte Çalışamaz"
                  description="Seçtiğiniz iki kişi hiçbir gün aynı vardiyaya yazılmaz."
                  on={personnelConflictsEnabled} onToggle={() => setPersonnelConflictsEnabled(v => !v)}>
                  {/* Çiftler kişinin kartında tanımlanır (PersonSheet "Birlikte çalışamaz"); burada sadece aç/kapat ve özet */}
                  <p className="text-sm text-slate-600">
                    Çiftleri kişinin kartında (Ekip) &quot;Birlikte çalışamaz&quot; bölümünden ekleyin.
                    {conflictPairs.length > 0 ? ` Şu an ${conflictPairs.length} çift tanımlı.` : " Henüz tanımlı çift yok."}
                  </p>
                </FeatureCard>
                  ),
                  fatigue: (
                <FeatureCard icon={AlertTriangle} title="Yorgunluk Uyarısı"
                  description="Üst üste gece çalışan, kapanıştan sonra açılışa yazılan ya da çok fazla mesai yapan kişiler için Ana Sayfa'da ve planda uyarı gösterir."
                  on={fatigueRadarEnabled} onToggle={() => setFatigueRadarEnabled(v => !v)} />
                  ),
                  compliance: (
                <FeatureCard icon={FileCheck} title="Belge ve Sertifika Takibi"
                  description="Süresi dolmuş zorunlu belgesi olan kişi otomatik plana alınmaz."
                  on={complianceTrackingEnabled} onToggle={() => setComplianceTrackingEnabled(v => !v)} />
                  ),
                  forecast: (
                <FeatureCard icon={TrendingUp} title="Satış ve Yoğunluk Tahmini"
                  description="İhtiyaç tablosunda geçmiş haftalara dayalı öneri gösterir. Günlük ciroyu girerseniz tahmin iyileşir."
                  on={forecastingEnabled} onToggle={() => setForecastingEnabled(v => !v)}>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="date" value={newSalesDate} onChange={e => setNewSalesDate(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:border-forest-400 focus:bg-white"
                        />
                        <input
                          type="number" min="0" step="0.01" value={newSalesRevenue} onChange={e => setNewSalesRevenue(e.target.value)}
                          placeholder="Günlük ciro (₺)"
                          className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:border-forest-400 focus:bg-white"
                        />
                        <button type="button" onClick={handleAddSalesData} disabled={!newSalesDate || !newSalesRevenue} className="shrink-0 px-3 py-2 bg-forest-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl hover:bg-forest-700">Ekle</button>
                      </div>
                      {salesDataError && <p className="text-xs text-red-600">{salesDataError}</p>}
                      {salesData.length > 0 && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {salesData.slice(0, 14).map(s => (
                            <div key={s.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs bg-slate-50 border border-slate-200">
                              <span className="flex-1 font-semibold text-slate-700">{formatDateTR(s.date)}</span>
                              <span className="text-slate-500">{s.revenue != null ? `₺${trNum(s.revenue, 0)}` : s.footfall != null ? `${trNum(s.footfall, 0)} kişi` : ""}</span>
                              <button onClick={() => handleDeleteSalesData(s.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                </FeatureCard>
                  ),
                  tasks: (
                <FeatureCard icon={ListChecks} title="Görev ve Kontrol Listeleri"
                  description="Her vardiyaya görev listesi eklenir. Ekip yaptığı görevleri uygulamada işaretler."
                  on={taskManagementEnabled} onToggle={() => setTaskManagementEnabled(v => !v)}>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Tüm Vardiyalar İçin Ortak Görevler</label>
                        <textarea
                          rows={3}
                          placeholder={"Her satıra bir görev, örn:\nKasa Sayımı\nMutfak Temizliği"}
                          value={(taskTemplates["*"] ?? []).join("\n")}
                          onChange={e => setTaskTemplates(prev => ({ ...prev, "*": e.target.value.split("\n") }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400 focus:bg-white resize-none"
                        />
                      </div>
                      {(locationData?.shift_definitions ?? []).map((sd: ShiftDefinition) => (
                        <div key={sd.id}>
                          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">{sd.name} Vardiyasına Özel Görevler</label>
                          <textarea
                            rows={2}
                            placeholder="Her satıra bir görev"
                            value={(taskTemplates[sd.id] ?? []).join("\n")}
                            onChange={e => setTaskTemplates(prev => ({ ...prev, [sd.id]: e.target.value.split("\n") }))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-forest-400 focus:bg-white resize-none"
                          />
                        </div>
                      ))}
                    </div>
                </FeatureCard>
                  ),
                  overtime: (
                <FeatureCard icon={Timer} title="Fazla Mesai Takibi"
                  description="Yayınlanan plandaki fazla mesai kaydedilir ve onayınıza gelir. Yıllık fazla mesai sınırı da takip edilir."
                  on={overtimeTrackingEnabled} onToggle={() => setOvertimeTrackingEnabled(v => !v)} />
                  ),
              };
              type CardId = keyof typeof fits;
              const GROUPS: { title: string; ids: CardId[] }[] = [
                { title: "Ekip ve İletişim", ids: ["chat", "openShifts", "handover", "tasks"] },
                { title: "Planlama ve Güvenlik", ids: ["conflicts", "fatigue", "compliance", "forecast"] },
                { title: "Mesai", ids: ["overtime"] },
              ];
              const others = GROUPS.flatMap(g => g.ids).filter(id => !fits[id]);
              return (
                <div className="space-y-6">
                  <p className="text-sm text-slate-500">
                    İhtiyacınız olan özelliği açın. Kapalı özellik hiçbir ekranda görünmez.
                  </p>
                  {isCatLocked("features") && <LockNote />}
                  {GROUPS.filter(g => g.ids.some(id => fits[id])).map(g => (
                    <FeatureGroup key={g.title} title={g.title}>
                      {g.ids.filter(id => fits[id]).map(id => <Fragment key={id}>{card[id]}</Fragment>)}
                    </FeatureGroup>
                  ))}
                  {others.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-500 hover:text-slate-800">
                        {savedIndustry!.label} işletmelerinde genelde kullanılmayanlar ({others.length})
                      </summary>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        {others.map(id => <Fragment key={id}>{card[id]}</Fragment>)}
                      </div>
                    </details>
                  )}
                </div>
              );
            })()
          )}

          {/* ─── HESABIM ─── */}
          {activeTab === "account" && (
            <BranchAccountTab viewerRole={viewerRole} />
          )}

      </div>

      {/* Kayıt geri bildirimi */}
      {toast && (
        <div className="sticky bottom-40 lg:bottom-20 z-30 flex justify-center pointer-events-none">
          <div className={`rounded-xl shadow-lg px-5 py-2.5 text-sm font-medium text-white ${toast.type === "ok" ? "bg-emerald-600" : "bg-red-600"}`}>
            {toast.text}
          </div>
        </div>
      )}

      {/* Yapışkan kayıt barı — hangi sekmede olunursa olunsun tüm değişiklikler birlikte kaydedilir */}
      {isDirty && (
        <div className="sticky bottom-24 lg:bottom-4 z-30">
          <div className="flex items-center justify-between gap-4 bg-slate-900 text-white rounded-2xl shadow-xl px-5 py-3">
            <span className="text-sm font-medium">Kaydedilmemiş değişiklikler var</span>
            <div className="flex items-center gap-2">
              <button
                onClick={discardChanges}
                className="text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleSave}
                disabled={savingAll}
                className="flex items-center gap-2 bg-forest-500 hover:bg-forest-400 disabled:opacity-60 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
              >
                <Save size={14} /> {savingAll ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
    </SettingsLockCtx.Provider>
  );
}

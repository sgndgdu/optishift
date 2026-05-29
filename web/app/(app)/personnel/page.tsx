"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus, X, Search, ChevronRight, Award, Info, AlertCircle,
} from "lucide-react";
import { PERSONNEL as INITIAL_PERSONNEL } from "@/lib/mock-data";
import type {
  Personnel, Availability, PersonnelStatus,
  EmploymentType, SkillLevel, PreferredShift,
  LeaveRecord, LeaveType,
} from "@/lib/types";
import { DAYS, AVAILABILITY_LABELS, PREDEFINED_ZONES } from "@/lib/types";

// ── Display maps ─────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, { chip: string; dot: string }> = {
  Kasa:   { chip: "bg-indigo-100 text-indigo-700",  dot: "bg-indigo-400"  },
  Reyon:  { chip: "bg-green-100 text-green-700",    dot: "bg-green-400"   },
  Teras:  { chip: "bg-orange-100 text-orange-700",  dot: "bg-orange-400"  },
  Mutfak: { chip: "bg-pink-100 text-pink-700",      dot: "bg-pink-400"    },
};
const ZONE_DEFAULT = { chip: "bg-slate-100 text-slate-700", dot: "bg-slate-400" };

const STATUS_CFG: Record<PersonnelStatus, { label: string; cls: string }> = {
  active:   { label: "Aktif",  cls: "bg-green-100 text-green-700"   },
  on_leave: { label: "İzinde", cls: "bg-yellow-100 text-yellow-700" },
  inactive: { label: "Pasif",  cls: "bg-slate-100 text-slate-500"   },
};

const EMP_LABELS: Record<EmploymentType, string> = {
  full_time: "Tam Zamanlı",
  part_time: "Yarı Zamanlı",
  intern:    "Stajyer",
};

const AVAIL_CYCLE: Availability[] = ["available", "preferred_not", "unavailable"];
const AVAIL_CELL: Record<Availability, { bg: string; icon: string }> = {
  available:     { bg: "bg-green-500 hover:bg-green-600",   icon: "✓" },
  preferred_not: { bg: "bg-yellow-400 hover:bg-yellow-500", icon: "~" },
  unavailable:   { bg: "bg-red-500 hover:bg-red-600",       icon: "✕" },
};

const AVAIL_SHORT: Record<Availability, string> = {
  available:     "Müsait",
  preferred_not: "Tercihen",
  unavailable:   "İzinli",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function nextId(list: Personnel[]) {
  const nums = list.map(p => parseInt(p.id.replace("P", ""), 10));
  return `P${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}

function cycleAvail(a: Availability): Availability {
  return AVAIL_CYCLE[(AVAIL_CYCLE.indexOf(a) + 1) % AVAIL_CYCLE.length];
}

function calcLeaveEntitlement(hireDateStr: string): number {
  if (!hireDateStr) return 14;
  const years = (Date.now() - new Date(hireDateStr).getTime()) / (365.25 * 86400 * 1000);
  if (years < 1) return 0;
  if (years < 5) return 14;
  if (years < 15) return 20;
  return 26;
}

function tenureStr(hireDateStr: string): string {
  if (!hireDateStr) return "";
  const ms = Date.now() - new Date(hireDateStr).getTime();
  const years = Math.floor(ms / (365.25 * 86400 * 1000));
  const months = Math.floor((ms % (365.25 * 86400 * 1000)) / (30.44 * 86400 * 1000));
  if (years === 0) return `${months} ay`;
  return months > 0 ? `${years} yıl ${months} ay` : `${years} yıl`;
}

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
}

const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: "Yıllık İzin",
  sick:   "Hastalık İzni",
  excuse: "Mazeret İzni",
};
const LEAVE_COLORS: Record<LeaveType, string> = {
  annual: "bg-indigo-100 text-indigo-700",
  sick:   "bg-red-100 text-red-600",
  excuse: "bg-yellow-100 text-yellow-700",
};

type Tab = "general" | "skills" | "availability" | "leave" | "performance";

// ── Component ─────────────────────────────────────────────────────────────────

export default function PersonnelPage() {
  const [personnel, setPersonnel] = useState<Personnel[]>(INITIAL_PERSONNEL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PersonnelStatus | "all">("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [skillDropOpen, setSkillDropOpen] = useState(false);
  const [customSkill, setCustomSkill] = useState("");
  const skillRef = useRef<HTMLDivElement>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState<{ type: LeaveType; start_date: string; end_date: string; note: string }>({
    type: "annual", start_date: "", end_date: "", note: "",
  });
  const [requestSentFor, setRequestSentFor] = useState<string | null>(null);
  const [generalDraft, setGeneralDraft] = useState<Partial<Personnel> | null>(null);

  const [newForm, setNewForm] = useState({
    name: "", title: "", phone: "", email: "",
    employment_type: "full_time" as EmploymentType,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (skillRef.current && !skillRef.current.contains(e.target as Node)) {
        setSkillDropOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => { setGeneralDraft(null); }, [selectedId]);

  const selected = personnel.find(p => p.id === selectedId) ?? null;

  const filtered = personnel.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) &&
        !p.title.toLowerCase().includes(q) &&
        !p.employee_id.includes(q)) return false;
    return true;
  });

  function patch(id: string, updates: Partial<Personnel>) {
    setPersonnel(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }

  function openDrawer(id: string) {
    setSelectedId(id);
    setActiveTab("general");
    setSkillDropOpen(false);
  }

  function closeDrawer() { setSelectedId(null); }

  // Çalışma alanları
  function addZone(zone: string) {
    if (!selected || selected.skills.includes(zone)) return;
    patch(selected.id, {
      skills: [...selected.skills, zone],
      skill_levels: { ...selected.skill_levels, [zone]: "secondary" as SkillLevel },
    });
    setSkillDropOpen(false);
    setCustomSkill("");
  }

  function removeZone(zone: string) {
    if (!selected) return;
    const lvls = { ...selected.skill_levels };
    delete lvls[zone];
    patch(selected.id, { skills: selected.skills.filter(s => s !== zone), skill_levels: lvls });
  }

  // Add modal
  function handleAdd() {
    if (!newForm.name.trim()) return;
    const id = nextId(personnel);
    const p: Personnel = {
      id, name: newForm.name.trim(),
      employee_id: String(100000 + parseInt(id.replace("P", ""), 10)),
      phone: newForm.phone, email: newForm.email,
      hire_date: new Date().toISOString().slice(0, 10),
      contract_end_date: "",
      title: newForm.title || "Çalışan",
      employment_type: newForm.employment_type,
      status: "active", erp_id: "", notes: "",
      skills: [], skill_levels: {},
      availability: { 0: "available", 1: "available", 2: "available", 3: "available", 4: "available", 5: "available", 6: "available" },
      preferred_shift: "any", max_weekly_hours: 45,
      overtime_approved: false, prev_score: 0, hero_count: 0,
      no_show_count: 0, late_count: 0,
      annual_leave_days_total: 0, leave_records: [],
    };
    setPersonnel(prev => [...prev, p]);
    setNewForm({ name: "", title: "", phone: "", email: "", employment_type: "full_time" });
    setIsAddOpen(false);
    openDrawer(id);
  }

  const TITLE_SUGGESTIONS = ["Kasiyer", "Kasa Sorumlusu", "Barista", "Garson", "Reyon Görevlisi", "Mutfak Görevlisi", "Teras Görevlisi", "Mağaza Şefi", "Stajyer"];
  const TABS: { id: Tab; label: string }[] = [
    { id: "general",      label: "Genel" },
    { id: "skills",       label: "Yetenekler" },
    { id: "availability", label: "Müsaitlik" },
    { id: "leave",        label: "İzin" },
    { id: "performance",  label: "Performans" },
  ];
  const freeZones = selected ? PREDEFINED_ZONES.filter(z => !selected.skills.includes(z)) : [];
  const teamAvg = Math.round(personnel.reduce((a, p) => a + p.prev_score, 0) / (personnel.length || 1));

  const gen = selected ? (generalDraft ? { ...selected, ...generalDraft } : selected) : null;
  const isDirty = generalDraft !== null && Object.keys(generalDraft).length > 0;
  function updateDraft(updates: Partial<Personnel>) {
    setGeneralDraft(prev => ({ ...(prev ?? {}), ...updates }));
  }
  function saveGeneral() {
    if (!generalDraft || !selected) return;
    patch(selected.id, generalDraft);
    setGeneralDraft(null);
  }

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Personel</h1>
          <p className="text-slate-500 text-sm mt-0.5">{personnel.length} çalışan kayıtlı</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Personel Ekle
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="İsim, ünvan veya sicil no..."
            className="field-input pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "on_leave", "inactive"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s === "all" ? "Tümü" : STATUS_CFG[s as PersonnelStatus].label}
              {s !== "all" && (
                <span className="ml-1 opacity-60">({personnel.filter(p => p.status === s).length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">Arama kriterlerine uyan personel bulunamadı.</div>
        )}
        {filtered.map(p => {
          const sc = STATUS_CFG[p.status];
          const isSelected = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => isSelected ? closeDrawer() : openDrawer(p.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left ${
                isSelected ? "bg-indigo-50 border-indigo-200 shadow-sm" : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${
                p.status === "inactive" ? "bg-slate-400" : "bg-indigo-600"
              }`}>
                {initials(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.cls}`}>{sc.label}</span>
                  {p.employment_type !== "full_time" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{EMP_LABELS[p.employment_type]}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{p.title} · Sicil: {p.employee_id}</div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {p.skills.map(s => {
                    const c = ZONE_COLORS[s] ?? ZONE_DEFAULT;
                    const isPrimary = p.skill_levels[s] === "primary";
                    return (
                      <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.chip}`}>
                        #{s}{isPrimary && <span className="ml-0.5 opacity-50">●</span>}
                      </span>
                    );
                  })}
                  {p.skills.length === 0 && <span className="text-xs text-slate-400 italic">Yetenek atanmamış</span>}
                </div>
              </div>
              <div className="text-right shrink-0 mr-1">
                <div className="text-lg font-bold text-indigo-600">{p.prev_score}p</div>
                <div className="text-xs text-slate-400">Adil Puan</div>
                {p.hero_count > 0 && (
                  <div className="text-xs text-yellow-600 mt-0.5">★ {p.hero_count}×</div>
                )}
                {(() => {
                  const ent = p.annual_leave_days_total || calcLeaveEntitlement(p.hire_date);
                  const used = p.leave_records.filter(r => r.type === "annual").reduce((s, r) => s + r.days, 0);
                  const rem = ent - used;
                  if (rem <= 0) return <div className="text-[10px] text-red-500 mt-0.5">İzin tükendi</div>;
                  if (rem <= 3) return <div className="text-[10px] text-orange-500 mt-0.5">{rem}g izin kaldı</div>;
                  return null;
                })()}
              </div>
              <ChevronRight size={16} className={`text-slate-300 shrink-0 transition-transform ${isSelected ? "rotate-90" : ""}`} />
            </button>
          );
        })}
      </div>

      {/* ── DRAWER BACKDROP ───────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={closeDrawer} />
      )}

      {/* ── DRAWER PANEL ──────────────────────────────────────────────────── */}
      <div className={`fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
        selected ? "translate-x-0" : "translate-x-full"
      }`}>
        {selected && <>
          {/* Drawer header */}
          <div className="px-6 pt-6 pb-0 border-b border-slate-100 shrink-0">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${
                  selected.status === "inactive" ? "bg-slate-400" : "bg-indigo-600"
                }`}>
                  {initials(selected.name)}
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-lg leading-tight">{selected.name}</div>
                  <div className="text-slate-500 text-sm">{selected.title}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selected.status}
                  onChange={e => patch(selected.id, { status: e.target.value as PersonnelStatus })}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer outline-none ${STATUS_CFG[selected.status].cls}`}
                >
                  <option value="active">Aktif</option>
                  <option value="on_leave">İzinde</option>
                  <option value="inactive">Pasif</option>
                </select>
                <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 pb-0">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 ${
                    activeTab === t.id
                      ? "text-indigo-600 border-indigo-600 bg-indigo-50/50"
                      : "text-slate-500 border-transparent hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 pb-2">

            {/* ── GENEL BİLGİLER ──────────────────────────────────────── */}
            {activeTab === "general" && gen && (
              <div className="space-y-4">

                {/* Kimlik & İletişim */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  <div className="px-5 py-2.5 bg-slate-50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kimlik & İletişim</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-slate-100">
                    <div className="px-4 py-3.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Sicil No</div>
                      <input value={gen.employee_id} onChange={e => updateDraft({ employee_id: e.target.value })}
                        className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300" />
                    </div>
                    <div className="px-4 py-3.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">ERP ID</div>
                      <input value={gen.erp_id} onChange={e => updateDraft({ erp_id: e.target.value })}
                        className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300" placeholder="—" />
                    </div>
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Telefon</div>
                    <input value={gen.phone} onChange={e => updateDraft({ phone: e.target.value })}
                      className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300" placeholder="+90 5xx xxx xx xx" />
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">E-posta</div>
                    <input value={gen.email} onChange={e => updateDraft({ email: e.target.value })}
                      className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300" placeholder="ad@sirket.com" />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-slate-100">
                    <div className="px-4 py-3.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">İşe Giriş</div>
                      <input type="date" value={gen.hire_date} onChange={e => updateDraft({ hire_date: e.target.value })}
                        className="w-full text-sm text-slate-800 bg-transparent outline-none" />
                    </div>
                    <div className="px-4 py-3.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Sözleşme Bitiş</div>
                      <input type="date" value={gen.contract_end_date} onChange={e => updateDraft({ contract_end_date: e.target.value })}
                        className="w-full text-sm text-slate-800 bg-transparent outline-none" />
                    </div>
                  </div>
                </div>

                {/* Pozisyon */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  <div className="px-5 py-2.5 bg-slate-50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pozisyon</span>
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Ünvan</div>
                    <input value={gen.title} onChange={e => updateDraft({ title: e.target.value })}
                      className="w-full text-sm text-slate-800 bg-transparent outline-none placeholder-slate-300"
                      list="drawer-title-list" placeholder="Kasiyer, Barista, Garson…" />
                    <datalist id="drawer-title-list">
                      {TITLE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Çalışma Türü</div>
                    <div className="flex gap-2">
                      {(["full_time", "part_time", "intern"] as EmploymentType[]).map(t => (
                        <button key={t}
                          onClick={() => updateDraft({ employment_type: t })}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            gen.employment_type === t
                              ? "bg-slate-800 text-white border-slate-800"
                              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                          }`}
                        >{EMP_LABELS[t]}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Vardiya Tercihleri */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  <div className="px-5 py-2.5 bg-slate-50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vardiya Tercihleri</span>
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Tercih Edilen Vardiya</div>
                    <div className="flex gap-2">
                      {([["morning", "Sabah (08-16)"], ["evening", "Akşam (16-24)"], ["any", "Fark Etmez"]] as [PreferredShift, string][]).map(([v, label]) => (
                        <button key={v}
                          onClick={() => updateDraft({ preferred_shift: v })}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            gen.preferred_shift === v
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                          }`}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Max Haftalık Saat</div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateDraft({ max_weekly_hours: Math.max(8, gen.max_weekly_hours - 1) })}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-base transition-colors">−</button>
                      <span className="text-base font-bold text-slate-800 w-8 text-center">{gen.max_weekly_hours}</span>
                      <button onClick={() => updateDraft({ max_weekly_hours: Math.min(60, gen.max_weekly_hours + 1) })}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-base transition-colors">+</button>
                      <span className="text-xs text-slate-400">saat / hafta</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <div className="text-sm font-medium text-slate-700">Fazla Mesai Onayı</div>
                      <div className="text-xs text-slate-400 mt-0.5">Motor bu personeli OT'ye yazabilir</div>
                    </div>
                    <button
                      onClick={() => updateDraft({ overtime_approved: !gen.overtime_approved })}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${gen.overtime_approved ? "bg-indigo-600" : "bg-slate-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${gen.overtime_approved ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>

                {/* Notlar */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  <div className="px-5 py-2.5 bg-slate-50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notlar</span>
                  </div>
                  <div className="px-4 py-3.5">
                    <textarea value={gen.notes} onChange={e => updateDraft({ notes: e.target.value })}
                      rows={3} placeholder="Bu personel hakkında not ekle…"
                      className="w-full text-sm text-slate-800 bg-transparent outline-none resize-none placeholder-slate-300" />
                  </div>
                </div>

                {/* Tehlike bölgesi */}
                <button
                  onClick={() => {
                    if (!confirm(`${selected.name} silinsin mi?`)) return;
                    setPersonnel(prev => prev.filter(p => p.id !== selected.id));
                    closeDrawer();
                  }}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Bu personeli sil
                </button>

              </div>
            )}

            {/* ── YETENEKLER ──────────────────────────────────────────── */}
            {activeTab === "skills" && (
              <div className="space-y-4">

                {/* ── Çalışma İstasyonları ── */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-700">Çalışma İstasyonları</div>
                      <div className="text-xs text-slate-400 mt-0.5">Hangi istasyonlara atanabileceğini belirler — shift oluştururken OR-Tools bu bilgiyi kullanır</div>
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
                          {freeZones.length > 0 ? freeZones.map(z => {
                            const c = ZONE_COLORS[z] ?? ZONE_DEFAULT;
                            return (
                              <button key={z} onClick={() => addZone(z)}
                                className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2.5 transition-colors">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                                {z}
                              </button>
                            );
                          }) : (
                            <div className="px-4 py-3 text-xs text-slate-400">Tüm bölgeler atandı.</div>
                          )}
                          <div className="border-t border-slate-100 px-3 py-2.5">
                            <div className="text-xs text-slate-400 mb-1.5">Özel alan:</div>
                            <div className="flex gap-1.5">
                              <input value={customSkill}
                                onChange={e => setCustomSkill(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && customSkill.trim() && addZone(customSkill.trim())}
                                placeholder="Örn: Bar, Resepsiyon…"
                                className="field-input text-xs py-1" />
                              <button onClick={() => customSkill.trim() && addZone(customSkill.trim())}
                                className="px-2 bg-indigo-600 text-white text-xs rounded-lg shrink-0">+</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {selected.skills.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      Henüz alan atanmamış.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {selected.skills.map(zone => {
                        const level: SkillLevel = selected.skill_levels[zone] ?? "secondary";
                        const c = ZONE_COLORS[zone] ?? ZONE_DEFAULT;
                        return (
                          <div key={zone} className="flex items-center gap-3 px-4 py-3.5">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${c.chip}`}>{zone}</span>
                            <div className="flex-1" />
                            <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0 text-xs font-medium">
                              <button
                                onClick={() => patch(selected.id, { skill_levels: { ...selected.skill_levels, [zone]: "primary" } })}
                                className={`px-3 py-1.5 transition-colors ${level === "primary" ? "bg-indigo-600 text-white" : "bg-white text-slate-400 hover:text-slate-600"}`}
                              >Ana Alan</button>
                              <button
                                onClick={() => patch(selected.id, { skill_levels: { ...selected.skill_levels, [zone]: "secondary" } })}
                                className={`px-3 py-1.5 border-l border-slate-200 transition-colors ${level === "secondary" ? "bg-slate-600 text-white" : "bg-white text-slate-400 hover:text-slate-600"}`}
                              >Yardımcı</button>
                            </div>
                            <button onClick={() => removeZone(zone)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors shrink-0">
                              <X size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* İstasyon açıklaması */}
                  <div className="border-t border-slate-100 px-5 py-3 flex gap-2 bg-slate-50">
                    <Info size={12} className="text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-400 leading-relaxed">
                      <span className="font-medium text-slate-500">Ana</span> — bu istasyona birincil atanır, kota hesabında önceliklidir.{" "}
                      <span className="font-medium text-slate-500">Yardımcı</span> — ihtiyaç halinde atanabilir; uyumsuzlukta uyarı verilir, müdür ezebilir.
                    </p>
                  </div>
                </div>

                {/* ── Takım İstasyon Kapsamı ── */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <div className="text-sm font-semibold text-slate-700">Takım İstasyon Kapsamı</div>
                    <div className="text-xs text-slate-400 mt-0.5">İstasyon başına kaç kişi atanabilir</div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {PREDEFINED_ZONES.map(zone => {
                      const total = personnel.filter(p => p.skills.includes(zone)).length;
                      const primaryCount = personnel.filter(p => p.skills.includes(zone) && p.skill_levels[zone] === "primary").length;
                      const c = ZONE_COLORS[zone] ?? ZONE_DEFAULT;
                      const thisHas = selected.skills.includes(zone);
                      return (
                        <div key={zone} className={`flex items-center gap-3 px-5 py-3.5 ${!thisHas ? "opacity-30" : ""}`}>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${c.chip}`}>{zone}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${c.dot}`}
                              style={{ width: `${(total / personnel.length) * 100}%` }} />
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
            )}

            {/* ── MÜSAİTLİK ───────────────────────────────────────────── */}
            {activeTab === "availability" && (() => {
              const isSent = requestSentFor === selected.id;
              const avail = selected.availability;
              const counts = {
                available:     Object.values(avail).filter(v => v === "available").length,
                preferred_not: Object.values(avail).filter(v => v === "preferred_not").length,
                unavailable:   Object.values(avail).filter(v => v === "unavailable").length,
              };

              return (
                <div className="space-y-5">

                  {/* Müsaitlik isteği CTA */}
                  <div className="rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <Info size={16} className="text-indigo-500" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-700">Müsaitlik İsteği</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {selected.name} uygulamada bildirim alır — "Haftalık müsaitlik talebi geldi" — ve kendi gireceği ekrandan doldurur.
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
                      <p className="text-xs text-slate-400 text-center mt-2">
                        Gönderi tarihi: Bugün
                      </p>
                    )}
                  </div>

                  {/* Mevcut müsaitlik — read only */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mevcut Durum</p>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Çalışan tarafından doldurulur</span>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {DAYS.map((day, d) => {
                        const status: Availability = avail[d] ?? "available";
                        const cell = AVAIL_CELL[status];
                        return (
                          <div key={day} className="text-center">
                            <div className="text-xs text-slate-400 mb-1.5 font-medium">{day.slice(0, 3)}</div>
                            <div className={`w-full aspect-square rounded-xl ${cell.bg.split(" ")[0]} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
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

                  {/* Özet */}
                  <div className="grid grid-cols-3 gap-3">
                    {(["available", "preferred_not", "unavailable"] as const).map(s => {
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

                  {/* OR-Tools notu */}
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
            })()}

            {/* ── İZİN YÖNETİMİ ───────────────────────────────────────── */}
            {activeTab === "leave" && (() => {
              const entitlement = selected.annual_leave_days_total || calcLeaveEntitlement(selected.hire_date);
              const annualUsed = selected.leave_records
                .filter(r => r.type === "annual")
                .reduce((s, r) => s + r.days, 0);
              const remaining = Math.max(0, entitlement - annualUsed);
              const pct = entitlement > 0 ? Math.min(100, Math.round((annualUsed / entitlement) * 100)) : 0;
              const isExhausted = remaining === 0 && entitlement > 0;
              const isLow = remaining > 0 && remaining <= 3;

              function addLeave() {
                if (!leaveForm.start_date || !leaveForm.end_date) return;
                // iş günü sayısı
                let days = 0;
                const cur = new Date(leaveForm.start_date);
                const end = new Date(leaveForm.end_date);
                while (cur <= end) { if (cur.getDay() !== 0 && cur.getDay() !== 6) days++; cur.setDate(cur.getDate() + 1); }
                if (days <= 0) return;
                const newRec: LeaveRecord = {
                  id: `L${Date.now()}`,
                  type: leaveForm.type,
                  start_date: leaveForm.start_date,
                  end_date: leaveForm.end_date,
                  days,
                  note: leaveForm.note,
                };
                patch(selected!.id, { leave_records: [...selected!.leave_records, newRec] });
                setLeaveForm({ type: "annual", start_date: "", end_date: "", note: "" });
                setShowLeaveForm(false);
              }

              function deleteLeave(id: string) {
                patch(selected!.id, { leave_records: selected!.leave_records.filter(r => r.id !== id) });
              }

              return (
                <div className="space-y-4">

                  {/* Bakiye kartı */}
                  <div className="rounded-2xl bg-slate-800 p-5 text-white">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-xs text-slate-400 mb-0.5">Yıllık İzin Bakiyesi</div>
                        <div className="text-xs text-slate-400">Kıdem: {tenureStr(selected.hire_date)} — {entitlement} iş günü hak</div>
                      </div>
                      <div className={`text-4xl font-bold ${isExhausted ? "text-red-400" : isLow ? "text-orange-300" : "text-emerald-400"}`}>
                        {remaining}
                        <span className="text-base font-normal text-slate-400 ml-1">gün</span>
                      </div>
                    </div>
                    <div className="bg-slate-700 rounded-full h-1.5 mb-3">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isExhausted ? "bg-red-400" : isLow ? "bg-orange-400" : "bg-emerald-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 text-center">
                      <div>
                        <div className="text-lg font-semibold">{entitlement}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Toplam Hak</div>
                      </div>
                      <div className="border-x border-slate-700">
                        <div className="text-lg font-semibold text-amber-300">{annualUsed}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Kullanılan</div>
                      </div>
                      <div>
                        <div className={`text-lg font-semibold ${isExhausted ? "text-red-400" : isLow ? "text-orange-300" : "text-emerald-400"}`}>{remaining}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Kalan</div>
                      </div>
                    </div>
                    {isExhausted && <div className="mt-3 text-xs text-red-300 text-center">Yıllık izin hakkı tükendi.</div>}
                    {isLow && <div className="mt-3 text-xs text-orange-300 text-center">Sadece {remaining} gün kaldı.</div>}
                  </div>

                  {/* İzin geçmişi */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">İzin Geçmişi</p>
                      <button
                        onClick={() => { setShowLeaveForm(v => !v); }}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        <Plus size={13} /> İzin Ekle
                      </button>
                    </div>

                    {/* İzin ekleme formu */}
                    {showLeaveForm && (
                      <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
                        <div className="flex gap-2">
                          {(["annual", "sick", "excuse"] as LeaveType[]).map(t => (
                            <button
                              key={t}
                              onClick={() => setLeaveForm(f => ({ ...f, type: t }))}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                leaveForm.type === t ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                              }`}
                            >
                              {LEAVE_LABELS[t].replace(" İzni", "")}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="field-label">Başlangıç</label>
                            <input type="date" value={leaveForm.start_date}
                              onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))}
                              className="field-input" />
                          </div>
                          <div>
                            <label className="field-label">Bitiş</label>
                            <input type="date" value={leaveForm.end_date}
                              min={leaveForm.start_date}
                              onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))}
                              className="field-input" />
                          </div>
                        </div>
                        <div>
                          <label className="field-label">Not (isteğe bağlı)</label>
                          <input value={leaveForm.note}
                            onChange={e => setLeaveForm(f => ({ ...f, note: e.target.value }))}
                            className="field-input" placeholder="Açıklama..." />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowLeaveForm(false)}
                            className="flex-1 py-2 text-xs border border-slate-200 rounded-lg hover:bg-white text-slate-600">
                            İptal
                          </button>
                          <button
                            onClick={addLeave}
                            disabled={!leaveForm.start_date || !leaveForm.end_date}
                            className="flex-1 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg font-medium">
                            Kaydet
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Kayıt listesi */}
                    {selected.leave_records.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                        Kayıtlı izin yok.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {[...selected.leave_records]
                          .sort((a, b) => b.start_date.localeCompare(a.start_date))
                          .map(rec => (
                          <div key={rec.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-100">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${LEAVE_COLORS[rec.type]}`}>
                              {LEAVE_LABELS[rec.type]}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-slate-700">
                                {formatDate(rec.start_date)}
                                {rec.start_date !== rec.end_date && <> — {formatDate(rec.end_date)}</>}
                              </div>
                              {rec.note && <div className="text-xs text-slate-400 truncate">{rec.note}</div>}
                            </div>
                            <div className="text-sm font-semibold text-slate-600 shrink-0">{rec.days}g</div>
                            <button onClick={() => deleteLeave(rec.id)}
                              className="p-1 rounded-lg hover:bg-red-100 text-slate-300 hover:text-red-400 transition-colors shrink-0">
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              );
            })()}

            {/* ── PERFORMANS ──────────────────────────────────────────── */}
            {activeTab === "performance" && (() => {
              const sorted = [...personnel].sort((a, b) => b.prev_score - a.prev_score);
              const rank = sorted.findIndex(p => p.id === selected.id) + 1;
              const maxScore = sorted[0]?.prev_score ?? 1;
              const diff = selected.prev_score - teamAvg;
              const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
              const diffColor = diff > 0 ? "text-orange-500" : diff < 0 ? "text-emerald-600" : "text-slate-400";
              const diffNote = diff > 0
                ? "Motor önümüzdeki dönem bu kişiye daha az ağır vardiya verecek"
                : diff < 0
                ? "Motor bu kişiye öncelik tanıyacak, puan dengelenecek"
                : "Takımla tam dengeli";

              const AVATAR_COLORS = ["bg-indigo-500","bg-violet-500","bg-sky-500","bg-emerald-500","bg-amber-500","bg-rose-500"];

              return (
                <div className="space-y-4">

                  {/* Puan kartı */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div>
                        <div className="text-4xl font-bold text-slate-800 leading-none">{selected.prev_score}</div>
                        <div className="text-xs text-slate-400 mt-1">Kümülatif Adil Puan</div>
                      </div>
                      <div className="flex-1" />
                      <div className="text-right">
                        <div className={`text-lg font-bold ${diffColor}`}>{diffLabel}p</div>
                        <div className="text-xs text-slate-400">takım ort. {teamAvg}p</div>
                      </div>
                    </div>
                    <div className="px-5 pb-1">
                      <div className="bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${maxScore > 0 ? (selected.prev_score / maxScore) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 mt-3">
                      <span className="text-xs text-slate-500">{diffNote}</span>
                      <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{rank}/{personnel.length}. sıra</span>
                    </div>
                  </div>

                  {/* Güvenilirlik */}
                  <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                    <div className="px-5 py-3 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Güvenilirlik</span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Yoklama modülünden otomatik</span>
                    </div>
                    {[
                      { label: "Gelmeme (No-Show)", value: selected.no_show_count, warnAt: 2 },
                      { label: "Geç Gelme",         value: selected.late_count,    warnAt: 4 },
                    ].map(row => {
                      const isWarn = row.value >= row.warnAt;
                      const countColor = row.value === 0 ? "text-slate-400" : isWarn ? "text-red-500" : "text-orange-500";
                      return (
                        <div key={row.label} className="flex items-center gap-4 px-5 py-3.5">
                          <span className="flex-1 text-sm text-slate-700">{row.label}</span>
                          {isWarn && <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Dikkat</span>}
                          <span className={`text-base font-bold shrink-0 ${countColor}`}>{row.value}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Kahraman bonusu */}
                  <div className="rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                      <Award size={18} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">Kahraman Bonusu</div>
                      <div className="text-xs text-slate-400">Son dakika açık vardiyayı kabul et → ×1.5 puan</div>
                    </div>
                    <div className="shrink-0 text-right">
                      {selected.hero_count === 0
                        ? <span className="text-xs text-slate-400">Henüz yok</span>
                        : <div>
                            <div className="text-xl font-bold text-amber-500">{selected.hero_count}</div>
                            <div className="text-[10px] text-slate-400 leading-tight">kez</div>
                          </div>
                      }
                    </div>
                  </div>

                  {/* Takım sıralaması */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Takım Sıralaması</span>
                    </div>
                    <div>
                      {sorted.map((p, i) => {
                        const isThis = p.id === selected.id;
                        const barPct = maxScore > 0 ? (p.prev_score / maxScore) * 100 : 0;
                        const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
                        return (
                          <div key={p.id} className={`flex items-center gap-3 px-5 py-3 ${isThis ? "bg-indigo-50" : "border-t border-slate-50"}`}>
                            <span className={`text-xs font-semibold w-5 shrink-0 ${isThis ? "text-indigo-500" : "text-slate-300"}`}>{i + 1}</span>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${isThis ? "bg-indigo-600" : avatarColor} opacity-${isThis ? "100" : "60"}`}>
                              {initials(p.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-medium truncate ${isThis ? "text-indigo-700" : "text-slate-500"}`}>{p.name.split(" ")[0]}</span>
                                <span className={`text-xs font-bold shrink-0 ml-2 ${isThis ? "text-indigo-600" : "text-slate-500"}`}>{p.prev_score}p</span>
                              </div>
                              <div className="bg-slate-100 rounded-full h-1">
                                <div
                                  className={`h-1 rounded-full ${isThis ? "bg-indigo-500" : "bg-slate-300"}`}
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>

          {/* ── SAVE BAR ─────────────────────────────────────────────────────── */}
          {isDirty && activeTab === "general" && (
            <div className="shrink-0 border-t border-slate-200 px-6 py-4 bg-white flex gap-3 items-center">
              <span className="flex-1 text-xs text-slate-400">Kaydedilmemiş değişiklikler var</span>
              <button onClick={() => setGeneralDraft(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Vazgeç
              </button>
              <button onClick={saveGeneral}
                className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors">
                Kaydet
              </button>
            </div>
          )}
        </>}
      </div>

      {/* ── ADD MODAL ─────────────────────────────────────────────────────── */}
      {isAddOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setIsAddOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 pointer-events-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-800">Yeni Personel</h2>
                <button onClick={() => setIsAddOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <X size={18} className="text-slate-400" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="field-label">Ad Soyad *</label>
                  <input value={newForm.name}
                    onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleAdd()}
                    className="field-input" placeholder="Örn: Mehmet Kaya" autoFocus />
                </div>
                <div>
                  <label className="field-label">Ünvan</label>
                  <input value={newForm.title}
                    onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                    className="field-input" placeholder="Kasiyer, Barista..."
                    list="modal-title-list" />
                  <datalist id="modal-title-list">
                    {TITLE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Telefon</label>
                    <input value={newForm.phone}
                      onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                      className="field-input" placeholder="+90 5xx" />
                  </div>
                  <div>
                    <label className="field-label">E-posta</label>
                    <input value={newForm.email}
                      onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                      className="field-input" placeholder="ad@email.com" />
                  </div>
                </div>
                <div>
                  <label className="field-label">Çalışma Türü</label>
                  <select value={newForm.employment_type}
                    onChange={e => setNewForm(f => ({ ...f, employment_type: e.target.value as EmploymentType }))}
                    className="field-input">
                    <option value="full_time">Tam Zamanlı</option>
                    <option value="part_time">Yarı Zamanlı</option>
                    <option value="intern">Stajyer</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setIsAddOpen(false)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
                  İptal
                </button>
                <button onClick={handleAdd} disabled={!newForm.name.trim()}
                  className="flex-1 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg font-medium transition-colors">
                  Kaydet & Aç
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { Check, X, Plus, Trash2, CalendarClock, Users, Grid3x3, Sparkles } from "lucide-react";
import { SECTOR_PRESETS } from "@/lib/presets";
import type { ShiftDefinition } from "@/lib/types";

/**
 * Schedule sayfası yerinde kurulum: vardiya şablonu ve personel eksikken
 * kullanıcıyı Ayarlar'a göndermek yerine 3 adımlı bir bantla burada tamamlatır.
 * Kayıt sonrası `optishift_location_changed` event'i sayfanın mevcut yeniden
 * yükleme yolunu tetikler.
 */

interface QuickSetupProps {
  locationId: string;
  shiftDefsCount: number;
  personnelCount: number;
  demandFilled: boolean;
}

export default function QuickSetup({ locationId, shiftDefsCount, personnelCount, demandFilled }: QuickSetupProps) {
  const [modal, setModal] = useState<"shifts" | "personnel" | null>(null);

  const steps = [
    { key: "shifts",    label: "Vardiyaları tanımla",  done: shiftDefsCount > 0,  icon: CalendarClock, action: () => setModal("shifts") },
    { key: "personnel", label: "Personel ekle",         done: personnelCount > 0,  icon: Users,          action: () => setModal("personnel") },
    { key: "demand",    label: "Kaç kişi gerekli? gir", done: demandFilled,        icon: Grid3x3,        action: null }, // Kapasite Planı hemen altta
  ];
  const allDone = steps.every(s => s.done);
  if (allDone) return null;

  return (
    <>
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl px-4 py-3.5">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles size={14} className="text-indigo-500" />
          <p className="text-xs font-black text-indigo-700 uppercase tracking-wider">Hızlı Kurulum — {steps.filter(s => s.done).length}/3</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className={`flex-1 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${s.done ? "bg-white border-emerald-200" : "bg-white border-slate-200"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black ${s.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                {s.done ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-xs font-semibold flex-1 ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.label}</span>
              {!s.done && s.action && (
                <button
                  onClick={s.action}
                  className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                >
                  Başla
                </button>
              )}
              {!s.done && !s.action && (
                <span className="text-[10px] text-slate-400 shrink-0">hemen aşağıda ↓</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {modal === "shifts" && <ShiftDefModal locationId={locationId} onClose={() => setModal(null)} />}
      {modal === "personnel" && <QuickPersonnelModal locationId={locationId} onClose={() => setModal(null)} />}
    </>
  );
}

// ─── Yerinde vardiya tanımlama ────────────────────────────────────────────────

export function ShiftDefModal({ locationId, onClose }: { locationId: string; onClose: () => void }) {
  const [defs, setDefs] = useState<ShiftDefinition[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const applyPreset = (key: string) => {
    const p = SECTOR_PRESETS.find(s => s.key === key);
    if (p) setDefs(p.shiftDefs.map(d => ({ ...d })));
  };

  const updateDef = (i: number, patch: Partial<ShiftDefinition>) =>
    setDefs(prev => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const addDef = () =>
    setDefs(prev => [...prev, { id: `s${Date.now()}`, name: "Yeni Vardiya", start: "09:00", end: "17:00", base_points: 3 }]);

  const save = async () => {
    const valid = defs.filter(d => d.name.trim() && d.start && d.end);
    if (valid.length === 0) { setError("En az bir vardiya tanımlayın."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/locations?id=${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift_definitions: valid }),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(new Event("optishift_location_changed"));
      onClose();
    } catch {
      setError("Kaydedilemedi. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Vardiyaları Tanımla" subtitle="Hazır bir şablonla başlayın, saatleri işletmenize göre düzenleyin." onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {SECTOR_PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {defs.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">Yukarıdan sektörünüzü seçin veya elle vardiya ekleyin.</p>
        )}
        {defs.map((d, i) => (
          <div key={d.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <input
              value={d.name}
              onChange={e => updateDef(i, { name: e.target.value })}
              className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:border-indigo-400"
            />
            <input type="time" value={d.start} onChange={e => updateDef(i, { start: e.target.value })}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-[100px] focus:outline-none focus:border-indigo-400" />
            <span className="text-slate-300 text-xs">→</span>
            <input type="time" value={d.end} onChange={e => updateDef(i, { end: e.target.value })}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-[100px] focus:outline-none focus:border-indigo-400" />
            <button onClick={() => setDefs(prev => prev.filter((_, j) => j !== i))} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button onClick={addDef} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 py-1">
          <Plus size={13} /> Vardiya ekle
        </button>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
        <button onClick={save} disabled={saving || defs.length === 0}
          className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Kaydediliyor…" : "Kaydet ve Devam Et"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Yerinde hızlı personel ekleme ────────────────────────────────────────────

function QuickPersonnelModal({ locationId, onClose }: { locationId: string; onClose: () => void }) {
  const [rows, setRows] = useState([{ name: "", phone: "" }, { name: "", phone: "" }, { name: "", phone: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (i: number, field: "name" | "phone", val: string) =>
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, [field]: val } : r)));

  const save = async () => {
    const valid = rows.filter(r => r.name.trim());
    if (valid.length === 0) { setError("En az bir isim girin."); return; }
    setSaving(true);
    setError("");
    let failed = 0;
    for (const r of valid) {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, name: r.name.trim(), phone: r.phone.trim() || null }),
      }).catch(() => null);
      if (!res || !res.ok) failed++;
    }
    setSaving(false);
    if (failed === valid.length) {
      setError("Personel eklenemedi. Lütfen tekrar deneyin.");
      return;
    }
    window.dispatchEvent(new Event("optishift_location_changed"));
    onClose();
  };

  return (
    <ModalShell title="Hızlı Personel Ekle" subtitle="Şimdilik sadece isim yeterli — detayları sonra Personel sayfasından tamamlayabilirsiniz." onClose={onClose}>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.name}
              onChange={e => update(i, "name", e.target.value)}
              placeholder="Ad Soyad"
              className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
            <input
              value={r.phone}
              onChange={e => update(i, "phone", e.target.value)}
              placeholder="Telefon (opsiyonel)"
              className="w-40 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>
        ))}
        <button onClick={() => setRows(prev => [...prev, { name: "", phone: "" }])} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 py-1">
          <Plus size={13} /> Satır ekle
        </button>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
        <button onClick={save} disabled={saving}
          className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Ekleniyor…" : "Ekle"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Ortak modal kabuğu ───────────────────────────────────────────────────────

function ModalShell({ title, subtitle, onClose, children }: {
  title: string; subtitle: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom-4 duration-200 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

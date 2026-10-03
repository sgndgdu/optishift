"use client";

import { useState } from "react";
import { Check, X, Plus, CalendarClock, Users, Grid3x3, Sparkles } from "lucide-react";
import BulkImportModal from "@/components/personnel/BulkImportModal";
import InviteLinkList, { type InviteResult } from "@/components/personnel/InviteLinkList";

/**
 * Vardiya Planı'nda kurulum bandı: eksik adımları sırayla gösterir.
 * Vardiya tanımlarının TEK yeri Ayarlar > Temel'dir; bu bant oraya götürür (ayrı bir
 * vardiya düzenleyicisi yok). Personel ekleme yerinde yapılır; kayıt sonrası
 * `optishift_location_changed` sayfayı yeniden yükler.
 */

interface QuickSetupProps {
  locationId: string;
  shiftDefsCount: number;
  personnelCount: number;
  demandFilled: boolean;
  /** Personel ihtiyacı tablosu Haftayı Oluştur sihirbazının 1. adımında */
  onOpenDemand: () => void;
}

export default function QuickSetup({ locationId, shiftDefsCount, personnelCount, demandFilled, onOpenDemand }: QuickSetupProps) {
  const [modal, setModal] = useState<"personnel" | "import" | null>(null);

  const steps = [
    { key: "shifts",    label: "Vardiyaları tanımla",  done: shiftDefsCount > 0,  icon: CalendarClock, action: () => { window.location.href = "/settings?tab=basic"; } },
    { key: "personnel", label: "Personel ekle",         done: personnelCount > 0,  icon: Users,          action: () => setModal("personnel") },
    { key: "demand",    label: "Kaç kişi gerektiğini gir", done: demandFilled,        icon: Grid3x3,        action: onOpenDemand },
  ];
  const allDone = steps.every(s => s.done);
  if (allDone) return null;

  return (
    <>
      <div className="bg-forest-50/70 border border-forest-100 rounded-2xl px-4 py-3.5">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles size={14} className="text-forest-500" />
          <p className="text-xs font-bold text-forest-700">Hızlı Kurulum · {steps.filter(s => s.done).length}/3</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className={`flex-1 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${s.done ? "bg-white border-emerald-200" : "bg-white border-slate-200"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                {s.done ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-xs font-semibold flex-1 ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.label}</span>
              {!s.done && (
                <button
                  onClick={s.action}
                  className="text-xs font-bold text-forest-600 bg-forest-50 hover:bg-forest-100 border border-forest-200 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                >
                  Başla
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {modal === "personnel" && <QuickPersonnelModal locationId={locationId} onClose={() => setModal(null)} onImport={() => setModal("import")} />}
      {modal === "import" && <BulkImportModal locationId={locationId} onClose={() => setModal(null)} />}
    </>
  );
}

function QuickPersonnelModal({ locationId, onClose, onImport }: { locationId: string; onClose: () => void; onImport: () => void }) {
  const [rows, setRows] = useState([{ name: "", phone: "" }, { name: "", phone: "" }, { name: "", phone: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Eklendikten sonra: giriş bağlantıları ve atlananlar (pencere bunları göstermeden kapanmaz)
  const [done, setDone] = useState<{ results: InviteResult[]; skipped: { name: string; reason: string }[]} | null>(null);

  const update = (i: number, field: "name" | "phone", val: string) =>
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, [field]: val } : r)));

  // Tek istekte toplu ekleme (/api/personnel/bulk): yarıda kalıp sessizce kişi kaybetmez
  const save = async () => {
    const valid = rows.filter(r => r.name.trim());
    if (valid.length === 0) { setError("En az bir isim girin."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/personnel/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          rows: valid.map((r, i) => ({ line: i + 1, name: r.name.trim(), phone: r.phone.trim(), department: "", skills: [], email: "" })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Personel eklenemedi. Lütfen tekrar deneyin."); return; }
      // Sayfa yenilemesi pencere kapanınca: şimdi yenilenirse bant yeniden kurulur ve bağlantılar kaybolur
      setDone({ results: d.results ?? [], skipped: d.skipped ?? [] });
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const finish = () => {
      if (done.results.length > 0) window.dispatchEvent(new Event("optishift_location_changed"));
      onClose();
    };
    return (
      <ModalShell title={done.results.length > 0 ? `${done.results.length} kişi eklendi` : "Kimse eklenmedi"} subtitle="Personelin telefonundan giriş yapabilmesi için bağlantısını gönderin." onClose={finish}>
        {done.skipped.length > 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-0.5">
            <p className="font-semibold">{done.skipped.length} kişi eklenmedi:</p>
            {done.skipped.map((x, i) => <p key={i}>{x.name || "İsimsiz"}: {x.reason}</p>)}
          </div>
        )}
        {done.results.length > 0 && <InviteLinkList results={done.results} />}
        <button onClick={finish} className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90">Tamam</button>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Hızlı Personel Ekle" subtitle="Şimdilik sadece isim yeterli, detayları sonra Ekip sayfasından tamamlayabilirsiniz." onClose={onClose}>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.name}
              onChange={e => update(i, "name", e.target.value)}
              placeholder="Ad Soyad"
              // "Satır ekle" ile gelen yeni satıra doğrudan yazılabilsin
              autoFocus={i >= 3 && i === rows.length - 1}
              className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forest-400"
            />
            <input
              value={r.phone}
              onChange={e => update(i, "phone", e.target.value)}
              placeholder="Telefon"
              className="w-32 sm:w-40 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forest-400"
            />
          </div>
        ))}
        <button onClick={() => setRows(prev => [...prev, { name: "", phone: "" }])} className="flex items-center gap-1.5 text-xs font-bold text-forest-600 hover:text-forest-800 py-1">
          <Plus size={13} /> Satır ekle
        </button>
      </div>

      <button onClick={onImport} className="w-full text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-100">
        <strong className="text-forest-700">Listeniz Excel&apos;de mi?</strong> Şablonu indirip tüm ekibi tek seferde içe aktarın (isim, departman, yetenek, telefon).
      </button>

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
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl p-6 space-y-4 animate-in slide-in-from-bottom-4 duration-200 max-h-[85vh] overflow-y-auto">
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

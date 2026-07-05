"use client";

import { useEffect, useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { ERP_SYSTEMS, erpLabel } from "@/lib/erp";

interface MappedField { erp: string; sys: string }

const DEFAULT_MAPPING: MappedField[] = [
  { erp: "Emp_Name",  sys: "personnel_name" },
  { erp: "Sicil_No",  sys: "employee_id" },
  { erp: "Dept_Code", sys: "department" },
];

export default function IntegrationsPage() {
  const [connectedErp, setConnectedErp] = useState<string | null>(null);
  const [mapping, setMapping] = useState<MappedField[]>(DEFAULT_MAPPING);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const userRaw = localStorage.getItem("optishift_manager_user");
        const u = userRaw ? JSON.parse(userRaw) : null;
        setCanEdit(u?.role === "admin");

        const res = await fetch("/api/organizations");
        if (res.ok) {
          const org = await res.json();
          setConnectedErp(org.connected_erp ?? null);
          if (Array.isArray(org.erp_mapped_fields) && org.erp_mapped_fields.length > 0) {
            setMapping(org.erp_mapped_fields);
          }
        }
      } catch { /* empty */ }
      setLoading(false);
    };
    init();
  }, []);

  const showFeedback = (type: "ok" | "error", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 3000);
  };

  const saveErp = async (value: string | null) => {
    setSaving(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connected_erp: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sunucu hatası");
      setConnectedErp(value);
      showFeedback("ok", value ? `${erpLabel(value)} bağlandı.` : "ERP bağlantısı kaldırıldı.");
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Kaydedilemedi.");
    }
    setSaving(false);
  };

  const handleConnect = (value: string) => {
    if (connectedErp && connectedErp !== value) {
      if (!confirm(`Şu an ${erpLabel(connectedErp)} bağlı. ${erpLabel(value)} ile değiştirilsin mi?`)) return;
    }
    saveErp(value);
  };

  const handleSaveMapping = async () => {
    const cleaned = mapping.filter(m => m.erp.trim() && m.sys.trim());
    setSaving(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erp_mapped_fields: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sunucu hatası");
      setMapping(cleaned);
      showFeedback("ok", "Alan eşleştirme kaydedildi.");
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Kaydedilemedi.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Entegrasyon Merkezi</h1>
        <p className="text-slate-500 text-sm mt-1">
          ERP ve İK sisteminize bağlanın — organizasyon genelinde tek bağlantı geçerlidir
        </p>
      </div>

      {!canEdit && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-600">
          ERP bağlantısını yalnızca <strong>yönetici (admin)</strong> veya <strong>süpervizör</strong> değiştirebilir.
          Aşağıda mevcut bağlantı durumunu görüyorsunuz.
        </div>
      )}

      {feedback && (
        <div className={`rounded-xl px-5 py-3 text-sm border ${
          feedback.type === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ERP_SYSTEMS.map(({ value, label, desc, logo, color }) => {
          const isConnected = connectedErp === value;
          return (
            <div key={value} className={`bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4 ${isConnected ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-100"}`}>
              <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                {logo}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 text-sm">{label}</div>
                <div className={`text-xs mt-0.5 ${isConnected ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                  {loading ? "…" : isConnected ? "✓ Bağlı" : desc}
                </div>
              </div>
              {canEdit && (
                <button
                  disabled={saving || loading}
                  onClick={() => isConnected ? saveErp(null) : handleConnect(value)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50 ${
                    isConnected
                      ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
                >
                  {isConnected ? "Bağlantıyı Kes" : "Bağlan"}
                </button>
              )}
              {!canEdit && isConnected && (
                <span className="text-emerald-600 shrink-0"><Check size={18} /></span>
              )}
            </div>
          );
        })}
      </div>

      {/* Alan Eşleştirme — organizations.erp_mapped_fields */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-1">Alan Eşleştirme</h2>
        <p className="text-xs text-slate-400 mb-4">
          ERP&apos;den gelen sütun adlarını OptiShift alanlarıyla eşleştirin. Senkronizasyon bu eşleştirmeyi kullanır.
        </p>
        <div className="space-y-3">
          {mapping.map((m, idx) => (
            <div key={idx} className="flex items-center gap-3 text-sm">
              <input
                value={m.erp}
                disabled={!canEdit}
                onChange={e => { const n = [...mapping]; n[idx] = { ...n[idx], erp: e.target.value }; setMapping(n); }}
                placeholder="ERP alanı (örn: Emp_Name)"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 font-mono text-xs outline-none focus:border-indigo-400 disabled:opacity-70"
              />
              <span className="text-slate-400">→</span>
              <input
                value={m.sys}
                disabled={!canEdit}
                onChange={e => { const n = [...mapping]; n[idx] = { ...n[idx], sys: e.target.value }; setMapping(n); }}
                placeholder="OptiShift alanı"
                className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-indigo-700 font-mono text-xs outline-none focus:border-indigo-400 disabled:opacity-70"
              />
              {canEdit && (
                <button
                  onClick={() => setMapping(mapping.filter((_, i) => i !== idx))}
                  className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setMapping([...mapping, { erp: "", sys: "" }])}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Plus size={13} /> Yeni alan eşleştirme ekle
            </button>
            <button
              onClick={handleSaveMapping}
              disabled={saving}
              className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? "Kaydediliyor…" : "Eşleştirmeyi Kaydet"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

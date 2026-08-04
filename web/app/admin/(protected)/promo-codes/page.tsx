"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import { Gift, Plus, Ban, Copy } from "lucide-react";

type PromoCode = {
  id: number;
  code: string;
  campaign_name: string | null;
  plan: string;
  free_months: number;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  expires_at: number | null;
  created_at: number;
};

function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [code, setCode] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [freeMonths, setFreeMonths] = useState(3);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/god/promo-codes");
      const data = await res.json();
      setCodes(Array.isArray(data) ? data : []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!code.trim()) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/god/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          campaign_name: campaignName.trim() || null,
          plan: "pro",
          free_months: freeMonths,
          max_uses: maxUses ? parseInt(maxUses, 10) : null,
          expires_at: expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Hata oluştu"); return; }
      setCode(""); setCampaignName(""); setFreeMonths(3); setMaxUses(""); setExpiresAt("");
      await load();
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (id: number) => {
    if (!confirm("Bu kod pasife alınsın mı? Artık kayıtta kullanılamaz.")) return;
    await fetch(`/api/god/promo-codes?id=${id}`, { method: "PATCH" });
    await load();
  };

  const registerUrl = (c: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/register?ref=${c}` : `/register?ref=${c}`;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Kampanya Kodları</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Reklamla dağıtılan kod — kayıt olurken girilince org otomatik Profesyonel plana geçer, süresi dolunca ücretsiz plana döner.
        </p>
      </div>

      {/* Yeni kod */}
      <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Plus size={14} className="text-ember-400" /> Yeni Kod
        </h2>
        {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Kod</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="OPTI3AY"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono uppercase text-white placeholder-slate-600 focus:outline-none focus:border-ember-500/50 w-40"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Kampanya Adı</label>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Instagram Ağustos"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-ember-500/50 w-48"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Ücretsiz Ay</label>
            <input
              type="number" min={1} max={24}
              value={freeMonths}
              onChange={e => setFreeMonths(parseInt(e.target.value, 10) || 1)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-ember-500/50 w-24"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Maks. Kullanım</label>
            <input
              type="number" min={1}
              value={maxUses}
              onChange={e => setMaxUses(e.target.value)}
              placeholder="Sınırsız"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-ember-500/50 w-28"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Son Kullanım (isteğe bağlı)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-ember-500/50 [color-scheme:dark]"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !code.trim()}
            className="ml-auto flex items-center gap-2 bg-ember-600 hover:bg-ember-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Gift size={14} /> {saving ? "Oluşturuluyor…" : "Oluştur"}
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-ember-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : codes.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-600 text-sm">
            <Gift size={22} className="mx-auto mb-2 text-slate-700" />
            Henüz kampanya kodu yok
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {codes.map(c => (
              <div key={c.id} className={`flex items-center gap-3 px-5 py-4 ${c.active ? "" : "opacity-40"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-white tracking-wider">{c.code}</span>
                    {c.campaign_name && <span className="text-xs text-slate-500">· {c.campaign_name}</span>}
                    <button
                      onClick={() => navigator.clipboard?.writeText(registerUrl(c.code))}
                      title="Kayıt linkini kopyala"
                      className="text-slate-500 hover:text-white transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 tabular-nums">
                    {c.free_months} ay ücretsiz {c.plan} · Kullanım: {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : " (sınırsız)"}
                    {c.expires_at ? ` · Son gün: ${fmtDate(c.expires_at)}` : ""}
                    {c.active ? "" : " · PASİF"}
                  </p>
                </div>
                {c.active && (
                  <button
                    onClick={() => handleDeactivate(c.id)}
                    title="Pasife al"
                    className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <Ban size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

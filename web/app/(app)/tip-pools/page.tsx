"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { Plus, Wallet } from "lucide-react";
import { ComingSoonFeature } from "@/components/feedback/ComingSoonFeature";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty } from "@/components/ui/List";
import { Sheet, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";
import { useManagerAuth } from "@/hooks/useAuth";
import { isModuleOn } from "@/lib/moduleVisibility";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";

const inputClass = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20";

/** "21–27 Eylül" ya da ay değişiyorsa "28 Eyl – 4 Eki". */
function periodLabel(start: string, end: string) {
  const a = new Date(start + "T00:00:00"), b = new Date(end + "T00:00:00");
  if (start === end) return a.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`;
  const f = (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return `${f(a)} – ${f(b)}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

export default function TipPoolsPage() {
  const { user, mounted } = useManagerAuth();
  const [locationId, setLocationId] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [periodStart, setPeriodStart] = useState(todayStr());
  const [periodEnd, setPeriodEnd] = useState(todayStr());
  const [totalAmount, setTotalAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, any>>({});
  const [distributingId, setDistributingId] = useState<number | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!user) return;
    const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
    setLocationId(locId);
    if (!locId) { setLoading(false); return; }
    try {
      const locRes = await fetch(`/api/locations?id=${locId}`).then(r => r.json()).catch(() => []);
      const locData = Array.isArray(locRes) ? locRes[0] : null;
      let tipEnabled = false;
      if (locData?.rules) {
        try { tipEnabled = isModuleOn(JSON.parse(locData.rules), "tip_pooling_enabled"); } catch {}
      }
      setEnabled(tipEnabled);
      if (!tipEnabled) { setLoading(false); return; }

      const poolRes = await fetch(`/api/tip-pools?location_id=${locId}`).then(r => r.json()).catch(() => []);
      setPools(Array.isArray(poolRes) ? poolRes : []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function createPool() {
    const amount = Number(totalAmount);
    if (!amount || amount <= 0) { showToast("Geçerli bir tutar girin"); return; }
    if (periodEnd < periodStart) { showToast("Bitiş tarihi başlangıçtan önce olamaz"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/tip-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, period_start: periodStart, period_end: periodEnd, total_amount: amount }),
      });
      if (r.ok) {
        showToast("Bahşiş havuzu oluşturuldu");
        setShowForm(false);
        setTotalAmount("");
        await load();
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Hata");
      }
    } finally {
      setSaving(false);
    }
  }

  async function distributePool(id: number) {
    setDistributingId(id);
    try {
      const r = await fetch("/api/tip-pools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "distribute" }),
      });
      if (r.ok) {
        showToast("Havuz dağıtıldı");
        await load();
        // Taslakken açılan ayrıntı önbellekte; dağıtım paylarını tazele
        const d = await fetch(`/api/tip-pools?id=${id}`).then(r => r.json()).catch(() => null);
        if (d) setDetail(prev => ({ ...prev, [id]: d }));
        setExpandedId(id);
      } else {
        const err = await r.json().catch(() => ({}));
        showToast(err.error || "Dağıtım başarısız");
      }
    } finally {
      setDistributingId(null);
    }
  }

  async function toggleDetail(id: number, forceOpen = false) {
    if (!forceOpen && expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detail[id]) {
      const d = await fetch(`/api/tip-pools?id=${id}`).then(r => r.json()).catch(() => null);
      if (d) setDetail(prev => ({ ...prev, [id]: d }));
    }
  }

  if (!mounted) return <div className="space-y-6" />;

  if (enabled === false) {
    return (
      <Page width="narrow">
        <PageHeader title="Bahşiş Havuzu" />
        {/* Yakında (lib/moduleVisibility COMING_SOON): eski bağlantıyla gelen de soruyu görür */}
        <ComingSoonFeature feature="tips" icon={Wallet} title="Bahşiş ve Prim Dağıtımı"
          description="Toplanan bahşişi ve primi ekibe sizin kurallarınızla paylaştırmak."
          question="Böyle bir özellik ister misiniz? İşletmenizde bahşiş nasıl dağıtılıyor?"
          placeholder="Örn: Bahşiş kutusu haftada bir açılır, mutfak ve salon ayrı pay alır, şef iki pay alır." />
      </Page>
    );
  }

  const open = pools.find(p => p.id === expandedId) ?? null;
  const openDetail = open ? detail[open.id] : null;
  const period = (p: any) => periodLabel(p.period_start, p.period_end);

  return (
    <Page width="narrow">
      <PageHeader title="Bahşiş Havuzu" description="Dönemin bahşişini çalışılan saate göre dağıtır." actions={
        <button onClick={() => setShowForm(true)} className={pageActionClass}>
          <Plus size={16} /> Yeni Havuz
        </button>
      } />

      <List>
        {loading ? <ListEmpty>Yükleniyor…</ListEmpty> : pools.length === 0 ? <ListEmpty>Henüz bahşiş havuzu yok.</ListEmpty> : pools.map(pool => (
          <ListItem key={pool.id} onClick={() => toggleDetail(pool.id, true)}
            title={period(pool)}
            subtitle={pool.status === "distributed" ? `Dağıtılan ${formatTry(pool.distributed_amount)}` : "Henüz dağıtılmadı"}
            trailing={<>
              <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatTry(pool.total_amount)}</span>
              {pool.status === "distributed" ? <StatusPill tone="positive">Dağıtıldı</StatusPill> : <StatusPill tone="attention">Taslak</StatusPill>}
            </>}
          />
        ))}
      </List>

      <Sheet open={!!open} onClose={() => setExpandedId(null)} title={open ? period(open) : ""}
        description={open ? `Toplam ${formatTry(open.total_amount)}` : undefined}
        footer={open?.status === "draft" ? (
          <button onClick={() => distributePool(open.id)} disabled={distributingId === open.id} className={sheetPrimaryClass}>
            {distributingId === open.id ? "Dağıtılıyor…" : "Saate göre dağıt"}
          </button>
        ) : undefined}>
        {open?.status === "draft" ? (
          <p className="text-sm text-slate-600">Dağıtınca tutar, bu dönemde çalışılan saate göre kişilere bölünür.</p>
        ) : !openDetail ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : (openDetail.allocations?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">Dağıtım kaydı yok.</p>
        ) : (
          <List>
            {openDetail.allocations.map((a: any) => (
              <ListItem key={a.id}
                leading={<Avatar name={a.personnel_name ?? "?"} />}
                title={a.personnel_name ?? a.personnel_id}
                subtitle={`${(Math.round(a.worked_minutes / 60 * 10) / 10).toLocaleString("tr-TR")} saat`}
                trailing={<span className="text-sm font-semibold text-slate-900 tabular-nums">{formatTry(a.amount)}</span>}
              />
            ))}
          </List>
        )}
      </Sheet>

      <Sheet open={showForm} onClose={() => setShowForm(false)} title="Yeni bahşiş havuzu"
        footer={<>
          <button onClick={() => setShowForm(false)} className={sheetSecondaryClass}>Vazgeç</button>
          <button onClick={createPool} disabled={saving} className={sheetPrimaryClass}>{saving ? "Kaydediliyor…" : "Havuzu oluştur"}</button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Başlangıç</span>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Bitiş</span>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className={inputClass} />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Toplam tutar (₺)</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="0,00" className={inputClass} />
          </label>
        </div>
      </Sheet>

      {toast && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </Page>
  );
}

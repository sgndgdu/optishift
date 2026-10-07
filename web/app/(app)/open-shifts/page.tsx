"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { businessToday } from "@/lib/date";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useManagerAuth } from "@/hooks/useAuth";
import { Plus } from "lucide-react";
import { confirmDespiteViolations, violationText, type ViolationResponse } from "@/lib/ruleViolations";
import { Page, PageHeader, pageActionClass } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty, ListSection } from "@/components/ui/List";
import { Sheet, DetailRow, sheetPrimaryClass, sheetSecondaryClass, sheetDangerClass } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";

const inputClass = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long" });
}

function StatusBadge({ status, expired }: { status: string; expired?: boolean }) {
  if (status === "open" && expired) return <StatusPill tone="neutral">Süresi geçti</StatusPill>;
  if (status === "open") return <StatusPill tone="attention">Açık</StatusPill>;
  if (status === "claimed") return <StatusPill tone="positive">Üstlenildi</StatusPill>;
  return <StatusPill tone="neutral">İptal</StatusPill>;
}

export default function OpenShiftsPage() {
  const router = useRouter();
  const { user, mounted } = useManagerAuth();

  const [shifts, setShifts]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [toast, setToast]           = useState("");

  // form state
  const [date, setDate]             = useState("");
  const [startTime, setStartTime]   = useState("09:00");
  const [endTime, setEndTime]       = useState("17:00");
  const [note, setNote]             = useState("");
  const [bonus, setBonus]           = useState(6);
  const [defaultBonus, setDefaultBonus] = useState(6); // Ayarlar → Adalet Puanı'ndaki varsayılan bonus puanı
  const [saving, setSaving]         = useState(false);

  // Dashboard hızlı akışı: ?new=1 ile gelindiyse form açık başlasın
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setShowForm(true);
      const _od = new Date();
      setDate(`${_od.getFullYear()}-${String(_od.getMonth()+1).padStart(2,"0")}-${String(_od.getDate()).padStart(2,"0")}`);
    }
  }, []);

  useEffect(() => {
    if (!mounted || !user) return;
    if (user.role !== "manager" && user.role !== "admin" && user.role !== "supervisor") {
      router.push("/dashboard");
    }
  }, [mounted, user, router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
      const r = await fetch(`/api/open-shifts?org_id=${user.org_id}&location_id=${locId}`);
      const data = await r.json();
      setShifts(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, [user]);

  // İlk yükleme (2026-10-04: Teklif Pazarı kaldırılırken bu satır da silinmişti, liste hiç yüklenmiyordu)
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // Asistanda onaylanan işlem (lib/copilot/applyAction) ilan açmış olabilir
  useEffect(() => {
    window.addEventListener("optishift_data_changed", load);
    return () => window.removeEventListener("optishift_data_changed", load);
  }, [load]);

  // Varsayılan kahraman bonus puanını Ayarlar'daki kuraldan al (tek kaynak: rules.hero_bonus_points)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/locations?org_id=${user.org_id}`);
        const locs = await res.json();
        const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
        const loc = Array.isArray(locs) ? (locs.find((l: any) => l.id === locId) ?? locs[0]) : null;
        const rules = typeof loc?.rules === "string" ? JSON.parse(loc.rules) : loc?.rules;
        if (typeof rules?.hero_bonus_points === "number") {
          setDefaultBonus(rules.hero_bonus_points);
          setBonus(rules.hero_bonus_points);
        }
      } catch { /* varsayılan 6 kalır */ }
    })();
  }, [user]);

  async function handleCreate() {
    if (!date || !startTime || !endTime || !user) return;
    setSaving(true);
    try {
      const locId = user.location_id || localStorage.getItem("optishift_selected_location") || "";
      const r = await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: user.org_id, location_id: locId,
          date, start_time: startTime, end_time: endTime,
          note, hero_bonus_multiplier: bonus,
        }),
      });
      if (r.ok) {
        showToast("Açık vardiya ilanı oluşturuldu!");
        setShowForm(false);
        setDate(""); setNote(""); setBonus(defaultBonus);
        await load();
      }
    } finally { setSaving(false); }
  }

  // Akıllı aday önerisi: uygunluk filtreli (o gün boş, kırmızı değil, gece kısıtsız),
  // adalet puanı sıralı liste — "Ata" ile müdür doğrudan atar
  const [candidates, setCandidates] = useState<Record<number, { loading: boolean; list: any[] }>>({});
  const [assigning, setAssigning] = useState<number | null>(null);

  async function loadCandidates(id: number) {
    setCandidates(prev => ({ ...prev, [id]: { loading: true, list: [] } }));
    try {
      const r = await fetch(`/api/open-shifts/candidates?id=${id}`);
      const data = await r.json();
      setCandidates(prev => ({ ...prev, [id]: { loading: false, list: Array.isArray(data?.candidates) ? data.candidates : [] } }));
    } catch {
      setCandidates(prev => ({ ...prev, [id]: { loading: false, list: [] } }));
    }
  }

  async function handleAssign(shift: any, cand: any) {
    setAssigning(shift.id);
    try {
      const send = (force: boolean) => fetch("/api/open-shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shift.id, claimed_by: cand.personnel_id, claimed_by_name: cand.name, assigned_by_manager: true, force }),
      });
      let r = await send(false);
      let d: ViolationResponse = await r.json().catch(() => ({}));
      if (r.status === 409 && d.can_force && d.violations?.length) {
        if (!confirmDespiteViolations(d.violations, `${cand.name} yine de atansın mı?`)) return;
        r = await send(true);
        d = await r.json().catch(() => ({}));
      }
      if (r.ok) {
        showToast(`${cand.name} vardiyaya atandı ve bilgilendirildi.`);
        await load();
      } else showToast(violationText(d, "Atanamadı."));
    } finally { setAssigning(null); }
  }

  async function handleCancel(id: number) {
    await fetch("/api/open-shifts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled" }),
    });
    showToast("İlan iptal edildi.");
    await load();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/open-shifts?id=${id}`, { method: "DELETE" });
    showToast("İlan silindi.");
    await load();
  }

  // Tarihi geçmiş ilan üstlenilemez (sunucu da reddeder): "Geçmiş"te "Süresi geçti" olarak durur
  const todayISO = businessToday();
  const isLive = (s: any) => s.status === "open" && s.date >= todayISO;
  const openShifts = shifts.filter(isLive);
  const pastShifts = shifts.filter(s => !isLive(s));
  const selected = shifts.find(s => s.id === selectedId) ?? null;

  function openDetail(s: any) {
    setSelectedId(s.id);
    setConfirmDelete(false);
    if (s.status === "open") {
      if (!candidates[s.id]) loadCandidates(s.id);
    }
  }

  if (!mounted) return <div className="space-y-6" />;

  const row = (s: any) => (
    <ListItem key={s.id} onClick={() => openDetail(s)}
      leading={<DateBadge date={s.date} />}
      title={`${weekdayName(s.date)} · ${s.start_time}–${s.end_time}`}
      subtitle={s.status === "claimed" && s.claimed_by_name ? `${s.claimed_by_name} üstlendi`
        : s.note || (s.hero_bonus_multiplier > 0 ? `Üstlenene +${s.hero_bonus_multiplier} puan` : "Bonus yok")}
      trailing={<StatusBadge status={s.status} expired={s.status === "open" && s.date < todayISO} />}
    />
  );


  return (
    <Page width="narrow">
      <PageHeader title="Açık Vardiyalar" description="Boş kalan vardiyayı ilan edin, isteyen biri alsın." actions={
        <button onClick={() => setShowForm(true)} className={pageActionClass}>
          <Plus size={16} /> Yeni İlan
        </button>
      } />

      <List>
        {loading ? <ListEmpty>Yükleniyor…</ListEmpty> : shifts.length === 0 ? (
          <ListEmpty>Açık vardiya ilanı yok. Biri gelemediğinde ilan açın, ekibe hemen bildirim gider.</ListEmpty>
        ) : <>
          <ListSection title="Açık" count={openShifts.length} />
          {openShifts.length === 0 ? <ListEmpty>Şu an açık ilan yok.</ListEmpty> : openShifts.map(row)}
          {pastShifts.length > 0 && <ListSection title="Geçmiş" count={pastShifts.length} />}
          {pastShifts.map(row)}
        </>}
      </List>

      {/* İlan ayrıntısı */}
      <Sheet open={!!selected} onClose={() => setSelectedId(null)}
        title={selected ? `${formatDate(selected.date)}` : ""}
        description={selected ? `${selected.start_time}–${selected.end_time}` : undefined}
        footer={selected && isLive(selected) ? (confirmDelete ? <>
          <span className="mr-auto text-sm text-slate-600">İlan tamamen silinsin mi?</span>
          <button onClick={() => setConfirmDelete(false)} className={sheetSecondaryClass}>Vazgeç</button>
          <button onClick={() => { handleDelete(selected.id); setSelectedId(null); }} className={sheetDangerClass}>Sil</button>
        </> : <>
          <button onClick={() => setConfirmDelete(true)} className={sheetDangerClass}>Sil</button>
          <button onClick={() => { handleCancel(selected.id); setSelectedId(null); }} className={sheetSecondaryClass}>İlanı kapat</button>
        </>) : undefined}>
        {selected && (
          <div className="space-y-5">
            <div>
              <DetailRow label="Durum"><StatusBadge status={selected.status} /></DetailRow>
              <DetailRow label="Üstlenene ek puan">{selected.hero_bonus_multiplier > 0 ? `+${selected.hero_bonus_multiplier} puan` : "Yok"}</DetailRow>
              {selected.note && <DetailRow label="Not">{selected.note}</DetailRow>}
              {selected.status === "claimed" && selected.claimed_by_name && (
                <DetailRow label="Üstlenen"><Link href="/personnel" className="text-primary font-semibold hover:underline">{selected.claimed_by_name}</Link></DetailRow>
              )}
            </div>

            {isLive(selected) && (
              <section className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Uygun adaylar</h3>
                  <p className="text-xs text-slate-500">Ekibe bildirim gitti. Beklemeden birini siz de atayabilirsiniz. Liste en az çalışan kişiden başlar.</p>
                </div>
                {candidates[selected.id]?.loading ? <p className="text-xs text-slate-500">Hesaplanıyor…</p>
                  : (candidates[selected.id]?.list.length ?? 0) === 0 ? <p className="text-xs text-slate-500">Uygun kimse yok. Herkesin o gün vardiyası ya da izni var veya o gün çalışamıyor.</p>
                  : (
                    <List>
                      {candidates[selected.id].list.map((c: any) => (
                        <li key={c.personnel_id} className="flex items-center gap-3 px-3 py-2.5">
                          <Avatar name={c.name} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{c.name}{c.other_branch && <span className="font-normal text-slate-400"> · {c.other_branch}</span>}</p>
                            <p className={`text-xs truncate ${c.warnings.length > 0 ? "text-amber-700" : "text-slate-500"}`}>
                              {c.warnings.length > 0 ? c.warnings.join(" · ") : `${Math.round(c.prev_score)} puan`}
                            </p>
                          </div>
                          {(!c.other_branch || user?.role === "admin" || user?.role === "supervisor") ? (
                          <button disabled={assigning === selected.id} onClick={() => handleAssign(selected, c)}
                            className="shrink-0 px-3 min-h-[36px] rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
                            {assigning === selected.id ? "Atanıyor…" : "Ata"}
                          </button>
                          ) : <span className="shrink-0 text-[10px] text-slate-400 text-right leading-tight">İlan ona<br />duyuruldu</span>}
                        </li>
                      ))}
                    </List>
                  )}
              </section>
            )}
          </div>
        )}
      </Sheet>

      {/* Yeni ilan */}
      <Sheet open={showForm} onClose={() => setShowForm(false)} title="Yeni açık vardiya"
        description="Ekibe anında bildirim gider"
        footer={<>
          <button onClick={() => setShowForm(false)} className={sheetSecondaryClass}>Vazgeç</button>
          <button disabled={!date || !startTime || !endTime || saving} onClick={handleCreate} className={sheetPrimaryClass}>
            {saving ? "Kaydediliyor…" : "İlanı yayınla"}
          </button>
        </>}>
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Tarih</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Başlangıç</span>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Bitiş</span>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Üstlenene ek puan</span>
            <div className="flex gap-2">
              {Array.from(new Set([0, 3, defaultBonus, 10])).sort((a, b) => a - b).map(b => (
                <button key={b} type="button" onClick={() => setBonus(b)}
                  className={`flex-1 min-h-[40px] rounded-xl text-sm font-semibold border transition-colors ${
                    bonus === b ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}>
                  {b === 0 ? "Yok" : `+${b}`}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {bonus === 0 ? "Standart puan, bonus yok." : `Üstlenen kişi +${bonus} puan kazanır.`}{defaultBonus > 0 && ` Varsayılan +${defaultBonus}.`}
            </p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Not (isteğe bağlı)</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Ekibe ek bilgi…" className={`${inputClass} resize-none`} />
          </label>
        </div>
      </Sheet>

      {toast && (
        <div className="fixed bottom-24 right-4 lg:bottom-8 md:right-8 bg-slate-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl z-[60] animate-in fade-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
          {toast}
        </div>
      )}
    </Page>
  );
}

function weekdayName(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "long" });
}

/** Listede tarih kutusu: gün + ay kısaltması (avatar yerine). */
function DateBadge({ date }: { date: string }) {
  const d = new Date(date + "T00:00:00");
  return (
    <span aria-hidden className="w-10 h-10 shrink-0 rounded-xl bg-slate-100 flex flex-col items-center justify-center leading-none">
      <span className="text-sm font-bold text-slate-900">{d.getDate()}</span>
      <span className="text-[10px] font-medium text-slate-500 mt-0.5">{d.toLocaleDateString("tr-TR", { month: "short" })}</span>
    </span>
  );
}

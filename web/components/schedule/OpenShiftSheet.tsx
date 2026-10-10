"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Vardiya Planı'ndaki ilan penceresi (2026-10-09, kullanıcı: "ayrı ilan sayfasına gerek yok, plandan yapılsın").
 * Ayrı Açık Vardiyalar sayfası kalktı; ilan plan tablosunun kutusunda görünür, bu pencereden yönetilir:
 *  - Var olan ilan: durum, uygun adaylar ve "Ata", ilanı kapatma / silme, başka şubeden yazılan kişiyi beklemeyi bırakma
 *  - Yeni ilan: boş yerin günü ve saati hazır gelir, not yazılıp ekibe duyurulur (alana ek puan şubenin kuralından)
 * Sunucu tarafı değişmedi (/api/open-shifts, /api/open-shifts/candidates).
 */
import { Fragment, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { List } from "@/components/ui/List";
import { Sheet, DetailRow, sheetPrimaryClass, sheetSecondaryClass, sheetDangerClass } from "@/components/ui/Sheet";
import { StatusPill } from "@/components/ui/StatusPill";
import { confirmDespiteViolations, violationText, type ViolationResponse } from "@/lib/ruleViolations";
import { formatDateTR } from "@/lib/date";
import { formatScore } from "@/lib/fairness";
import { trNum } from "@/lib/format";

export type Listing = {
  id: number; date: string; start_time: string; end_time: string; status: string; note?: string | null;
  hero_bonus_multiplier?: number; claimed_by_name?: string | null; released_by?: string | null;
};

export type NewListing = { locationId: string; date: string; start: string; end: string; label: string };

// Aday satırı: bu haftaki süre + Adalet Puanı'nın anlamı ("109 puan" tek başına bir şey anlatmıyordu)
function candidateLine(c: { other_branch?: string; week_hours?: number; prev_score: number; fair_text?: string }) {
  return [
    c.other_branch ?? null,
    c.week_hours !== undefined ? `Bu hafta ${trNum(c.week_hours)} saat` : null,
    `Adalet Puanı ${formatScore(c.prev_score)}${c.fair_text ? `, ${c.fair_text}` : ""}`,
  ].filter(Boolean).join(" · ");
}

export default function OpenShiftSheet({ listing, draft, defaultBonus, isOwner, onClose, onDone }: {
  listing: Listing | null;
  draft: NewListing | null;
  defaultBonus: number;
  isOwner: boolean;
  onClose: () => void;
  /** İşlem bitti: mesaj gösterilir, plan yeniden yüklenir */
  onDone: (msg: string) => void;
}) {
  const [cands, setCands] = useState<{ id: number; loading: boolean; list: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!listing || listing.status !== "open") return;
    let stale = false;
    fetch(`/api/open-shifts/candidates?id=${listing.id}`).then(r => r.json()).catch(() => null).then(d => {
      if (!stale) setCands({ id: listing.id, loading: false, list: Array.isArray(d?.candidates) ? d.candidates : [] });
    });
    return () => { stale = true; };
  }, [listing]);
  const list = cands && listing && cands.id === listing.id ? cands : null;

  const close = () => { setConfirmDelete(false); setError(""); setNote(""); setCands(null); onClose(); };

  const patch = (body: Record<string, unknown>) => fetch("/api/open-shifts", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  const assign = async (c: any) => {
    if (!listing) return;
    setBusy(true);
    try {
      const send = (force: boolean) => patch({ id: listing.id, claimed_by: c.personnel_id, claimed_by_name: c.name, assigned_by_manager: true, force });
      let r = await send(false);
      let d: ViolationResponse = await r.json().catch(() => ({}));
      if (r.status === 409 && d.can_force && d.violations?.length) {
        if (!confirmDespiteViolations(d.violations, `${c.name} yine de atansın mı?`, isOwner)) return;
        r = await send(true);
        d = await r.json().catch(() => ({}));
      }
      if (d.exception_requested) { close(); onDone(d.message ?? "Hesap sahibinin onayına gönderildi."); return; }
      if (!r.ok) { setError(violationText(d, "Atanamadı.")); return; }
      close();
      onDone((d as { pending?: boolean }).pending ? `${c.name} için kendi şubesinin sorumlusunun onayı bekleniyor.` : `${c.name} vardiyaya yazıldı ve bilgilendirildi.`);
    } finally { setBusy(false); }
  };

  const simple = async (fn: () => Promise<Response>, msg: string) => {
    setBusy(true);
    try {
      const r = await fn();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "İşlem yapılamadı."); return; }
      close(); onDone(msg);
    } finally { setBusy(false); }
  };

  const create = () => draft && simple(() => fetch("/api/open-shifts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location_id: draft.locationId, date: draft.date, start_time: draft.start, end_time: draft.end, note: note.trim() || null }),
  }), "İlan açıldı, ekibe bildirim gitti. Alan kişi plana kendiliğinden yazılır.");

  if (draft) {
    return (
      <Sheet open onClose={close} title="Ekibe duyur" description={`${draft.label} · ${formatDateTR(draft.date)} ${draft.start}–${draft.end}`}
        footer={<>
          <button onClick={close} className={sheetSecondaryClass}>Vazgeç</button>
          <button disabled={busy} onClick={create} className={sheetPrimaryClass}>{busy ? "Açılıyor…" : "İlanı aç"}</button>
        </>}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Bu vardiya ekibe ilan olarak duyurulur. İlk alan kişi vardiyaya yazılır, plan tablosunda görürsünüz.</p>
          {defaultBonus > 0 && <p className="text-xs text-slate-500">Alan kişiye vardiyanın %{defaultBonus}&apos;i kadar ek puan yazılır (Ayarlar › Adalet Puanı).</p>}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Not (isteğe bağlı)</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Ekibe ek bilgi" className="field-input resize-none" />
          </label>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        </div>
      </Sheet>
    );
  }

  if (!listing) return null;
  const s = listing;
  return (
    <Sheet open onClose={close} title={`${formatDateTR(s.date)}`} description={`${s.start_time}–${s.end_time} · ilanda`}
      footer={confirmDelete ? <>
        <span className="mr-auto text-sm text-slate-600">İlan tamamen silinsin mi?</span>
        <button onClick={() => setConfirmDelete(false)} className={sheetSecondaryClass}>Vazgeç</button>
        <button disabled={busy} onClick={() => simple(() => fetch(`/api/open-shifts?id=${s.id}`, { method: "DELETE" }), "İlan silindi.")} className={sheetDangerClass}>Sil</button>
      </> : <>
        <button onClick={() => setConfirmDelete(true)} className={sheetDangerClass}>Sil</button>
        <button disabled={busy} onClick={() => simple(() => patch({ id: s.id, status: "cancelled" }), "İlan kapatıldı.")} className={sheetSecondaryClass}>İlanı kapat</button>
      </>}>
      <div className="space-y-5">
        <div>
          <DetailRow label="Durum">{s.status === "loan_pending" ? <StatusPill tone="info">Onay bekliyor</StatusPill> : <StatusPill tone="attention">Açık</StatusPill>}</DetailRow>
          <DetailRow label="Alana ek puan">{Number(s.hero_bonus_multiplier) > 0 ? `+${formatScore(Number(s.hero_bonus_multiplier))} puan` : "Yok"}</DetailRow>
          {s.note && <DetailRow label="Not">{s.note}</DetailRow>}
          {s.status === "loan_pending" && <DetailRow label="Yazılan">{s.claimed_by_name ?? "Başka şubeden biri"}</DetailRow>}
        </div>

        {s.status === "loan_pending" && (
          <section className="space-y-2">
            <p className="text-sm text-slate-600">Bu kişi başka bir şubede çalışıyor. Kendi sorumlusu onaylayınca vardiya planınıza yazılır, size bildirim gelir.</p>
            <button disabled={busy} onClick={() => simple(() => patch({ id: s.id, loan_withdraw: true }), "İlan yeniden açıldı. Kişiye haber verildi.")} className={sheetSecondaryClass}>
              Beklemeyi bırak, ilanı yeniden aç
            </button>
          </section>
        )}

        {s.status === "open" && (
          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Uygun kişiler</h3>
              <p className="text-xs text-slate-500">Ekibe bildirim gitti. Beklemeden birini siz de yazabilirsiniz. Son haftalarda en az ve en kolay vardiyalarda çalışan kişi en üsttedir.</p>
            </div>
            {!list ? <p className="text-xs text-slate-500">Hesaplanıyor…</p>
              : list.list.length === 0 ? <p className="text-xs text-slate-500">Uygun kimse yok. Herkesin o gün vardiyası ya da izni var veya o gün çalışamıyor.</p>
              : (
                <List>
                  {list.list.map((c: any, i: number, arr: any[]) => (
                    <Fragment key={c.personnel_id}>
                      {c.other_branch && !arr[i - 1]?.other_branch && <li className="px-3 pb-1 pt-3 text-xs font-semibold text-slate-500">Diğer şubelerden</li>}
                      <li className="flex items-center gap-3 px-3 py-2.5">
                        <Avatar name={c.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                          <p className={`text-xs ${c.warnings.length > 0 ? "text-amber-700" : "text-slate-500"}`}>
                            {c.warnings.length > 0 ? c.warnings.join(" · ") : candidateLine(c)}
                          </p>
                        </div>
                        <button disabled={busy} onClick={() => assign(c)}
                          className="min-h-[36px] shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                          Yaz
                        </button>
                      </li>
                    </Fragment>
                  ))}
                </List>
              )}
          </section>
        )}
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      </div>
    </Sheet>
  );
}

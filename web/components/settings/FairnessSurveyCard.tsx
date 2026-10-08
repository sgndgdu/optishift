"use client";

/**
 * Ayarlar › Adalet Puanı › Ekip anketi (lib/fairnessSurvey, /api/fairness-surveys).
 * Hesap sahibi anketi başlatır; ekip son haftalarda çalıştığı vardiya ve günleri 1-10 arası puanlar. Sonuç anket
 * kapanınca görünür (açıkken sadece cevap sayısı). Hesap sahibi ekibin değerini tek dokunuşla uygular. Altta Adalet
 * Puanı kurallarındaki bütün değişikliklerin kaydı (kim, ne zaman, ne).
 */
import { useCallback, useEffect, useState } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDateTR } from "@/lib/date";
import { DAY_NAMES_TR } from "@/lib/fairness";
import { AGREEMENT_LABEL, FAIRNESS_OPTIONS, type Agreement, type SurveyResults } from "@/lib/fairnessSurvey";

type Change = { source: string; summary: string; changed_by_name: string | null; created_at: number };
type Data = {
  can_manage: boolean; min_responses: number; eligible: number; has_shifts: boolean;
  open: { id: number; created_at: number; closes_at: number; days_left: number; responses: number; created_by_name: string | null } | null;
  last: {
    id: number; created_at: number; closed_at: number; applied: { shifts: Record<string, { from: number; to: number }>; days: Record<string, { from: number; to: number }> } | null;
    applied_by_name: string | null; applied_at: number | null; results: SurveyResults;
    current_shifts: Record<string, number>; current_days: number[];
  } | null;
  history: { id: number; created_at: number; closed_at: number; responses: number; applied_at: number | null }[];
  changes: Change[];
};

const dateOf = (sec: number) => formatDateTR(new Date(sec * 1000).toISOString().slice(0, 10), { weekday: false });
const btn = "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50";
const primary = `${btn} bg-forest-700 text-white hover:bg-forest-800`;
const secondary = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const agreeTone = (a: Agreement) => (a === "split" ? "attention" : a === "mixed" ? "neutral" : "positive") as "attention" | "neutral" | "positive";

export function FairnessSurveyCard({ locationId, blocked }: { locationId: string; blocked: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showChanges, setShowChanges] = useState(false);

  const load = useCallback(() => {
    if (!locationId) return Promise.resolve();
    return fetch(`/api/fairness-surveys?location_id=${locationId}`).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setData(d); }).catch(() => {});
  }, [locationId]);
  useEffect(() => { load(); }, [load]);

  async function call(method: "POST" | "PATCH", body: Record<string, unknown>, reloadPage = false) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/fairness-surveys", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? "İşlem yapılamadı"); return; }
      // Uygulanan değerler vardiya tanımına ve zor günlere yazıldı: ayarlar ekranı yeni değerlerle yeniden açılır
      if (reloadPage) { window.location.reload(); return; }
      await load();
    } finally { setBusy(false); }
  }

  if (!data) return null;
  const { open, last } = data;
  const res = last?.results;
  const remainingDays = open?.days_left ?? 0;

  const shiftDiffs = res?.enough ? res.shifts.filter(s => s.median !== null && s.median !== last!.current_shifts[s.id]) : [];
  const dayDiffs = res?.enough ? res.days.filter(d => d.suggested !== null && d.suggested !== last!.current_days[d.day]) : [];
  const unfairShare = res && res.unfair.count ? (res.unfair.yes + res.unfair.partly) / res.unfair.count : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 pt-3">
        <h3 className="text-sm font-semibold text-slate-900">Ekip anketi</h3>
      </div>
      <div className="px-4 py-3 space-y-4 text-sm">
        <p className="text-xs text-slate-500">
          Ekip, son haftalarda çalıştığı vardiyaların ve günlerin ne kadar zor olduğunu 1&apos;den 10&apos;a kadar puanlar. Herkes sadece çalıştığı vardiyayı puanlayabilir. Kimin ne cevap verdiği görünmez. Sonuç, cevapların ortadaki değeridir, bu yüzden bir iki kişinin uç cevabı sonucu değiştirmez. Değerleri siz uygularsınız, ekip uygulanan değeri görür.
        </p>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

        {/* Açık anket */}
        {open ? (
          <div className="rounded-xl border border-forest-100 bg-forest-50 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="positive">Anket açık</StatusPill>
              <span className="text-xs text-forest-800">{remainingDays > 0 ? `${remainingDays} gün sonra kapanır` : "Bugün kapanır"}</span>
            </div>
            <p className="text-sm text-forest-900"><b className="tabular-nums">{open.responses}</b> kişi cevapladı. Cevap verebilecek {data.eligible} kişi var.</p>
            <p className="text-xs text-forest-700">Sonuç anket kapanınca görünür. Anket açıkken her cevaptan sonra sonuca bakılırsa kimin ne dediği anlaşılabilir.</p>
            {data.can_manage && (
              <button className={secondary} disabled={busy} onClick={() => call("PATCH", { id: open.id, action: "close" })}>Anketi şimdi kapat</button>
            )}
          </div>
        ) : data.can_manage ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            {!data.has_shifts ? (
              <p className="text-xs text-slate-600">Anket için önce vardiyaları tanımlayın.</p>
            ) : data.eligible < data.min_responses ? (
              <p className="text-xs text-slate-600">Son haftalarda bu şubede yayınlanmış planda çalışan {data.eligible} kişi var. Sonucun gizli kalması için en az {data.min_responses} kişinin cevap verebilmesi gerekir.</p>
            ) : (
              <>
                <p className="text-xs text-slate-600">Son haftalarda çalışan {data.eligible} kişiye bildirim gider.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600" htmlFor="survey-days">Anket ne kadar açık kalsın?</label>
                  <select id="survey-days" value={days} onChange={e => setDays(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                    {[3, 7, 14].map(d => <option key={d} value={d}>{d} gün</option>)}
                  </select>
                  <button className={primary} disabled={busy} onClick={() => call("POST", { location_id: locationId, days })}>Anketi başlat</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Anketi hesap sahibi başlatır.</p>
        )}

        {/* Son kapanan anketin sonucu */}
        {last && res && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Son anketin sonucu</p>
              <span className="text-xs text-slate-500">{dateOf(last.closed_at)} tarihinde kapandı · {res.responses} cevap</span>
              {last.applied_at && <StatusPill tone="info">{dateOf(last.applied_at)} tarihinde uygulandı{last.applied_by_name ? ` · ${last.applied_by_name}` : ""}</StatusPill>}
            </div>

            {!res.enough ? (
              <p className="text-xs text-slate-600">Yeterli cevap gelmedi. Sonucun gizli kalması için en az {data.min_responses} cevap gerekir, sonuç gösterilmiyor.</p>
            ) : (
              <>
                {/* Vardiyaların zorluğu */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vardiyaların zorluğu (1-10)</p>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {res.shifts.map(s => {
                      const current = last.current_shifts[s.id];
                      const deleted = current === undefined;
                      return (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                          <div className="min-w-[9rem] flex-1">
                            <p className="font-semibold text-slate-800">{s.name} <span className="font-normal text-slate-400 tabular-nums">{s.start}-{s.end}</span></p>
                            {s.reasons.length > 0 && <p className="text-xs text-slate-500">En çok: {s.reasons.slice(0, 3).map(r => `${r.label} (${r.count})`).join(", ")}</p>}
                          </div>
                          {s.median === null ? (
                            <span className="text-xs text-slate-400">{s.count} kişi puanladı, sonuç gizli</span>
                          ) : (
                            <>
                              <span className="text-xs text-slate-500 tabular-nums">Şu an <b className="text-slate-800">{deleted ? "silinmiş" : current}</b></span>
                              <span className="text-xs text-slate-500 tabular-nums">Ekip <b className="text-slate-800">{s.median}</b></span>
                              <StatusPill tone={agreeTone(s.agreement)}>{AGREEMENT_LABEL[s.agreement]}</StatusPill>
                              <span className="text-xs text-slate-400 tabular-nums">{s.count} kişi</span>
                              {data.can_manage && !deleted && s.median !== current && (
                                <button className={primary} disabled={busy || blocked}
                                  onClick={() => call("PATCH", { id: last.id, action: "apply", shifts: { [s.id]: s.median } }, true)}>
                                  {s.median} yap
                                </button>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {res.shifts.some(s => s.agreement === "split") && (
                    <p className="text-xs text-amber-700">Ekip bazı vardiyalarda ikiye bölünmüş. Değeri uygulamadan önce ekiple konuşmanızı öneririz.</p>
                  )}
                </div>

                {/* Günlerin zorluğu */}
                {res.days.some(d => d.median !== null) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Günler</p>
                    <p className="text-xs text-slate-500">5 normal gün sayılır, ekibin verdiği puanın 5&apos;ten fazla olan her birimi 1 ek puan önerir. Örnek: ekip Cumartesi&apos;ye 9 dediyse +4 önerilir.</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {res.days.map(d => (
                        <div key={d.day} className="rounded-xl border border-slate-200 px-3 py-2">
                          <p className="text-xs font-semibold text-slate-700">{DAY_NAMES_TR[d.day]}</p>
                          {d.median === null ? (
                            <p className="text-xs text-slate-400">{d.count > 0 ? "Sonuç gizli" : "Cevap yok"}</p>
                          ) : (
                            <p className="text-xs text-slate-500 tabular-nums">Ekip {d.median} · öneri +{d.suggested} · şu an +{last.current_days[d.day]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    {data.can_manage && dayDiffs.length > 0 && (
                      <button className={primary} disabled={busy || blocked}
                        onClick={() => call("PATCH", { id: last.id, action: "apply", days: Object.fromEntries(dayDiffs.map(d => [d.day, d.suggested])) }, true)}>
                        Önerilen gün puanlarını uygula ({dayDiffs.map(d => DAY_NAMES_TR[d.day]).join(", ")})
                      </button>
                    )}
                  </div>
                )}

                {data.can_manage && shiftDiffs.length > 1 && (
                  <button className={secondary} disabled={busy || blocked}
                    onClick={() => call("PATCH", { id: last.id, action: "apply", shifts: Object.fromEntries(shiftDiffs.filter(s => last.current_shifts[s.id] !== undefined).map(s => [s.id, s.median])) }, true)}>
                    Bütün vardiyalarda ekibin değerini uygula
                  </button>
                )}
                {blocked && <p className="text-xs text-amber-700">Önce aşağıdaki kaydedilmemiş değişiklikleri kaydedin.</p>}

                {/* Adalet algısı */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ekip ne düşünüyor?</p>
                  {res.fairness.count > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm text-slate-800">{res.fairness.count} kişiden {res.fairness.positive} kişi zor vardiyaların ekipte adil dağıtıldığını düşünüyor.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {FAIRNESS_OPTIONS.map((label, i) => (
                          <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{label}: <b className="tabular-nums">{res.fairness.dist[i]}</b></span>
                        ))}
                      </div>
                    </div>
                  )}
                  {res.unfair.count > 0 && (
                    <p className={unfairShare >= 1 / 3 ? "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" : "text-sm text-slate-700"}>
                      {res.unfair.count} kişiden {res.unfair.yes} kişi son haftalarda planda kendisine haksızlık yapıldığını hissettiğini, {res.unfair.partly} kişi bazen hissettiğini söyledi.
                      {unfairShare >= 1 / 3 && " Bu oran yüksek. Adalet Puanı raporundaki elle yapılan değişikliklere bakmanızı öneririz."}
                    </p>
                  )}
                  {res.wishes.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">Planlamada değişmesini istedikleri:</p>
                      <ul className="space-y-0.5 text-sm text-slate-700">
                        {res.wishes.map(w => <li key={w.label}>{w.label} <span className="text-slate-400 tabular-nums">({w.count})</span></li>)}
                      </ul>
                    </div>
                  )}
                  {res.comments.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">Yazılan görüşler (sıraları karıştırıldı):</p>
                      <ul className="space-y-1.5">
                        {res.comments.map((c, i) => <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{c}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {data.history.length > 1 && (
          <p className="text-xs text-slate-400">Önceki anketler: {data.history.slice(1).map(h => `${dateOf(h.closed_at)} (${h.responses} cevap${h.applied_at ? ", uygulandı" : ""})`).join(" · ")}</p>
        )}

        {/* Kural değişiklikleri kaydı */}
        <div className="border-t border-slate-100 pt-3">
          <button className="text-xs font-semibold text-forest-700" onClick={() => setShowChanges(v => !v)} aria-expanded={showChanges}>
            {showChanges ? "Puan kurallarındaki değişiklikleri gizle" : `Puan kurallarındaki değişiklikleri göster${data.changes.length ? ` (${data.changes.length})` : ""}`}
          </button>
          {showChanges && (
            data.changes.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Henüz kayıtlı değişiklik yok. Bundan sonra vardiya zorluğu, zor günler ve ek puanlardaki her değişiklik burada görünür.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {data.changes.map((c, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="text-slate-400">{dateOf(c.created_at)}{c.changed_by_name ? ` · ${c.changed_by_name}` : ""} · </span>{c.summary}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </div>
  );
}

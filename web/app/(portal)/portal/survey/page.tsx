"use client";

/**
 * Portal › Anket: ekip üyesi çalıştığı vardiyaların ve günlerin zorluğunu puanlar (lib/fairnessSurvey,
 * /api/fairness-surveys/mine). Kapanmış son anketin sonucu (ekibin değeri ve uygulanan değer) ve Adalet Puanı
 * kurallarındaki değişiklikler de burada görünür.
 */
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { usePortalAuth } from "@/hooks/useAuth";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { formatDateTR } from "@/lib/date";
import { DAY_NAMES_TR } from "@/lib/fairness";
import { FAIRNESS_OPTIONS, SURVEY_MIN_RESPONSES, UNFAIR_OPTIONS, WISH_OPTIONS, type SurveyAnswers, type UnfairAnswer } from "@/lib/fairnessSurvey";
import { cn } from "@/lib/utils";

type OpenSurvey = {
  survey_id: number; location_name: string; closes_at: number; days_left: number;
  shifts: { id: string; name: string; start: string; end: string }[];
  days: number[]; reasons: string[]; answered: boolean; answers: SurveyAnswers | null;
};
type Result = {
  location_name: string; closed_at: number; responses: number; enough: boolean; applied_at: number | null;
  shifts: { name: string; team: number | null; suggested: number | null; current: number | null }[];
  days: { day: number; team: number | null; suggested: number | null; current: number }[];
  fairness: { count: number; positive: number };
};
type Change = { summary: string; changed_by_name: string | null; created_at: number; location_name: string };

const dateOf = (sec: number) => formatDateTR(new Date(sec * 1000).toISOString().slice(0, 10), { weekday: false });
const emptyAnswers = (): SurveyAnswers => ({ shifts: {}, days: Array(7).fill(null), fairness: null, unfair: null, wishes: [], comment: "" });

function Scale({ value, onChange, label }: { value: number | null | undefined; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)}
          className={cn("h-11 min-w-11 rounded-xl border text-sm font-semibold tabular-nums transition-colors",
            value === n ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
          {n}
        </button>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("min-h-[40px] rounded-full border px-3 py-1.5 text-sm transition-colors",
        on ? "border-primary bg-forest-50 font-semibold text-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
      {children}
    </button>
  );
}

function SurveyForm({ s, onSaved }: { s: OpenSurvey; onSaved: () => void }) {
  const [a, setA] = useState<SurveyAnswers>(() => ({ ...emptyAnswers(), ...(s.answers ?? {}) }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const daysLeft = s.days_left;

  const setShift = (id: string, patch: Partial<{ rating: number; reasons: string[] }>) =>
    setA(prev => ({ ...prev, shifts: { ...prev.shifts, [id]: { rating: prev.shifts[id]?.rating ?? 0, reasons: prev.shifts[id]?.reasons ?? [], ...patch } } }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  async function submit() {
    setSaving(true); setMsg(null);
    // Puan verilmemiş vardiyanın sadece nedeni seçildiyse gönderilmez
    const shifts = Object.fromEntries(Object.entries(a.shifts).filter(([, v]) => v.rating >= 1));
    try {
      const r = await fetch("/api/fairness-surveys/mine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_id: s.survey_id, answers: { ...a, shifts } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Gönderilemedi" }); return; }
      setMsg({ ok: true, text: "Cevabınız kaydedildi. Anket kapanana kadar değiştirebilirsiniz." });
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{s.location_name}</h2>
        <span className="text-xs text-slate-500">{daysLeft > 0 ? `${daysLeft} gün sonra kapanır` : "Bugün kapanır"}{s.answered ? " · Cevapladınız" : ""}</span>
      </div>

      {s.shifts.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">1. Vardiyalar ne kadar zor?</h3>
          <p className="text-xs text-slate-500">1 çok kolay, 10 çok zor. Sadece son haftalarda çalıştığınız vardiyalar listelenir.</p>
          {s.shifts.map(sh => (
            <div key={sh.id} className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">{sh.name} <span className="font-normal text-slate-400 tabular-nums">{sh.start}-{sh.end}</span></p>
              <Scale value={a.shifts[sh.id]?.rating} onChange={v => setShift(sh.id, { rating: v })} label={`${sh.name} zorluğu`} />
              <p className="text-xs text-slate-500">Bu vardiyayı en çok ne zorlaştırıyor? (isteğe bağlı, birden fazla seçebilirsiniz)</p>
              <div className="flex flex-wrap gap-1.5">
                {s.reasons.map(r => (
                  <Chip key={r} on={!!a.shifts[sh.id]?.reasons.includes(r)} onClick={() => setShift(sh.id, { reasons: toggle(a.shifts[sh.id]?.reasons ?? [], r) })}>{r}</Chip>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {s.days.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">2. Hangi günlerde çalışmak daha zor?</h3>
          <p className="text-xs text-slate-500">1 çok kolay, 10 çok zor. Sadece çalıştığınız günler listelenir.</p>
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            {s.days.map(d => (
              <div key={d} className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-700">{DAY_NAMES_TR[d]}</p>
                <Scale value={a.days[d]} onChange={v => setA(prev => ({ ...prev, days: prev.days.map((x, i) => (i === d ? v : x)) }))} label={`${DAY_NAMES_TR[d]} zorluğu`} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">3. Zor vardiyalar ekipte adil dağıtılıyor mu?</h3>
        <div className="flex flex-wrap gap-1.5">
          {FAIRNESS_OPTIONS.map((label, i) => (
            <Chip key={label} on={a.fairness === i + 1} onClick={() => setA(prev => ({ ...prev, fairness: i + 1 }))}>{label}</Chip>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">4. Son haftalarda planda size haksızlık yapıldığını hissettiniz mi?</h3>
        <div className="flex flex-wrap gap-1.5">
          {UNFAIR_OPTIONS.map(o => (
            <Chip key={o.value} on={a.unfair === o.value} onClick={() => setA(prev => ({ ...prev, unfair: o.value as UnfairAnswer }))}>{o.label}</Chip>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">5. Planlamada neyin değişmesini isterdiniz?</h3>
        <p className="text-xs text-slate-500">İsteğe bağlı, birden fazla seçebilirsiniz.</p>
        <div className="flex flex-wrap gap-1.5">
          {WISH_OPTIONS.map(w => <Chip key={w} on={a.wishes.includes(w)} onClick={() => setA(prev => ({ ...prev, wishes: toggle(prev.wishes, w) }))}>{w}</Chip>)}
        </div>
      </section>

      <section className="space-y-2">
        <label htmlFor={`comment-${s.survey_id}`} className="text-sm font-semibold text-slate-800">6. Eklemek istediğiniz bir şey var mı?</label>
        <p className="text-xs text-slate-500">Yazdığınız metin olduğu gibi gösterilir. Gizli kalmak istiyorsanız adınızı ya da sizi tanıtacak bir ayrıntı yazmayın.</p>
        <textarea id={`comment-${s.survey_id}`} value={a.comment} maxLength={500} rows={3}
          onChange={e => setA(prev => ({ ...prev, comment: e.target.value }))}
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </section>

      {msg && <p className={cn("rounded-xl px-3 py-2 text-sm font-semibold", msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{msg.text}</p>}
      <button onClick={submit} disabled={saving}
        className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white transition-colors hover:bg-forest-800 disabled:opacity-60 sm:w-auto sm:px-8">
        {saving ? "Gönderiliyor…" : s.answered ? "Cevabımı güncelle" : "Gönder"}
      </button>
    </div>
  );
}

export default function PortalSurveyPage() {
  const { user } = usePortalAuth();
  const [data, setData] = useState<{ open: OpenSurvey[]; results: Result[]; changes: Change[]; multi_branch: boolean } | null>(null);

  const load = useCallback(() => {
    fetch("/api/fairness-surveys/mine").then(r => (r.ok ? r.json() : null)).then(d => { if (d) setData(d); }).catch(() => {});
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  return (
    <Page width="narrow">
      <PageHeader title="Vardiya anketi" description="Vardiyaların ne kadar zor olduğunu ekip birlikte belirler." />

      <div className="flex gap-3 rounded-2xl border border-forest-100 bg-forest-50 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-forest-600" />
        <p className="text-sm text-forest-800">
          Cevabınız gizlidir. Sorumlunuz ve hesap sahibi kimin ne cevap verdiğini göremez, sadece ekibin toplu sonucunu görür. En az {SURVEY_MIN_RESPONSES} kişi cevap vermeden sonuç gösterilmez. Sonuç, cevapların ortadaki değeridir, bu yüzden tek bir kişinin cevabı sonucu belirleyemez.
        </p>
      </div>

      {!data ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <>
          {data.open.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Şu an açık bir anket yok. Anket başlayınca bildirim gelir.</p>
          ) : (
            data.open.map(s => <SurveyForm key={s.survey_id} s={s} onSaved={load} />)
          )}

          {data.results.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">Son anketin sonucu</h2>
              {data.results.map(r => (
                <div key={r.location_name + r.closed_at} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">{data.multi_branch ? `${r.location_name} · ` : ""}{dateOf(r.closed_at)} tarihinde kapandı · {r.responses} cevap{r.applied_at ? ` · ${dateOf(r.applied_at)} tarihinde uygulandı` : " · henüz uygulanmadı"}</p>
                  {!r.enough ? (
                    <p className="text-sm text-slate-600">Yeterli cevap gelmediği için sonuç gösterilmiyor.</p>
                  ) : (
                    <>
                      <ul className="divide-y divide-slate-100">
                        {r.shifts.filter(s => s.team !== null).map(s => (
                          <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                            <span className="font-semibold text-slate-800">{s.name}</span>
                            <span className="text-slate-600 tabular-nums">Ekibin değeri {s.team}, öneri %{s.suggested ?? 0} · şu an {s.current === null ? "-" : `%${s.current}`}</span>
                          </li>
                        ))}
                        {r.days.filter(d => d.team !== null && (d.suggested !== 0 || d.current !== 0)).map(d => (
                          <li key={d.day} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                            <span className="font-semibold text-slate-800">{DAY_NAMES_TR[d.day]}</span>
                            <span className="text-slate-600 tabular-nums">Ekibin önerisi %{d.suggested} · şu an %{d.current}</span>
                          </li>
                        ))}
                      </ul>
                      {r.fairness.count > 0 && <p className="text-sm text-slate-700">{r.fairness.count} kişiden {r.fairness.positive} kişi zor vardiyaların adil dağıtıldığını düşünüyor.</p>}
                    </>
                  )}
                </div>
              ))}
            </section>
          )}

          {data.changes.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">Puan kurallarındaki değişiklikler</h2>
              <p className="text-xs text-slate-500">Vardiya zorluğu, zor günler ve ek puanlarda yapılan her değişiklik burada görünür.</p>
              <ul className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4">
                {data.changes.map((c, i) => (
                  <li key={i} className="text-sm text-slate-700">
                    <span className="text-xs text-slate-400">{dateOf(c.created_at)}{data.multi_branch ? ` · ${c.location_name}` : ""}{c.changed_by_name ? ` · ${c.changed_by_name}` : ""}</span>
                    <br />{c.summary}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Page>
  );
}

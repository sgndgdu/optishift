"use client";

import { Check, Bell, Sparkles, ArrowUp, AlertTriangle, ArrowLeftRight, CalendarX, X, LifeBuoy, ChevronRight, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ürün turu sahneleri: video değil, kodla çizilmiş ekranlar. Her sahne tek bir zamana (t, ms) göre
 * kendini çizer; ProductTour saati yürütür. Böylece her ekranda net, her an aynı ve telefonda okunur.
 * Veriler örnek (vitrin: Moda Kahve), görünüm uygulamadaki ekranlara benzer tutuldu.
 */

export type SceneProps = { t: number; small: boolean };
export type Scene = {
  duration: number;
  /** Adım başlıkları: t anından itibaren gösterilir */
  steps: { t: number; text: string }[];
  Component: (p: SceneProps) => React.ReactElement;
};

const after = (t: number, a: number) => t >= a;
const between = (t: number, a: number, b: number) => t >= a && t < b;

/** Basılan düğme: hafif içe çöker, parmak izi halkası */
function Btn({ pressed, className, children }: { pressed?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-transform duration-150", pressed && "scale-95", className)}>
      {children}
      {pressed && <span className="tap-dot" />}
    </span>
  );
}

const SHIFTS = {
  A: { label: "Açılış", time: "07-15", tone: "bg-forest-100 text-forest-800" },
  R: { label: "Ara", time: "11-19", tone: "bg-sky-100 text-sky-800" },
  K: { label: "Kapanış", time: "15-23", tone: "bg-ember-100 text-ember-800" },
} as const;
type Code = keyof typeof SHIFTS | null;

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const TEAM: { name: string; role: string; days: Code[] }[] = [
  { name: "Elif K.", role: "Barista", days: ["A", "A", null, "K", "K", "A", null] },
  { name: "Burak T.", role: "Barista", days: ["K", "K", "A", null, "A", "K", "K"] },
  { name: "Selin A.", role: "Kasa", days: ["R", null, "A", "A", "K", null, "R"] },
  { name: "Mert Y.", role: "Servis", days: ["A", "R", "K", "K", null, "R", "A"] },
  { name: "Deniz Ö.", role: "Servis", days: [null, "K", "R", "A", "R", "A", "K"] },
];

/* ─── 1. Plan ─────────────────────────────────────────────── */
const P_BUILD = 2200, P_CELL = 330, P_PUBLISH = 7600;

function PlanScene({ t, small }: SceneProps) {
  const days = small ? 4 : 7;
  const cellAt = (d: number, r: number) => P_BUILD + d * P_CELL + r * 55;
  const built = cellAt(days - 1, TEAM.length - 1) + 300;
  const published = after(t, P_PUBLISH + 250);
  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-slate-400">Gelecek hafta</p>
          <p className="text-[15px] font-semibold text-slate-900 sm:text-base">13-19 Ekim</p>
        </div>
        {t < P_BUILD ? (
          <Btn pressed={between(t, 1500, 1900)} className="bg-forest-700 text-white"><Sparkles size={14} /> Planı oluştur</Btn>
        ) : t < built ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-medium text-slate-600">
            <span className="m-pulse-dot h-2 w-2 rounded-full bg-ember-500" /> Plan hazırlanıyor
          </span>
        ) : !published ? (
          <Btn pressed={between(t, P_PUBLISH - 350, P_PUBLISH + 250)} className="m-enter bg-ember-400 text-forest-900">Yayınla</Btn>
        ) : (
          <span className="sc-pop inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1.5 text-[13px] font-semibold text-forest-700"><Check size={14} strokeWidth={3} /> Yayında</span>
        )}
      </div>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `${small ? 84 : 120}px repeat(${days}, minmax(0,1fr))` }}>
        <div />
        {DAYS.slice(0, days).map((d, i) => (
          <div key={d} className={cn("pb-1 text-center text-[12px] font-medium", i >= 5 ? "text-ember-600" : "text-slate-400")}>{d}</div>
        ))}
        {TEAM.map((p, r) => (
          <Row key={p.name} name={p.name} role={p.role}>
            {p.days.slice(0, days).map((c, d) => {
              const on = after(t, cellAt(d, r));
              const s = c ? SHIFTS[c] : null;
              return (
                <div key={d} className="h-10 min-w-0 rounded-lg bg-slate-50">
                  {on && (
                    <div className={cn("sc-pop flex h-full items-center justify-center rounded-lg text-[12px] font-semibold", s ? s.tone : "text-slate-300")}>
                      {s ? s.label : "izin"}
                    </div>
                  )}
                </div>
              );
            })}
          </Row>
        ))}
        <div className="flex items-center pt-1 text-[12px] font-medium text-slate-400">İhtiyaç</div>
        {DAYS.slice(0, days).map((d, i) => {
          const full = after(t, cellAt(i, TEAM.length - 1) + 150);
          return (
            <div key={d} className={cn("pt-1 text-center text-[12px] font-semibold transition-colors duration-300", full ? "text-forest-600" : "text-slate-300")}>
              {full ? <><Check size={12} strokeWidth={3} className="-mt-0.5 inline" /> tam</> : "boş"}
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex justify-center pt-4">
        {published && (
          <div className="m-enter flex items-center gap-3 rounded-2xl bg-forest-900 px-4 py-3 text-white shadow-lg">
            <Bell size={16} className="text-ember-300" />
            <span className="text-[13px] font-medium">21 kişiye bildirim gitti</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ name, role, children }: { name: string; role: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 sm:flex">
          {name.split(" ").map((x) => x[0]).join("")}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-slate-800">{name}</span>
          <span className="block truncate text-[11px] text-slate-400">{role}</span>
        </span>
      </div>
      {children}
    </>
  );
}

/* ─── 2. Ekip telefonu ────────────────────────────────────── */
function PhoneScene({ t }: SceneProps) {
  const banner = between(t, 900, 2900);
  const week = after(t, 2900);
  const sheet = after(t, 6200);
  const me = TEAM[0];
  return (
    <div className="relative h-full overflow-hidden bg-cream">
      <div className="absolute left-1/2 top-2.5 z-30 h-5 w-20 -translate-x-1/2 rounded-full bg-slate-900" />

      {/* Bildirim */}
      <div className={cn("absolute inset-x-3 top-10 z-20 transition-all duration-500", banner ? "translate-y-0 opacity-100" : "-translate-y-24 opacity-0")}>
        <div className={cn("relative flex items-start gap-3 rounded-2xl bg-white/95 p-3 shadow-[0_16px_40px_-12px_rgba(10,33,30,0.45)] ring-1 ring-slate-900/5 transition-transform", between(t, 2400, 2900) && "scale-95")}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ember-100 text-ember-700"><Bell size={16} /></span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-slate-900">Vardiya programı yayınlandı</span>
            <span className="block text-[12px] text-slate-500">13-19 Ekim haftanız hazır.</span>
          </span>
          {between(t, 2400, 2900) && <span className="tap-dot" />}
        </div>
      </div>

      <div className="px-4 pb-4 pt-12">
        <p className="text-[12px] text-slate-500">Günaydın</p>
        <p className="text-lg font-bold text-slate-900">Elif</p>

        {!week ? (
          <div className="mt-4 rounded-2xl bg-white p-4 text-[13px] text-slate-400 ring-1 ring-slate-900/5">Gelecek haftanın planı henüz yayınlanmadı.</div>
        ) : (
          <>
            <p className="m-enter mb-2 mt-4 text-[13px] font-semibold text-slate-500">Haftanız · 13-19 Ekim</p>
            <div className="space-y-1.5">
              {me.days.map((c, i) => {
                const s = c ? SHIFTS[c] : null;
                const pick = i === 4 && between(t, 5700, 6200);
                return (
                  <div
                    key={i}
                    className={cn("m-enter relative flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-slate-900/5 transition-transform", pick && "scale-[0.97]", i === 4 && sheet && "ring-2 ring-ember-400")}
                    style={{ animationDelay: `${120 + i * 70}ms` }}
                  >
                    <span className="text-[13px] font-semibold text-slate-700">{DAYS[i]}</span>
                    {s ? (
                      <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-semibold", s.tone)}>{s.label} {s.time}</span>
                    ) : (
                      <span className="text-[12px] text-slate-400">İzinli</span>
                    )}
                    {pick && <span className="tap-dot" />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Gün ayrıntısı */}
      <div className={cn("absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white p-4 shadow-[0_-20px_40px_-20px_rgba(10,33,30,0.35)] transition-transform duration-500", sheet ? "translate-y-0" : "translate-y-full")}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <p className="text-[15px] font-bold text-slate-900">Cuma · Kapanış</p>
        <p className="text-[13px] text-slate-500">15:00 - 23:00 · Barista</p>
        <p className="mb-2 mt-3 text-[12px] font-semibold text-slate-500">Birlikte çalışacağınız</p>
        <div className="flex flex-wrap gap-1.5">
          {["Selin A. · Kasa", "Deniz Ö. · Servis"].map((x) => (
            <span key={x} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-700">{x}</span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Btn pressed={between(t, 8600, 9100)} className="bg-forest-700 text-white"><ArrowLeftRight size={14} /> Değiştir</Btn>
          <Btn className="bg-slate-100 text-slate-700"><CalendarX size={14} /> Gelemiyorum</Btn>
        </div>
        {after(t, 9100) && (
          <p className="m-enter mt-3 flex items-center gap-1.5 text-[12px] font-medium text-forest-700"><Check size={13} strokeWidth={3} /> Uygun 3 arkadaşınıza teklif gitti</p>
        )}
      </div>
    </div>
  );
}

/* ─── 3. Onaylar ──────────────────────────────────────────── */
type Req = { who: string; kind: string; detail: string; check: number; act: number; ok: boolean; note: string; done: string };
const REQS: Req[] = [
  { who: "Selin A.", kind: "İzin", detail: "Çarşamba ve Perşembe · yıllık izin", check: 900, act: 3200, ok: true, note: "Plan bozulmuyor, yerine Deniz Ö. uygun", done: "Onaylandı" },
  { who: "Mert Y.", kind: "Vardiya değiştirme", detail: "Cuma kapanışını Burak T. ile değiştirmek istiyor", check: 4200, act: 7200, ok: false, note: "Burak cumartesi 07:00'de açılışta: arada sadece 8 saat dinlenme kalır", done: "Reddedildi, gerekçesi Mert'e iletildi" },
  { who: "Deniz Ö.", kind: "İzin", detail: "Pazar · mazeret izni", check: 8200, act: 9800, ok: true, note: "Pazar ihtiyacı yine karşılanıyor", done: "Onaylandı" },
];

function ApprovalsScene({ t }: SceneProps) {
  const left = REQS.filter((r) => t < r.act + 300).length;
  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-base font-semibold text-slate-900">Bekleyen istekler</p>
        <span key={left} className="sc-pop rounded-full bg-ember-100 px-2.5 py-0.5 text-[13px] font-bold text-ember-800">{left}</span>
      </div>
      <div className="space-y-2.5">
        {REQS.map((r) => {
          const checking = between(t, r.check, r.check + 700);
          const checked = after(t, r.check + 700);
          const done = after(t, r.act + 300);
          return (
            <div key={r.who} className={cn("rounded-2xl p-3.5 ring-1 transition-colors duration-500", done ? (r.ok ? "bg-forest-50/70 ring-forest-200" : "bg-slate-50 ring-slate-200") : "bg-white ring-slate-900/10")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-slate-900">{r.who} <span className="font-normal text-slate-400">· {r.kind}</span></p>
                  <p className="text-[13px] text-slate-500">{r.detail}</p>
                </div>
                {done && (
                  <span className={cn("sc-pop flex h-7 w-7 shrink-0 items-center justify-center rounded-full", r.ok ? "bg-forest-600 text-white" : "bg-slate-300 text-white")}>
                    {r.ok ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                  </span>
                )}
              </div>
              {checking && <p className="mt-2 flex items-center gap-2 text-[12.5px] text-slate-400"><span className="m-pulse-dot h-1.5 w-1.5 rounded-full bg-ember-500" /> Kurallara bakılıyor</p>}
              {checked && !done && (
                <div className="m-enter mt-2.5">
                  <p className={cn("flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium", r.ok ? "bg-forest-50 text-forest-800" : "bg-red-50 text-red-700")}>
                    {r.ok ? <Check size={14} strokeWidth={3} className="mt-px shrink-0" /> : <AlertTriangle size={14} className="mt-px shrink-0" />}
                    {r.note}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Btn pressed={r.ok && between(t, r.act - 300, r.act + 300)} className={r.ok ? "bg-forest-700 text-white" : "bg-slate-100 text-slate-400"}>Onayla</Btn>
                    <Btn pressed={!r.ok && between(t, r.act - 300, r.act + 300)} className={r.ok ? "bg-slate-100 text-slate-600" : "bg-red-600 text-white"}>Reddet</Btn>
                  </div>
                </div>
              )}
              {done && <p className={cn("m-enter mt-1.5 text-[12.5px] font-semibold", r.ok ? "text-forest-700" : "text-slate-500")}>{r.done}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 4. Biri gelemezse ───────────────────────────────────── */
const DAY_SHIFTS = [
  { name: "Burak T.", code: "A" as const },
  { name: "Selin A.", code: "A" as const },
  { name: "Deniz Ö.", code: "R" as const },
  { name: "Mert Y.", code: "K" as const },
  { name: "Ayşe D.", code: "K" as const, out: true },
];
const CANDIDATES = [
  { name: "Elif K.", best: true, why: ["\"Uygunum\" dedi", "Bu hafta 24 saat", "14 saat dinlenmiş olacak"] },
  { name: "Can B.", why: ["Uygun", "Bu hafta 42 saat, sınıra yakın"] },
  { name: "Burak T.", why: ["Aynı gün açılışta, 16 saat olur"] },
];

function CoverScene({ t }: SceneProps) {
  const msg = after(t, 800);
  const empty = after(t, 2000);
  const panel = between(t, 3700, 7500);
  const filled = after(t, 7500);
  return (
    <div className="relative flex h-full flex-col overflow-hidden p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium text-slate-400">Bugün</p>
          <p className="text-base font-semibold text-slate-900">Çarşamba, 15 Ekim</p>
        </div>
      </div>

      <div className={cn("mb-3 transition-all duration-500", msg ? "opacity-100" : "-translate-y-2 opacity-0")}>
        <div className="flex items-start gap-2.5 rounded-2xl bg-sky-50 px-3 py-2.5 ring-1 ring-sky-100">
          <MessageCircle size={16} className="mt-0.5 shrink-0 text-sky-600" />
          <p className="text-[13px] text-slate-700"><b className="font-semibold">Ayşe D.:</b> Hastayım, bu akşamki kapanışa gelemiyorum.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {DAY_SHIFTS.map((r) => {
          const s = SHIFTS[r.code];
          const out = r.out && empty && !filled;
          return (
            <div key={r.name} className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 transition-colors duration-500", out ? "bg-red-50 ring-red-200" : r.out && filled ? "bg-forest-50 ring-forest-200" : "bg-white ring-slate-900/5")}>
              <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-semibold", s.tone)}>{s.label} {s.time}</span>
              {r.out && filled ? (
                <span className="sc-pop flex items-center gap-1.5 text-[13px] font-semibold text-forest-800"><Check size={14} strokeWidth={3} /> Elif K.</span>
              ) : out ? (
                <Btn pressed={between(t, 3200, 3700)} className="bg-ember-400 py-1.5 text-forest-900"><LifeBuoy size={14} /> Yedek bul</Btn>
              ) : (
                <span className="text-[13px] font-medium text-slate-700">{r.name}</span>
              )}
            </div>
          );
        })}
      </div>

      {filled && (
        <div className="mt-auto flex justify-center pt-3">
          <div className="m-enter flex items-center gap-3 rounded-2xl bg-forest-900 px-4 py-3 text-white shadow-lg">
            <Bell size={16} className="text-ember-300" />
            <span className="text-[13px] font-medium">{"Elif'e bildirim gitti"}</span>
          </div>
        </div>
      )}

      {/* Yedek önerileri */}
      <div className={cn("absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 shadow-[0_-24px_50px_-20px_rgba(10,33,30,0.4)] ring-1 ring-slate-900/5 transition-transform duration-500 sm:p-5", panel ? "translate-y-0" : "translate-y-full")}>
        <p className="mb-2.5 text-[14px] font-semibold text-slate-900">Kapanış için en uygun yedekler</p>
        <div className="space-y-2">
          {CANDIDATES.map((c, i) => (
            <div key={c.name} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 transition-opacity", c.best ? "bg-forest-50 ring-1 ring-forest-200" : "bg-slate-50", after(t, 4100 + i * 250) ? "opacity-100" : "opacity-0")}>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-slate-900">{c.name} {c.best && <span className="ml-1 rounded-full bg-forest-600 px-2 py-0.5 text-[11px] font-semibold text-white">En uygun</span>}</p>
                <p className="truncate text-[12px] text-slate-500">{c.why.join(" · ")}</p>
              </div>
              {c.best ? (
                <Btn pressed={between(t, 6800, 7400)} className="bg-forest-700 py-1.5 text-white">Ata</Btn>
              ) : (
                <ChevronRight size={16} className="shrink-0 text-slate-300" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 5. Asistan ──────────────────────────────────────────── */
const CHAT = [
  { at: 500, q: "Bu hafta kim izinli?", a: ["Bu hafta 2 kişi izinli:", "Selin A. · Çarşamba ve Perşembe, yıllık izin", "Deniz Ö. · Pazar, mazeret izni"] },
  { at: 5200, q: "Gelecek haftanın planı hazır mı?", a: ["Taslak hazır, henüz yayınlanmadı.", "Bütün vardiyalar dolu, kural ihlali yok. Bakıp yayınlayabilirsiniz."] },
];
const TYPE_MS = 45;

function AssistantScene({ t }: SceneProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3 sm:px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-700 text-ember-300"><Sparkles size={16} /></span>
        <span>
          <span className="block text-[14px] font-semibold text-slate-900">İşletme Asistanı</span>
          <span className="block text-[12px] text-slate-400">Planınıza, ekibinize ve onaylara bakarak cevap verir</span>
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-hidden bg-slate-50/70 px-4 py-4 sm:px-5">
        {CHAT.map((c) => {
          if (t < c.at) return null;
          const typed = Math.min(c.q.length, Math.floor((t - c.at) / TYPE_MS));
          const answerAt = c.at + c.q.length * TYPE_MS + 700;
          return (
            <div key={c.q} className="space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-forest-700 px-3.5 py-2 text-[14px] text-white">
                  {c.q.slice(0, typed)}
                  {typed < c.q.length && <span className="m-caret ml-px inline-block h-[1em] w-[2px] translate-y-[2px] bg-white/80" />}
                </p>
              </div>
              {between(t, answerAt - 600, answerAt) && (
                <p className="flex items-center gap-1.5 pl-1 text-[12.5px] text-slate-400"><span className="m-pulse-dot h-1.5 w-1.5 rounded-full bg-ember-500" /> Plana bakıyor</p>
              )}
              {after(t, answerAt) && (
                <div className="m-enter flex gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700"><Sparkles size={13} /></span>
                  <div className="max-w-[88%] space-y-1 rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed ring-1 ring-slate-900/5">
                    {c.a.map((line, i) => (
                      <p key={i} className={i === 0 ? "font-semibold text-slate-900" : "text-slate-600"}>{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <span className="flex-1 truncate rounded-xl bg-slate-100 px-3.5 py-2.5 text-[13px] text-slate-400">Sorunuzu yazın…</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-700 text-white"><ArrowUp size={16} /></span>
      </div>
    </div>
  );
}

export const SCENES: Record<"plan" | "phone" | "approvals" | "cover" | "assistant", Scene> = {
  plan: {
    duration: 11500,
    Component: PlanScene,
    steps: [
      { t: 0, text: "Ekip uygunluğunu girdi, plan henüz boş" },
      { t: 1500, text: "Planı oluştur'a basarsınız" },
      { t: P_BUILD, text: "Plan kurallara ve ihtiyaca göre hazırlanır" },
      { t: 6300, text: "Her günde gereken kişi sayısı tamam" },
      { t: P_PUBLISH - 500, text: "Planı yayınlarsınız, ekibe bildirim gider" },
    ],
  },
  phone: {
    duration: 11500,
    Component: PhoneScene,
    steps: [
      { t: 0, text: "Plan yayınlanınca bildirim gelir" },
      { t: 2900, text: "Haftanın bütün vardiyaları tek ekranda" },
      { t: 5700, text: "Aynı vardiyada kimlerle çalışacağı görünür" },
      { t: 8300, text: "Değiştirme isteği tek dokunuşla gönderilir" },
    ],
  },
  approvals: {
    duration: 12000,
    Component: ApprovalsScene,
    steps: [
      { t: 0, text: "İzin isteği kurallara göre kontrol edilir" },
      { t: 2700, text: "Sorun yoksa onaylarsınız" },
      { t: 4200, text: "Kurala uymayan değişiklik isteği işaretlenir" },
      { t: 7000, text: "Reddedersiniz, kişiye nedeni iletilir" },
      { t: 8200, text: "Son isteği de onaylarsınız" },
    ],
  },
  cover: {
    duration: 11000,
    Component: CoverScene,
    steps: [
      { t: 0, text: "Biri son anda gelemeyeceğini yazar" },
      { t: 2000, text: "Vardiya boşta kalır" },
      { t: 3700, text: "Uygun kişiler nedenleriyle sıralanır" },
      { t: 6600, text: "Seçtiğiniz kişiyi atarsınız, ona bildirim gider" },
    ],
  },
  assistant: {
    duration: 11500,
    Component: AssistantScene,
    steps: [
      { t: 0, text: "Sorunuzu yazın" },
      { t: 2800, text: "Asistan cevabı planınızdan verir" },
      { t: 5200, text: "Gelecek haftayı da sorabilirsiniz" },
    ],
  },
};

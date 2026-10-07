import { Check, ArrowLeftRight, CalendarClock, Bell, Clock } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { DAYS, TONE_CLASSES, type Sector, type ShiftTone } from "@/components/marketing/sectors";

const BAR_CLASSES: Record<ShiftTone, string> = { forest: "bg-forest-500", ember: "bg-ember-500", sky: "bg-sky-500", violet: "bg-violet-500" };
const CHIP_CLASSES: Record<ShiftTone, string> = {
  forest: "border-forest-200 bg-forest-50 text-forest-800",
  ember: "border-ember-200 bg-ember-50 text-ember-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
};

/**
 * Tanıtım sayfalarının ürün önizlemeleri. Hepsi süs (aria-hidden), gerçek veri değil;
 * görünüm uygulamadaki ekranlara benzer tutuldu ki vaat edilen şey gösterilen şey olsun.
 */

/** Pencere çerçevesi: masaüstü uygulama hissi */
export function AppWindow({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(10,33,30,0.35)] ring-1 ring-slate-900/5 overflow-hidden", className)} aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        </div>
        <span className="text-[11px] font-medium text-slate-400">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** Haftalık vardiya planı: sektörün vardiyaları, departman başlıklarıyla kişiler ve doluluk satırı */
export function ScheduleBoard({ sector, compact = false, animate = false }: { sector: Sector; compact?: boolean; animate?: boolean }) {
  const shiftByCode = Object.fromEntries(sector.shifts.map((s) => [s.code, s]));
  const days = compact ? DAYS.slice(0, 5) : DAYS;
  // Plan sütun sütun dolar (motorun günleri sırayla kurması gibi), en sonda "Yayında" belirir
  const depts = [...new Set(sector.rows.map(r => r.dept))];
  const board = depts.flatMap(dept => sector.shifts.map(sh => ({
    dept, code: sh.code,
    days: days.map((_, d) => sector.rows.filter(r => r.dept === dept && r.days[d] === sh.code).map(r => r.name)),
  }))).filter(r => r.days.some(x => x.length > 0));
  const cellDelay = (day: number, row: number) => 350 + day * 110 + row * 35;
  const doneAt = cellDelay(days.length - 1, board.length - 1) + 250;
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{sector.location}</p>
          <p className="text-sm font-semibold text-slate-900">13-19 Ekim haftası</p>
        </div>
        <div className="relative flex items-center">
          {animate && (
            <span className="m-out absolute right-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600" style={{ "--d": `${doneAt}ms` } as React.CSSProperties}>
              <span className="m-pulse-dot h-1.5 w-1.5 rounded-full bg-ember-500" /> Plan hazırlanıyor
            </span>
          )}
          <span className={cn("inline-flex items-center gap-1 rounded-full bg-forest-50 px-2.5 py-1 text-[11px] font-semibold text-forest-700", animate && "m-pop")} style={{ "--d": `${doneAt + 150}ms` } as React.CSSProperties}>
            <Check size={11} strokeWidth={3} /> Yayında
          </span>
        </div>
      </div>

      {/* Uygulamadaki Vardiya Planı gibi: satırlar vardiya (departman başlığı altında), kutularda kişiler */}
      <div className="grid gap-x-1 gap-y-0.5 text-[10.5px]" style={{ gridTemplateColumns: `${compact ? 74 : 92}px repeat(${days.length}, minmax(0,1fr))` }}>
        <div className="pb-1 text-[10px] font-medium text-slate-400">Vardiya</div>
        {days.map((d, i) => (
          <div key={d} className={cn("pb-1 text-center font-medium", i >= 5 ? "text-forest-600" : "text-slate-400")}>{d}</div>
        ))}
        {board.map((row, ri) => {
          const s = shiftByCode[row.code];
          return (
            <Fragment key={`${row.dept}-${row.code}`}>
              {(ri === 0 || board[ri - 1].dept !== row.dept) && (
                <div className="mt-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700" style={{ gridColumn: "1 / -1" }}>{row.dept}</div>
              )}
              <div className="flex min-w-0 items-start gap-1.5 py-0.5">
                <span className={cn("mt-0.5 h-5 w-1 shrink-0 rounded-full", BAR_CLASSES[s.tone])} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold leading-tight text-slate-800">{s.label}</span>
                  <span className="block text-[9.5px] leading-tight text-slate-400">{s.time.replace(/:00/g, "").replace(" - ", "-")}</span>
                </span>
              </div>
              {row.days.map((names, d) => (
                <div key={d} className="flex min-w-0 flex-col gap-0.5 py-0.5">
                  {names.map(n => (
                    <span key={n} className={cn("block truncate rounded border px-1 text-[10px] font-semibold leading-[16px]", CHIP_CLASSES[s.tone], animate && "m-pop")}
                      style={animate ? ({ "--d": `${cellDelay(d, ri)}ms` } as React.CSSProperties) : undefined}>
                      {n}
                    </span>
                  ))}
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3">
          {sector.shifts.map((s) => (
            <span key={s.code} className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
              <span className={cn("h-2.5 w-2.5 rounded-sm", TONE_CLASSES[s.tone])} />
              <span className="font-medium text-slate-700">{s.label}</span> {s.time}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ekip üyesinin telefonundaki görünüm */
export function PhoneMock({ sector, className }: { sector: Sector; className?: string }) {
  const first = sector.shifts[0];
  const row = sector.rows[0];
  return (
    <div className={cn("w-[230px] rounded-[2.2rem] bg-slate-900 p-2 shadow-[0_30px_60px_-15px_rgba(10,33,30,0.5)]", className)} aria-hidden="true">
      <div className="relative overflow-hidden rounded-[1.8rem] bg-cream">
        <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-slate-900" />
        <div className="px-4 pb-5 pt-9">
          <p className="text-[10px] text-slate-500">Günaydın</p>
          <p className="text-[15px] font-bold text-slate-900">{row.name.split(" ")[0]}</p>

          <div className="mt-3 rounded-2xl bg-forest-700 p-3.5 text-white">
            <p className="text-[9.5px] font-medium uppercase tracking-wider text-forest-200">Sıradaki vardiyanız</p>
            <p className="mt-1 text-[17px] font-bold leading-tight">Yarın {first.time.split(" - ")[0]}</p>
            <p className="text-[11px] text-forest-100">{first.label} · {row.dept}</p>
            <div className="mt-3 flex gap-1.5">
              <span className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/15 py-1.5 text-[10px] font-semibold">
                <ArrowLeftRight size={11} /> Değiştir
              </span>
              <span className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/15 py-1.5 text-[10px] font-semibold">
                <CalendarClock size={11} /> İzin
              </span>
            </div>
          </div>

          <p className="mt-4 mb-2 text-[10px] font-semibold text-slate-500">Bu hafta</p>
          <div className="space-y-1.5">
            {row.days.slice(0, 4).map((code, i) => {
              const s = sector.shifts.find((x) => x.code === code);
              return (
                <div key={i} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-slate-900/5">
                  <span className="text-[10.5px] font-semibold text-slate-700">{DAYS[i]}</span>
                  {s ? (
                    <span className={cn("rounded-md px-2 py-0.5 text-[9.5px] font-semibold", TONE_CLASSES[s.tone])}>{s.time}</span>
                  ) : (
                    <span className="text-[9.5px] text-slate-400">İzinli</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Yüzen bildirim kartı */
export function Toast({
  icon = "check",
  title,
  text,
  className,
  style,
}: {
  icon?: "check" | "swap" | "bell" | "clock";
  title: string;
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = { check: Check, swap: ArrowLeftRight, bell: Bell, clock: Clock }[icon];
  const tone = {
    check: "bg-forest-100 text-forest-700",
    swap: "bg-sky-100 text-sky-700",
    bell: "bg-ember-100 text-ember-700",
    clock: "bg-violet-100 text-violet-700",
  }[icon];
  return (
    <div className={cn("flex w-[250px] items-start gap-3 rounded-2xl bg-white/95 p-3 shadow-[0_16px_40px_-12px_rgba(10,33,30,0.35)] ring-1 ring-slate-900/5 backdrop-blur", className)} style={style} aria-hidden="true">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon size={15} strokeWidth={2.5} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-slate-900">{title}</span>
        <span className="block text-[11px] leading-snug text-slate-500">{text}</span>
      </span>
    </div>
  );
}

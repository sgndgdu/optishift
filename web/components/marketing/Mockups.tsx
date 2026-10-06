import { Check, ArrowLeftRight, CalendarClock, Bell, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAYS, TONE_CLASSES, type Sector } from "@/components/marketing/sectors";

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

/** Haftalık vardiya planı: sektörün vardiyaları, görevleri ve doluluk satırı */
export function ScheduleBoard({ sector, compact = false, animate = false }: { sector: Sector; compact?: boolean; animate?: boolean }) {
  const shiftByCode = Object.fromEntries(sector.shifts.map((s) => [s.code, s]));
  const days = compact ? DAYS.slice(0, 5) : DAYS;
  // Plan sütun sütun dolar (motorun günleri sırayla kurması gibi), en sonda "Yayında" belirir
  const cellDelay = (day: number, row: number) => 350 + day * 110 + row * 45;
  const doneAt = cellDelay(days.length - 1, sector.rows.length - 1) + 250;
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{sector.location}</p>
          <p className="text-sm font-semibold text-slate-900">13 - 19 Ekim haftası</p>
        </div>
        <div className="relative flex items-center">
          {animate && (
            <span className="m-out absolute right-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600" style={{ "--d": `${doneAt}ms` } as React.CSSProperties}>
              <span className="m-pulse-dot h-1.5 w-1.5 rounded-full bg-ember-500" /> Plan kuruluyor
            </span>
          )}
          <span className={cn("inline-flex items-center gap-1 rounded-full bg-forest-50 px-2.5 py-1 text-[11px] font-semibold text-forest-700", animate && "m-pop")} style={{ "--d": `${doneAt + 150}ms` } as React.CSSProperties}>
            <Check size={11} strokeWidth={3} /> Yayında
          </span>
        </div>
      </div>

      <div
        className="grid gap-1 text-[10.5px]"
        style={{ gridTemplateColumns: `minmax(${compact ? 70 : 92}px,1.3fr) repeat(${days.length}, minmax(0,1fr))` }}
      >
        <div />
        {days.map((d, i) => (
          <div key={d} className={cn("pb-1 text-center font-medium", i >= 5 ? "text-ember-600" : "text-slate-400")}>{d}</div>
        ))}
        {sector.rows.map((row, ri) => (
          <Row key={row.name} row={row} days={days.length} shiftByCode={shiftByCode} delay={animate ? (d) => cellDelay(d, ri) : undefined} />
        ))}
        <div className="flex items-center pt-1.5 text-[10px] font-medium text-slate-400">İhtiyaç</div>
        {days.map((d, i) => (
          <div key={d} className={cn("pt-1.5 text-center text-[10px] font-semibold text-forest-600", animate && "m-up")} style={{ "--d": `${cellDelay(i, sector.rows.length - 1) + 120}ms` } as React.CSSProperties}>
            <Check size={10} strokeWidth={3} className="inline -mt-0.5" /> tam
          </div>
        ))}
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

function Row({ row, days, shiftByCode, delay }: {
  row: Sector["rows"][number];
  days: number;
  shiftByCode: Record<string, Sector["shifts"][number]>;
  delay?: (day: number) => number;
}) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 py-0.5">
        <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600 sm:flex">
          {row.name.split(" ").map((p) => p[0]).join("")}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-slate-800">{row.name}</span>
          <span className="block truncate text-[9.5px] text-slate-400">{row.role}</span>
        </span>
      </div>
      {row.days.slice(0, days).map((code, i) => {
        const s = code ? shiftByCode[code] : null;
        return s ? (
          <div key={i} className={cn("flex h-8 min-w-0 items-center justify-center overflow-hidden rounded-md px-0.5 text-[9.5px] font-semibold sm:text-[10.5px]", TONE_CLASSES[s.tone], delay && "m-pop")} style={delay ? ({ "--d": `${delay(i)}ms` } as React.CSSProperties) : undefined}>
            {s.label.length > 8 ? s.code : s.label}
          </div>
        ) : (
          <div key={i} className="flex h-8 items-center justify-center rounded-md bg-slate-50 text-[9.5px] text-slate-300">izin</div>
        );
      })}
    </>
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
            <p className="text-[9.5px] font-medium uppercase tracking-wider text-forest-200">Sıradaki vardiyan</p>
            <p className="mt-1 text-[17px] font-bold leading-tight">Yarın {first.time.split(" - ")[0]}</p>
            <p className="text-[11px] text-forest-100">{first.label} · {row.role}</p>
            <div className="mt-3 flex gap-1.5">
              <span className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/15 py-1.5 text-[10px] font-semibold">
                <ArrowLeftRight size={11} /> Takas
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

/** Adalet puanı: zor vardiyaların kişilere dağılımı */
export function FairnessCard({ className, animate = false }: { className?: string; animate?: boolean }) {
  const people = [
    { name: "Elif", v: 0.82 },
    { name: "Burak", v: 0.78 },
    { name: "Selin", v: 0.8 },
    { name: "Mert", v: 0.76 },
  ];
  return (
    <div className={cn("w-[240px] rounded-2xl bg-white p-4 shadow-[0_16px_40px_-12px_rgba(10,33,30,0.35)] ring-1 ring-slate-900/5", className)} aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-slate-900">Hafta sonu dağılımı</span>
        <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[10px] font-semibold text-forest-700">Dengeli</span>
      </div>
      <div className="space-y-2">
        {people.map((p, i) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="w-10 text-[10.5px] text-slate-500">{p.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span className={cn("block h-full rounded-full bg-gradient-to-r from-forest-500 to-forest-400", animate && "m-grow")} style={{ width: `${p.v * 100}%`, "--d": `${1800 + i * 140}ms` } as React.CSSProperties} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

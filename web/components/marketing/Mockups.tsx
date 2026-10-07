import { Check, ArrowLeftRight, CalendarClock, Bell, Clock, HelpCircle, Repeat, Smartphone, Play } from "lucide-react";
import { Fragment } from "react";
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

/** Haftalık vardiya planı: sektörün vardiyaları, departman başlıklarıyla kişiler ve doluluk satırı */
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

      <div
        className="grid gap-1 text-[10.5px]"
        style={{ gridTemplateColumns: `minmax(${compact ? 70 : 92}px,1.3fr) repeat(${days.length}, minmax(0,1fr))` }}
      >
        <div />
        {days.map((d, i) => (
          <div key={d} className={cn("pb-1 text-center font-medium", i >= 5 ? "text-ember-600" : "text-slate-400")}>{d}</div>
        ))}
        {sector.rows.map((row, ri) => (
          <Fragment key={row.name}>
            {/* Uygulamadaki gibi kişiler departmanlarının başlığı altında */}
            {(ri === 0 || sector.rows[ri - 1].dept !== row.dept) && (
              <div className="pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-forest-700" style={{ gridColumn: "1 / -1" }}>{row.dept}</div>
            )}
            <Row row={row} days={days.length} shiftByCode={shiftByCode} delay={animate ? (d) => cellDelay(d, ri) : undefined} />
          </Fragment>
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
        <span className="block min-w-0 truncate font-semibold text-slate-800">{row.name}</span>
      </div>
      {row.days.slice(0, days).map((code, i) => {
        const s = code ? shiftByCode[code] : null;
        return s ? (
          <div key={i} className={cn("flex h-8 min-w-0 items-center justify-center overflow-hidden rounded-md px-0.5 text-[9.5px] font-semibold sm:text-[10.5px]", TONE_CLASSES[s.tone], delay && "m-pop")} style={delay ? ({ "--d": `${delay(i)}ms` } as React.CSSProperties) : undefined}>
            {s.label}
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

/** Adalet puanı: zor vardiyaların kişilere dağılımı */
export function FairnessCard({ className, animate = false }: { className?: string; animate?: boolean }) {
  const people = [
    { name: "Elif", v: 0.82 },
    { name: "Burak", v: 0.78 },
    { name: "Can", v: 0.8 },
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

/** Otomatik Pilot: haftalık taslağın kendiliğinden hazırlandığı an */
export function PilotCard({ className }: { className?: string }) {
  return (
    <div className={cn("w-[270px] rounded-2xl bg-white p-4 shadow-[0_20px_50px_-15px_rgba(10,33,30,0.45)] ring-1 ring-slate-900/5", className)} aria-hidden="true">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-700 text-ember-300"><Repeat size={15} /></span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-slate-900">Otomatik Pilot</span>
          <span className="block text-[11px] text-slate-500">Perşembe 08:00</span>
        </span>
        <span className="ml-auto rounded-full bg-forest-50 px-2 py-0.5 text-[10px] font-semibold text-forest-700">Taslak hazır</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {["P", "S", "Ç", "P", "C", "C", "P"].map((d, i) => (
          <span key={i} className="flex h-7 items-center justify-center rounded-md bg-forest-50 text-[10px] font-semibold text-forest-700">{d}</span>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-slate-500">Gelecek hafta · 38 vardiya, eksik yok</p>
    </div>
  );
}

/** "Neden bu kişi?" açıklaması */
export function WhyCard({ className }: { className?: string }) {
  const lines = ["Cumartesi için \"uygunum\" dedi", "Bu hafta 28 saat, sınırın altında", "Son 4 haftada 1 kez hafta sonu çalıştı", "Önceki vardiyasından 14 saat dinlenmiş olacak"];
  return (
    <div className={cn("w-[280px] rounded-2xl bg-white p-4 shadow-[0_20px_50px_-15px_rgba(10,33,30,0.45)] ring-1 ring-slate-900/5", className)} aria-hidden="true">
      <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-slate-900">
        <HelpCircle size={15} className="text-ember-500" /> Neden Elif? <span className="font-normal text-slate-400">Cmt · Ara</span>
      </div>
      <ul className="space-y-1.5">
        {lines.map((t) => (
          <li key={t} className="flex gap-2 text-[11.5px] leading-snug text-slate-600">
            <Check size={12} strokeWidth={3} className="mt-0.5 shrink-0 text-forest-600" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ekibin telefondan girdiği uygunluk */
export function AvailabilityMini({ className }: { className?: string }) {
  const days: [string, "ok" | "pref" | "no"][] = [["Pzt", "ok"], ["Sal", "ok"], ["Çar", "no"], ["Per", "ok"], ["Cum", "pref"], ["Cmt", "ok"], ["Paz", "no"]];
  const tone = { ok: "bg-forest-50 text-forest-700", pref: "bg-ember-50 text-ember-700", no: "bg-red-50 text-red-600" };
  const word = { ok: "Uygunum", pref: "Tercih etmem", no: "Gelemem" };
  return (
    <div className={cn("space-y-1.5", className)} aria-hidden="true">
      {days.map(([d, v], i) => (
        <div key={d} className="m-up flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-slate-900/5" style={{ "--d": `${200 + i * 70}ms` } as React.CSSProperties}>
          <span className="text-[12px] font-semibold text-slate-700">{d}</span>
          <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", tone[v])}>{word[v]}</span>
        </div>
      ))}
    </div>
  );
}

/** Şubeler arası planlı değiştirme: kişi haftalara göre şube değiştirir */
export function RotationBoard({ className }: { className?: string }) {
  const weeks = [
    { w: "13-19 Ekim", b: "Moda" },
    { w: "20-26 Ekim", b: "Moda" },
    { w: "27 Eki-2 Kas", b: "Kadıköy" },
    { w: "3-9 Kasım", b: "Kadıköy" },
  ];
  return (
    <div className={cn("rounded-2xl bg-white p-4 shadow-[0_20px_50px_-15px_rgba(10,33,30,0.4)] ring-1 ring-slate-900/5", className)} aria-hidden="true">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-100 text-[11px] font-bold text-forest-700">DÖ</span>
        <span>
          <span className="block text-[12.5px] font-semibold text-slate-900">Deniz Ö.</span>
          <span className="block text-[11px] text-slate-500">2 haftada bir şube değiştirir</span>
        </span>
      </div>
      <div className="space-y-1.5">
        {weeks.map((x, i) => (
          <div key={x.w} className="m-up flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2" style={{ "--d": `${250 + i * 120}ms` } as React.CSSProperties}>
            <span className="text-[11.5px] text-slate-500">{x.w}</span>
            <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", x.b === "Moda" ? "bg-forest-50 text-forest-700" : "bg-ember-50 text-ember-700")}>{x.b} Şube</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Uygulama mağazası rozeti (yakında) */
export function StoreBadge({ store }: { store: "App Store" | "Google Play" }) {
  return (
    <span className="inline-flex items-center gap-2.5 rounded-xl bg-black/80 px-3.5 py-2 text-white ring-1 ring-white/15">
      {store === "App Store" ? <Smartphone size={18} /> : <Play size={17} className="fill-current" />}
      <span className="leading-tight">
        <span className="block text-[10px] text-white/60">Yakında</span>
        <span className="block text-[13px] font-semibold">{store}</span>
      </span>
    </span>
  );
}

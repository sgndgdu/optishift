"use client";

/**
 * Raporlar › Özet (lib/reports/teamReport, /api/reports/team). Şube raporu tek şube (locationId), Tüm Şubeler
 * raporu "all" ile çağırır; o zaman şube karşılaştırması ve şube süzgeci de çıkar.
 * Sıra: ay seçimi, dört sayı, dikkat edilecekler, ekip tablosu (sıralanır, departmana süzülür), departmanlar, günler.
 */
import { useEffect, useState } from "react";
import { Timer, ChevronLeft, ChevronRight, Clock, UserMinus, Wallet, Users, ArrowDownUp } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { businessToday, weekRangeTR } from "@/lib/date";
import { monthLabel, nextMonth, prevMonth } from "@/lib/months";
import { DAY_SHORT } from "@/lib/constants";
import { trNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TeamReport as Report, TeamPerson } from "@/lib/reports/teamReport";

type SortKey = "hours" | "overtimeHours" | "shifts" | "weekend" | "night" | "leaveDays" | "late" | "cost" | "name";
const ROWS = 10;
const tl = (n: number) => `₺${n.toLocaleString("tr-TR")}`;

function diffHint(cur: number, prev: number, partial: boolean, unit: string): string {
  if (partial) return "Bugüne kadar";
  if (!prev) return "Önceki ayda kayıt yok";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return pct === 0 ? "Önceki ayla aynı" : `Önceki aya göre %${Math.abs(pct)} ${pct > 0 ? "fazla" : "az"}${unit ? ` ${unit}` : ""}`;
}

function Th({ k, sort, onSort, children, className }: { k: SortKey; sort: SortKey; onSort: (k: SortKey) => void; children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-2.5 text-xs font-semibold text-slate-500", className)}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-slate-800", sort === k && "text-forest-700")}>
        {children}{sort === k && <ArrowDownUp size={11} />}
      </button>
    </th>
  );
}

export default function TeamReport({ locationId, tools, initialMonth }: {
  /** Şube kimliği ya da "all" (Tüm Şubeler) */
  locationId: string;
  /** Ay seçicinin yanına (puantaj / Excel indirme gibi); seçili ay verilir */
  tools?: (month: string) => React.ReactNode;
  /** Ay başı bildiriminden gelen ay (?month=) */
  initialMonth?: string | null;
}) {
  const thisMonth = businessToday().slice(0, 7);
  const [month, setMonth] = useState(initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) && initialMonth <= thisMonth ? initialMonth : thisMonth);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("hours");
  const [dept, setDept] = useState("");
  const [branch, setBranch] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    let stale = false;
    const t = setTimeout(() => { setData(null); setError(""); }, 0);
    fetch(locationId === "all" ? `/api/reports/team?all=1&month=${month}` : `/api/reports/team?location_id=${locationId}&month=${month}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (stale) return; if (ok) setData(d); else setError(d.error ?? "Rapor hazırlanamadı."); })
      .catch(() => { if (!stale) setError("Bağlantı hatası, tekrar deneyin."); });
    return () => { stale = true; clearTimeout(t); };
  }, [locationId, month]);

  const multi = locationId === "all";
  const navBtn = "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30";
  const chip = (on: boolean) => cn("min-h-[32px] rounded-full border px-3 text-xs font-semibold transition",
    on ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50");

  const people = (data?.people ?? []).filter(p => (!dept || p.department === dept) && (!branch || p.branch === branch));
  const sorted = [...people].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "tr") : (Number(b[sort] ?? 0) - Number(a[sort] ?? 0)));
  const shown = all ? sorted : sorted.slice(0, ROWS);
  const hasCost = !!data?.people.some(p => p.cost !== null);
  const deptNames = [...new Set((data?.people ?? []).filter(p => !branch || p.branch === branch).map(p => p.department).filter((d): d is string => !!d))];
  const maxHours = Math.max(1, ...(data?.people ?? []).map(p => p.hours));


  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(prevMonth(month))} aria-label="Önceki ay" className={navBtn}><ChevronLeft size={18} /></button>
          <p className="min-w-[9rem] text-center text-base font-bold text-slate-900">{monthLabel(month)}</p>
          <button onClick={() => setMonth(nextMonth(month))} disabled={month >= thisMonth} aria-label="Sonraki ay" className={navBtn}><ChevronRight size={18} /></button>
        </div>
        {tools?.(month)}
      </div>

      {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}
      {!data && !error && <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>}

      {data && data.totals.shifts === 0 && data.people.length === 0 && (
        <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{data.label} için yayınlanmış plan yok.</p>
      )}

      {data && (data.totals.shifts > 0 || data.people.length > 0) && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Çalışma süresi" icon={Clock} value={`${trNum(data.totals.hours)} saat`}
              hint={diffHint(data.totals.hours, data.totals.prevHours, data.partial, "")} />
            {data.totals.cost !== null ? (
              <StatCard label="İşçilik maliyeti" icon={Wallet} value={tl(data.totals.cost)}
                hint={data.totals.pricedPeople < data.totals.people ? `${data.totals.people - data.totals.pricedPeople} kişinin ücreti girilmemiş` : diffHint(data.totals.cost, data.totals.prevCost ?? 0, data.partial, "")} />
            ) : (
              <StatCard label="Çalışan kişi" icon={Users} value={data.totals.people}
                hint={data.totals.people ? `Kişi başı ${trNum(Math.round((data.totals.hours / data.totals.people) * 10) / 10)} saat` : undefined} />
            )}
            <StatCard label="Eksik kalan" icon={UserMinus} tone={data.totals.gaps ? "danger" : "positive"} value={`${data.totals.gaps} kişi`}
              hint="Yayınlanan planda" />
            <StatCard label="Fazla mesai" icon={Timer} tone={data.totals.overtimePeople ? "attention" : "positive"} value={`${data.totals.overtimePeople} kişi`}
              hint={data.totals.overtimePeople ? `Toplam ${trNum(data.totals.overtimeHours)} saat` : "Kimse fazla çalışmadı"} />
          </div>

          {data.attention.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="mb-1.5 text-sm font-bold text-amber-900">Dikkat edilecekler</p>
              <ul className="space-y-1 text-sm text-amber-900/90">
                {data.attention.map(a => <li key={a} className="flex gap-2"><span>•</span><span>{a}</span></li>)}
              </ul>
            </section>
          )}

          {multi && data.branches.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">Şubeler</h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/60 text-left">
                    <tr>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Şube</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Saat</th>
                      {data.branches.some(b => b.cost !== null) && <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Maliyet</th>}
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Kişi</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Eksik</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Fazla mesai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.branches.map(b => (
                      <tr key={b.id} onClick={() => setBranch(cur => (cur === b.name ? "" : b.name))}
                        className={cn("cursor-pointer hover:bg-slate-50", branch === b.name && "bg-forest-50/60")}>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{b.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{trNum(b.hours)}</td>
                        {data.branches.some(x => x.cost !== null) && <td className="px-3 py-2.5 text-right tabular-nums">{b.cost !== null ? tl(b.cost) : "Yok"}</td>}
                        <td className="px-3 py-2.5 text-right tabular-nums">{b.people}</td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", b.gaps ? "font-semibold text-red-600" : "text-slate-400")}>{b.gaps}</td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", b.overtimePeople ? "font-semibold text-amber-700" : "text-slate-400")}>{b.overtimePeople} kişi</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">Şubeye dokununca aşağıdaki ekip listesi o şubeye süzülür.</p>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Ekip{branch ? ` · ${branch}` : ""}</h2>
              {branch && <button onClick={() => setBranch("")} className="text-xs font-semibold text-forest-700 hover:underline">Bütün şubeler</button>}
            </div>
            {deptNames.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setDept("")} className={chip(!dept)}>Hepsi</button>
                {deptNames.map(d => <button key={d} onClick={() => setDept(cur => (cur === d ? "" : d))} className={chip(dept === d)}>{d}</button>)}
              </div>
            )}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/60 text-left">
                  <tr>
                    <Th sort={sort} onSort={setSort} k="name">Ad</Th>
                    <Th sort={sort} onSort={setSort} k="hours" className="text-right">Saat</Th>
                    {data.totals.overtimePeople > 0 && <Th sort={sort} onSort={setSort} k="overtimeHours" className="text-right">Mesai</Th>}
                    <Th sort={sort} onSort={setSort} k="shifts" className="hidden text-right sm:table-cell">Vardiya</Th>
                    <Th sort={sort} onSort={setSort} k="weekend" className="hidden text-right md:table-cell">Hafta sonu</Th>
                    <Th sort={sort} onSort={setSort} k="night" className="hidden text-right md:table-cell">Gece</Th>
                    <Th sort={sort} onSort={setSort} k="leaveDays" className="hidden text-right md:table-cell">İzin günü</Th>
                    {data.totals.late > 0 && <Th sort={sort} onSort={setSort} k="late" className="hidden text-right md:table-cell">Geç</Th>}
                    {hasCost && <Th sort={sort} onSort={setSort} k="cost" className="hidden text-right sm:table-cell">Maliyet</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shown.map((p: TeamPerson) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                          {p.name}
                          {p.overLimitWeeks > 0 && <span className="rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-600" title={`${p.overLimitWeeks} hafta haftalık sınırı aştı`}>Sınır aşıldı</span>}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {[multi && !branch ? p.branch : null, p.department, `${p.shifts} vardiya`, p.weekend ? `${p.weekend} hafta sonu` : null, p.leaveDays ? `${p.leaveDays} gün izin` : null].filter(Boolean).join(" · ")}
                        </span>
                        {p.overtime.length > 0 && (
                          <span className="block text-xs text-amber-700">
                            Fazla mesai: {p.overtime.map(w => `${weekRangeTR(w.weekStart)} haftası ${trNum(w.worked)} saat çalıştı, ${trNum(w.over)} saati fazla`).join(" · ")}
                          </span>
                        )}
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 sm:max-w-[220px]">
                          <span className={cn("block h-full rounded-full", p.overLimitWeeks ? "bg-red-400" : "bg-forest-400")} style={{ width: `${Math.round((p.hours / maxHours) * 100)}%` }} />
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{trNum(p.hours)}</td>
                      {data.totals.overtimePeople > 0 && <td className={cn("px-3 py-2.5 text-right tabular-nums", p.overtimeHours ? "font-semibold text-amber-700" : "text-slate-400")}>{p.overtimeHours ? trNum(p.overtimeHours) : "0"}</td>}
                      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{p.shifts}</td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{p.weekend}</td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{p.night}</td>
                      <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{p.leaveDays}</td>
                      {data.totals.late > 0 && <td className={cn("hidden px-3 py-2.5 text-right tabular-nums md:table-cell", p.late ? "font-semibold text-amber-700" : "")}>{p.late}</td>}
                      {hasCost && <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{p.cost !== null ? tl(p.cost) : "Yok"}</td>}
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">Bu süzgece uyan kimse yok.</td></tr>}
                </tbody>
              </table>
              {sorted.length > ROWS && (
                <button onClick={() => setAll(v => !v)} className="w-full border-t border-slate-100 py-3 text-sm font-bold text-forest-700 hover:bg-forest-50">
                  {all ? "Daha az göster" : `Tümünü göster (${sorted.length} kişi)`}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">Başlığa dokunarak sıralayın. Saat, molası düşülmüş çalışma süresidir. Sadece yayınlanmış vardiyalar sayılır.</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {data.departments.length > 1 && (
              <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-bold text-slate-900">Departmanlara göre saat</h2>
                {(() => {
                  const max = Math.max(1, ...data.departments.map(d => d.hours));
                  return data.departments.slice(0, 10).map(d => (
                    <div key={d.name}>
                      <div className="flex justify-between gap-2 text-xs"><span className="truncate font-semibold text-slate-700">{d.name}</span><span className="shrink-0 tabular-nums text-slate-500">{trNum(d.hours)} saat · {d.people} kişi</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-forest-500" style={{ width: `${Math.round((d.hours / max) * 100)}%` }} /></div>
                    </div>
                  ));
                })()}
              </section>
            )}
            <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">Günlere göre saat</h2>
              {(() => {
                const max = Math.max(1, ...data.weekdays);
                return (
                  <div className="flex h-32 items-end gap-2">
                    {data.weekdays.map((h, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[11px] tabular-nums text-slate-500">{trNum(Math.round(h))}</span>
                        <div className={cn("w-full rounded-t-md", i >= 5 ? "bg-forest-600" : "bg-forest-300")} style={{ height: `${Math.max(4, Math.round((h / max) * 88))}px` }} />
                        <span className="text-[11px] font-semibold text-slate-600">{DAY_SHORT[i]}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <p className="text-xs text-slate-500">Ay boyunca her günün toplam çalışma saati.</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

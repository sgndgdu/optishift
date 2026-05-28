import { Users, CalendarCheck, AlertTriangle, TrendingUp } from "lucide-react";
import { PERSONNEL, MOCK_SCHEDULE } from "@/lib/mock-data";
import { DAYS } from "@/lib/types";

const KPI = [
  { label: "Toplam Personel",    value: "6",    sub: "4 aktif bu hafta",        icon: Users,         color: "bg-indigo-500" },
  { label: "Vardiya Adalet Farkı", value: "0p", sub: "Mükemmel denge ✓",       icon: TrendingUp,    color: "bg-green-500" },
  { label: "Açık Vardiya",       value: "0",    sub: "Tüm slotlar dolu",        icon: CalendarCheck, color: "bg-blue-500" },
  { label: "Uyarı",              value: "1",    sub: "Tercih dışı atama",       icon: AlertTriangle, color: "bg-yellow-500" },
];

export default function DashboardPage() {
  const { assignments, scores } = MOCK_SCHEDULE;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Bu haftanın özeti — 26 Mayıs – 1 Haziran 2026</p>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPI.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}>
              <Icon size={18} className="text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{value}</div>
            <div className="text-sm font-medium text-slate-600 mt-0.5">{label}</div>
            <div className="text-xs text-slate-400 mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* Adil Puan Dağılımı */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">Adil Vardiya Puanı Dağılımı</h2>
        <div className="space-y-3">
          {PERSONNEL.map((p) => {
            const score = scores[p.id] ?? 0;
            const maxScore = Math.max(...Object.values(scores));
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
            const weeklyPts = assignments
              .filter((a) => a.personnelId === p.id)
              .reduce((s, a) => s + a.points, 0);
            return (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-28 text-sm text-slate-600 truncate">{p.name.split(" ")[0]}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-3">
                  <div
                    className="bg-indigo-500 h-3 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-sm font-medium text-slate-700 w-16 text-right">
                  {score}p <span className="text-xs text-green-600 font-normal">(+{weeklyPts})</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bu Haftanın Vardiyaları (mini tablo) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 overflow-x-auto">
        <h2 className="font-semibold text-slate-700 mb-4">Bu Haftanın Planı</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left pb-2 text-slate-500 font-medium pr-4">Personel</th>
              {DAYS.map((d) => (
                <th key={d} className="text-center pb-2 text-slate-500 font-medium px-1 text-xs">
                  {d.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERSONNEL.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2 pr-4 text-slate-700 font-medium whitespace-nowrap">
                  {p.name.split(" ")[0]}
                </td>
                {Array.from({ length: 7 }, (_, d) => {
                  const a = assignments.find((x) => x.personnelId === p.id && x.day === d);
                  return (
                    <td key={d} className="text-center py-2 px-1">
                      {a ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                          a.shiftId === 0 ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                        }`}>
                          {a.shiftId === 0 ? "S" : "A"}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-400 mt-3">S = Sabah (08-16) &nbsp; A = Akşam (16-24)</p>
      </div>
    </div>
  );
}

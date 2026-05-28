"use client";
import { useState } from "react";
import { Zap, Download, RefreshCw } from "lucide-react";
import { DAYS } from "@/lib/types";

const SHIFT_STYLE = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-orange-100 text-orange-800 border-orange-200",
];
const SHIFT_LABEL = ["Sabah", "Akşam"];

interface Assignment { personnelId: string; day: number; shiftId: 0 | 1; points: number; }
interface PersonData  { id: string; name: string; skills: string[]; prev_score: number; availability: Record<string, string>; }
interface ScheduleResult {
  fairness_gap: number;
  assignments: Assignment[];
  scores: Record<string, number>;
  personnel: PersonData[];
  error?: string;
}

// Her çalıştırmada önceki puanları simüle etmek için hafif rastgele varyasyon
function randomisePrevScores(): Record<string, number> {
  const base: Record<string, number> = { P001: 32, P002: 28, P003: 35, P004: 30, P005: 25, P006: 40 };
  return Object.fromEntries(
    Object.entries(base).map(([id, score]) => [id, score + Math.floor(Math.random() * 20) - 10])
  );
}

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [runCount, setRunCount] = useState(0);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prevScores: randomisePrevScores() }),
      });
      const data: ScheduleResult = await res.json();
      if (data.error) { setError(data.error); return; }
      setSchedule(data);
      setRunCount((c) => c + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Vardiya Planı</h1>
          <p className="text-slate-500 text-sm mt-1">
            26 Mayıs – 1 Haziran 2026
            {runCount > 0 && <span className="ml-2 text-indigo-400">· #{runCount}. çalıştırma</span>}
          </p>
        </div>
        <div className="flex gap-3">
          {schedule && (
            <button className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Download size={16} />
              Excel İndir
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? "OR-Tools hesaplıyor..." : schedule ? "Yeniden Oluştur" : "Vardiya Oluştur"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          Hata: {error}
        </div>
      )}

      {!schedule && !loading && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
          <Zap size={40} className="text-indigo-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700">Henüz plan oluşturulmadı</h2>
          <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto">
            "Vardiya Oluştur" butonuna tıkla. OR-Tools motoru personel müsaitlikleri ve kural
            kısıtlarını değerlendirerek en adil planı milisaniyeler içinde hesaplar.
          </p>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
          <RefreshCw size={36} className="text-indigo-400 mx-auto mb-4 animate-spin" />
          <p className="text-slate-500 text-sm">OR-Tools CP-SAT çözücüsü çalışıyor...</p>
        </div>
      )}

      {schedule && !loading && (
        <>
          {/* Adalet özeti */}
          <div className={`rounded-xl px-5 py-3 flex items-center gap-3 text-sm font-medium ${
            schedule.fairness_gap === 0
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-yellow-50 text-yellow-700 border border-yellow-200"
          }`}>
            <Zap size={16} />
            {schedule.fairness_gap === 0
              ? "Mükemmel adalet dağılımı — tüm personel aynı toplam puana ulaştı (0 puan fark)"
              : `Adalet farkı: ${schedule.fairness_gap} puan`}
          </div>

          {/* Tablo */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-slate-500 font-medium w-36">Personel</th>
                  {DAYS.map((d) => (
                    <th key={d} className="text-center px-2 py-3 text-slate-500 font-medium text-xs">
                      {d.slice(0, 3)}
                    </th>
                  ))}
                  <th className="text-center px-4 py-3 text-slate-500 font-medium">Puan</th>
                </tr>
              </thead>
              <tbody>
                {schedule.personnel.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {p.name.split(" ")[0]}
                      <div className="text-xs text-slate-400 font-normal">{p.skills.join(", ")}</div>
                    </td>
                    {Array.from({ length: 7 }, (_, d) => {
                      const a = schedule.assignments.find((x) => x.personnelId === p.id && x.day === d);
                      const avail = p.availability[String(d)] ?? "available";
                      return (
                        <td key={d} className="text-center px-1 py-3">
                          {a ? (
                            <div className={`inline-flex flex-col items-center border rounded-lg px-2 py-1 ${SHIFT_STYLE[a.shiftId]}`}>
                              <span className="text-xs font-semibold">{SHIFT_LABEL[a.shiftId]}</span>
                              <span className="text-xs opacity-70">{a.points}p</span>
                              {avail === "preferred_not" && (
                                <span className="text-yellow-600 text-xs leading-none">!</span>
                              )}
                            </div>
                          ) : avail === "unavailable" ? (
                            <span className="text-xs text-red-400 font-medium">İzin</span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-4 py-3">
                      <span className="font-bold text-indigo-600">{schedule.scores[p.id]}p</span>
                      <div className="text-xs text-slate-400">
                        önceki: {p.prev_score}p
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400">
            ! = tercih edilmeyen gün &nbsp;|&nbsp; İzin = kesinlikle gelemez &nbsp;|&nbsp;
            Puan = kümülatif (önceki + bu hafta)
          </p>
        </>
      )}
    </div>
  );
}

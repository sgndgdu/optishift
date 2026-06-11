"use client";

export function LoadingState() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-8 py-14">
      <div className="flex flex-col items-center gap-5">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700 mb-1">
            OR-Tools CP-SAT çözücüsü çalışıyor...
          </p>
          <p className="text-xs text-slate-400">
            Kısıt optimizasyonu ve adalet dağılımı hesaplanıyor
          </p>
        </div>
      </div>

      <div className="mt-10 space-y-3">
        {[180, 140, 160, 120, 150, 130].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div
                className="h-3 bg-slate-100 rounded-full animate-pulse"
                style={{ width: `${w}px` }}
              />
              <div className="h-2.5 bg-slate-100 rounded-full animate-pulse w-24" />
            </div>
            {Array.from({ length: 7 }).map((_, d) => (
              <div
                key={d}
                className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse shrink-0"
              />
            ))}
            <div className="w-12 h-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

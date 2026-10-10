"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tüm Şubeler › Raporlar (2026-10-09, kullanıcı: "daha kullanışlı, daha organize olmalı"). Özet: şube raporuyla aynı
 * bileşen (components/reports/TeamReport) bütün şubeler için: dört sayı, dikkat edilecekler, şube karşılaştırması,
 * ekip (şubeye ve departmana süzülür), departmanlar, günler. Adalet: her kişi kendi şubesinin ortalamasıyla.
 */
import { comparableScore, formatScore, scoreVsAverageText } from "@/lib/fairness";
import { useEffect, useState, useCallback } from "react";
import { useSupervisorAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/ui/Avatar";
import { List, ListItem, ListEmpty, ListSection } from "@/components/ui/List";
import { Page, PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import TeamReport from "@/components/reports/TeamReport";

type Branch = { id: string; name: string; personnel: { name: string; prev_score: number; cmp: number }[] };

export default function SupervisorReports() {
  const { user, mounted } = useSupervisorAuth();
  const [tab, setTab] = useState<"summary" | "fairness">("summary");
  const [branches, setBranches] = useState<Branch[] | null>(null);

  const loadFairness = useCallback(async () => {
    if (!user?.org_id) return;
    const locs: any[] = await fetch(`/api/locations?org_id=${user.org_id}`).then(r => r.json()).catch(() => []);
    if (!Array.isArray(locs)) { setBranches([]); return; }
    const out = await Promise.all(locs.map(async loc => {
      const ps: any[] = await fetch(`/api/personnel?location_id=${loc.id}`).then(r => r.json()).catch(() => []);
      let branchMax: number | undefined;
      try { const r = typeof loc.rules === "string" ? JSON.parse(loc.rules) : loc.rules; if (typeof r?.max_weekly_hours === "number") branchMax = r.max_weekly_hours; } catch { /* varsayılan */ }
      return {
        id: loc.id, name: loc.name,
        // Karşılaştırma kişinin haftalık süresine oranlanır (lib/fairness comparableScore)
        personnel: (Array.isArray(ps) ? ps : []).filter(p => p.status !== "inactive" && p.primary_location_id === loc.id)
          .map(p => ({ name: p.name, prev_score: Number(p.prev_score) || 0, cmp: comparableScore(Number(p.prev_score) || 0, p.max_weekly_hours, branchMax) })),
      };
    }));
    setBranches(out);
  }, [user]);

  useEffect(() => { if (mounted && user && tab === "fairness" && branches === null) void Promise.resolve().then(loadFairness); }, [mounted, user, tab, branches, loadFairness]);

  if (!mounted) return <div className="h-screen" />;

  return (
    <Page>
      <PageHeader title="Raporlar" description="Bütün şubeler" />
      <Tabs fill value={tab} onChange={setTab} items={[
        { id: "summary", label: "Özet" },
        { id: "fairness", label: "Adalet Puanı" },
      ] as const} />

      {tab === "summary" ? <TeamReport locationId="all" /> : (
        <div className="space-y-3">
          {/* Puanlar şube içinde karşılaştırılır (şubeler arası puan kıyası anlamsız: vardiya zorlukları farklı) */}
          <p className="text-xs text-slate-500">Adalet Puanı kişinin son haftalarda ne kadar ve ne kadar zor çalıştığını gösterir. Her kişi kendi şubesinin ortalamasıyla karşılaştırılır.</p>
          <List>
            {branches === null ? <ListEmpty>Yükleniyor…</ListEmpty> : branches.flatMap(b => {
              const max = Math.max(...b.personnel.map(x => x.cmp), 1);
              const avg = b.personnel.length ? b.personnel.reduce((a, x) => a + x.cmp, 0) / b.personnel.length : 0;
              return [
                <ListSection key={`h-${b.id}`} title={b.name} count={b.personnel.length} />,
                ...(b.personnel.length === 0
                  ? [<ListEmpty key={`e-${b.id}`}>Ekip yok.</ListEmpty>]
                  : [...b.personnel].sort((x, y) => y.cmp - x.cmp).map((p, i) => (
                    <ListItem key={`${b.id}-${i}`} href={`/supervisor/personnel?location_id=${b.id}`}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      subtitle={
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <span className="block h-full rounded-full bg-forest-400" style={{ width: `${Math.round((p.cmp / max) * 100)}%` }} />
                        </span>
                      }
                      trailing={<span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums text-slate-700">{formatScore(p.prev_score)}</span>
                        <span className="block text-[12px] text-slate-400">{scoreVsAverageText(p.cmp, avg)}</span>
                      </span>}
                    />
                  ))),
              ];
            })}
          </List>
        </div>
      )}
    </Page>
  );
}

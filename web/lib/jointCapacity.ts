// Birden çok departmanda çalışan kişiler (joker) varken her departman tek başına yeterli görünse de
// birlikte yetmeyebilir: joker aynı gün iki departmana birden yazılamaz. Kordon testi (2026-10-05):
// Cumartesi Teras 5 + İç Salon 4 = 9 kişi, iki departmanda o gün uygun toplam 8 kişi vardı; kontrol
// "karşılanabilir" deyip motor nedensiz "plan bulunamadı" diyordu. Motordaki eşi:
// engine/optishift_engine.py diagnose_infeasibility (aynı kural).

export type JointPerson = { id: string; departments: string[]; weeklyLimit: number };

export type JointShortfall =
  | { kind: "day"; departments: string[]; day: number; need: number; available: number }
  | { kind: "hours"; departments: string[]; need: number; capacity: number };

/** Jokerlerle birbirine bağlı departman gruplarında (2+ departman) gün ve haftalık saat açığı.
 *  Tek departmanlık açıklar ayrı kontrol edilir; burada sadece birlikte ortaya çıkanlar döner,
 *  en küçük açık veren grup önce (aynı açığı büyük grupta tekrar söylemez). */
export function jointShortfalls(
  demand: Record<string, Record<string, Record<string | number, number>>>, // departman → vardiya → gün → kişi
  people: JointPerson[],
  isUnavailable: (personId: string, day: number) => boolean,
  shiftHours: (shiftId: string) => number,
): JointShortfall[] {
  const depts = Object.keys(demand);
  if (depts.length < 2 || depts.length > 12) return [];
  const inDemand = new Set(depts);
  const linked = people.filter(p => p.departments.filter(d => inDemand.has(d)).length > 1);
  if (linked.length === 0) return [];

  // Joker bağlantısıyla oluşan bağlı grupların alt kümeleri (bağlı olmayan küme zaten parçalarıyla kontrol edilir)
  const adj = new Map<string, Set<string>>(depts.map(d => [d, new Set<string>()]));
  for (const p of linked) {
    const ds = p.departments.filter(d => inDemand.has(d));
    for (const a of ds) for (const b of ds) if (a !== b) adj.get(a)!.add(b);
  }
  const connected = (set: string[]) => {
    const seen = new Set([set[0]]); const stack = [set[0]];
    while (stack.length) { const c = stack.pop()!; for (const n of adj.get(c)!) if (set.includes(n) && !seen.has(n)) { seen.add(n); stack.push(n); } }
    return seen.size === set.length;
  };

  const out: JointShortfall[] = [];
  const covered = new Set<string>(); // açık bulunan gün ("d3") ya da "hours" için daha büyük grubu tekrar söyleme
  for (let size = 2; size <= depts.length; size++) {
    for (const set of combinations(depts, size)) {
      if (!connected(set)) continue;
      const members = people.filter(p => p.departments.some(d => set.includes(d)));
      for (let day = 0; day < 7; day++) {
        if (covered.has(`d${day}`)) continue;
        let need = 0;
        for (const dep of set) for (const days of Object.values(demand[dep])) need += Number(days[day] ?? days[String(day)]) || 0;
        if (need <= 0) continue;
        const available = members.filter(p => !isUnavailable(p.id, day)).length;
        if (need > available) { out.push({ kind: "day", departments: set, day, need, available }); covered.add(`d${day}`); }
      }
      if (!covered.has("hours")) {
        let need = 0;
        for (const dep of set) for (const [shiftId, days] of Object.entries(demand[dep])) for (const c of Object.values(days)) need += (Number(c) || 0) * shiftHours(shiftId);
        const capacity = members.reduce((a, p) => a + p.weeklyLimit, 0);
        if (need > 0 && need > capacity * 0.95) { out.push({ kind: "hours", departments: set, need, capacity }); covered.add("hours"); }
      }
    }
  }
  return out;
}

function combinations<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) { res.push([...acc]); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return res;
}

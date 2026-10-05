/**
 * Çalışan portalı: bir vardiyada "seninle" kimler çalışıyor (kullanıcı isteği 2026-10-05).
 * Aynı gün, aynı şube, saatleri çakışan; vardiyanın departmanı varsa sadece o departmandakiler
 * (bütün şube sayılınca liste kalabalık ve anlamsızdı). Departmanda kimse yoksa şube geneline düşer.
 */
export interface TeamShift {
  personnel_id: string;
  personnel_name: string;
  location_id: string;
  day: number;
  start_time: string;
  end_time: string;
  department_name?: string | null;
}

const toMin = (t: string) => { const [h, m] = String(t ?? "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const span = (x: { start_time: string; end_time: string }): [number, number] => {
  const a = toMin(x.start_time); let b = toMin(x.end_time); if (b <= a) b += 1440; return [a, b];
};

export function coworkersOf(
  mine: { day: number; location_id: string; start_time: string; end_time: string; department_name?: string | null },
  team: TeamShift[],
  myId: string | null | undefined,
): string[] {
  const [ms, me] = span(mine);
  const same = team.filter(t => t.day === mine.day && t.location_id === mine.location_id && t.personnel_id !== myId
    && span(t)[0] < me && ms < span(t)[1]);
  const dept = mine.department_name ? same.filter(t => t.department_name === mine.department_name) : [];
  return (dept.length > 0 ? dept : same).map(t => t.personnel_name.split(" ")[0]);
}

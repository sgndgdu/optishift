/**
 * Adalet Puanı kurallarındaki değişiklikleri okunur cümlelere çevirir (2026-10-08). Ayarlar kaydedilince ve
 * ekip anketinin sonucu uygulanınca fairness_rule_changes tablosuna yazılır; ekip ve hesap sahibi kimin neyi ne zaman
 * değiştirdiğini görür (kayırmaya karşı şeffaflık).
 */
import { DAY_NAMES_TR, resolveHardDayRules, type Rules } from "@/lib/fairness";

type Def = { id?: string; name?: string; base_points?: number; on_call?: boolean };
type R = Rules & Record<string, unknown>;

const onOff = (enabled: boolean, points: number) => (enabled ? `açık, ${points} puan` : "kapalı");

export function describeFairnessChanges(oldRules: R, newRules: R, oldDefs: Def[], newDefs: Def[]): string[] {
  const out: string[] = [];

  const oldById = new Map(oldDefs.filter(d => d?.id).map(d => [String(d.id), d]));
  for (const d of newDefs) {
    if (!d?.id || d.on_call) continue;
    const prev = oldById.get(String(d.id));
    const a = Number(prev?.base_points ?? 5), b = Number(d.base_points ?? 5);
    if (prev && a !== b) out.push(`${d.name ?? "Vardiya"} vardiyasının zorluğu ${a} → ${b}`);
  }

  const ho = resolveHardDayRules(oldRules), hn = resolveHardDayRules(newRules);
  hn.dayPoints.forEach((p, i) => {
    if (p !== ho.dayPoints[i]) out.push(`${DAY_NAMES_TR[i]} ek puanı ${ho.dayPoints[i]} → ${p}`);
  });
  if (ho.holidayPoints !== hn.holidayPoints) out.push(`Resmi tatil ve bayram ek puanı ${ho.holidayPoints} → ${hn.holidayPoints}`);
  if (ho.prefNotPoints !== hn.prefNotPoints) out.push(`Tercih etmem günü ek puanı ${ho.prefNotPoints} → ${hn.prefNotPoints}`);
  const key = (s: { date: string; name: string; points: number; shift_ids?: string[]; repeat?: string }) =>
    `${s.date}|${s.name}|${s.points}|${(s.shift_ids ?? []).join(",")}|${s.repeat ?? "none"}`;
  const oldSpecial = new Set(ho.specialDates.map(key)), newSpecial = new Set(hn.specialDates.map(key));
  const added = hn.specialDates.filter(s => !oldSpecial.has(key(s)));
  const removed = ho.specialDates.filter(s => !newSpecial.has(key(s)));
  for (const s of added) out.push(`Özel gün eklendi ya da değişti: ${s.name || s.date}, ${s.points} puan`);
  for (const s of removed) if (!added.some(a => a.date === s.date && a.name === s.name)) out.push(`Özel gün kaldırıldı: ${s.name || s.date}`);

  const bonus: [string, string, string, boolean, number][] = [
    ["Boş kalan vardiyayı alan", "hero_bonus_enabled", "hero_bonus_points", true, 6],
    ["İzin gününde çalışmaya çağrılan", "force_bonus_enabled", "force_bonus_points", true, 5],
    ["Başka şubede çalışan", "away_shift_enabled", "away_shift_points", false, 0],
    ["Yayından sonra vardiyası değişen", "change_compensation_enabled", "change_compensation_points", true, 2],
  ];
  for (const [label, enKey, ptKey, defOn, defPts] of bonus) {
    const isOn = (r: R) => (defOn ? r[enKey] !== false : r[enKey] === true);
    const pts = (r: R) => Number(r[ptKey] ?? defPts);
    if (isOn(oldRules) !== isOn(newRules) || (isOn(newRules) && pts(oldRules) !== pts(newRules))) {
      out.push(`${label} ek puanı: ${onOff(isOn(oldRules), pts(oldRules))} → ${onOff(isOn(newRules), pts(newRules))}`);
    }
  }
  const wo = Number(oldRules.fairness_window_weeks ?? 4), wn = Number(newRules.fairness_window_weeks ?? 4);
  if (wo !== wn) out.push(`Puanın baktığı süre ${wo} hafta → ${wn} hafta`);
  return out;
}

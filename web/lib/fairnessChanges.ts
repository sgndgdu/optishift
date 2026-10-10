/**
 * Adalet Puanı kurallarındaki değişiklikleri okunur cümlelere çevirir (2026-10-08). Ayarlar kaydedilince ve
 * ekip anketinin sonucu uygulanınca fairness_rule_changes tablosuna yazılır; ekip ve hesap sahibi kimin neyi ne zaman
 * değiştirdiğini görür (kayırmaya karşı şeffaflık).
 */
import { DAY_NAMES_TR, difficultyLabel, resolveBonusRules, resolveHardDayRules, shiftDifficultyPct, type Rules } from "@/lib/fairness";

type Def = { id?: string; name?: string; base_points?: number; difficulty_pct?: number; on_call?: boolean };
type R = Rules & Record<string, unknown>;


export function describeFairnessChanges(oldRules: R, newRules: R, oldDefs: Def[], newDefs: Def[]): string[] {
  const out: string[] = [];

  const oldById = new Map(oldDefs.filter(d => d?.id).map(d => [String(d.id), d]));
  for (const d of newDefs) {
    if (!d?.id || d.on_call) continue;
    const prev = oldById.get(String(d.id));
    const a = shiftDifficultyPct(prev), b = shiftDifficultyPct(d);
    if (prev && a !== b) out.push(`${d.name ?? "Vardiya"} vardiyasının zorluğu ${difficultyLabel(a)} → ${difficultyLabel(b)}`);
  }

  const ho = resolveHardDayRules(oldRules), hn = resolveHardDayRules(newRules);
  hn.dayPct.forEach((p, i) => {
    if (p !== ho.dayPct[i]) out.push(`${DAY_NAMES_TR[i]} eki %${ho.dayPct[i]} → %${p}`);
  });
  if (ho.holidayPct !== hn.holidayPct) out.push(`Resmi tatil ve bayram eki %${ho.holidayPct} → %${hn.holidayPct}`);
  if (ho.prefNotPct !== hn.prefNotPct) out.push(`Tercih etmem günü eki %${ho.prefNotPct} → %${hn.prefNotPct}`);
  const key = (s: { date: string; name: string; pct: number; shift_ids?: string[]; repeat?: string }) =>
    `${s.date}|${s.name}|${s.pct}|${(s.shift_ids ?? []).join(",")}|${s.repeat ?? "none"}`;
  const oldSpecial = new Set(ho.specialDates.map(key)), newSpecial = new Set(hn.specialDates.map(key));
  const added = hn.specialDates.filter(s => !oldSpecial.has(key(s)));
  const removed = ho.specialDates.filter(s => !newSpecial.has(key(s)));
  for (const s of added) out.push(`Özel gün eklendi ya da değişti: ${s.name || s.date}, %${s.pct}`);
  for (const s of removed) if (!added.some(a => a.date === s.date && a.name === s.name)) out.push(`Özel gün kaldırıldı: ${s.name || s.date}`);

  const bo = resolveBonusRules(oldRules), bn = resolveBonusRules(newRules);
  const pctText = (v: number) => (v > 0 ? `vardiyanın %${v}'i` : "kapalı");
  if (bo.heroPct !== bn.heroPct) out.push(`Boş kalan vardiyayı alan eki: ${pctText(bo.heroPct)} → ${pctText(bn.heroPct)}`);
  if (bo.forcePct !== bn.forcePct) out.push(`İzin gününde çağrılan eki: ${pctText(bo.forcePct)} → ${pctText(bn.forcePct)}`);
  const awayText = (m: number) => (m > 0 ? `${m} dakika yol` : "kapalı");
  if (bo.awayMinutes !== bn.awayMinutes) out.push(`Başka şubede çalışan eki: ${awayText(bo.awayMinutes)} → ${awayText(bn.awayMinutes)}`);
  if (bo.changeComp !== bn.changeComp) out.push(`Yayından sonra saati değişene kaydırılan saat kadar puan: ${bo.changeComp ? "açık" : "kapalı"} → ${bn.changeComp ? "açık" : "kapalı"}`);
  const co = oldRules.force_comp_leave_enabled === true, cn = newRules.force_comp_leave_enabled === true;
  if (co !== cn) out.push(`İzin gününde çağrılana denkleştirme izni: ${co ? "açık" : "kapalı"} → ${cn ? "açık" : "kapalı"}`);
  const wo = Number(oldRules.fairness_window_weeks ?? 4), wn = Number(newRules.fairness_window_weeks ?? 4);
  if (wo !== wn) out.push(`Puanın baktığı süre ${wo} hafta → ${wn} hafta`);
  return out;
}

/**
 * Davranışsal Dürtme: sektörün diliyle konuşmak ve en büyük derdini üste çıkarmak.
 * Ana Sayfa'nın Bekleyen İşler listesi (lib/inbox.ts) bu yardımcılarla sektöre uyarlanır.
 */

import type { IndustryNudges, InboxItemId } from "./types";

/** "{n} boş nöbet henüz dolmadı" gibi kalıpta {n} yer tutucusunu doldurur. */
export function fillTemplate(template: string, n: number): string {
  return template.replace(/\{n\}/g, String(n));
}

/** Aynı aciliyetteki maddeler için sektör sırası; listede olmayanlar sona gelir. */
export function priorityIndex(nudges: IndustryNudges | null | undefined, id: string): number {
  if (!nudges) return 0;
  const i = nudges.inboxPriority.indexOf(id as InboxItemId);
  return i === -1 ? nudges.inboxPriority.length : i;
}

/** Madde başlığı / açıklamasının sektöre özel hali (yoksa varsayılan metin). */
export function localizeCopy(
  nudges: IndustryNudges | null | undefined, id: string, n: number,
  fallback: { title: string; detail?: string },
): { title: string; detail?: string } {
  const copy = nudges?.inboxCopy?.[id as InboxItemId];
  return {
    title: copy?.title ? fillTemplate(copy.title, n) : fallback.title,
    detail: copy?.detail ? fillTemplate(copy.detail, n) : fallback.detail,
  };
}

const titleCaseTr = (s: string) =>
  s.split(" ").map(w => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1)).join(" ");

/** Son ünlü kalın mı (a, ı, o, u)? Ek uyumu için. */
const backVowel = (s: string) => /[aıou][^aeıioöuü]*$/.test(s);

/** Personel portalında kullanılan hazır kelime biçimleri. Sektör seçili değilse "vardiya". */
export interface ShiftWords {
  shift: string;        // "vardiya" | "nöbet" | "posta"
  Shift: string;        // "Vardiya"
  Shifts: string;       // "Vardiyalar"
  MyShifts: string;     // "Vardiyalarım" | "Nöbetlerim"
  openShift: string;    // "açık vardiya" | "boş nöbet"
  OpenShifts: string;   // "Açık Vardiyalar" | "Boş Nöbetler"
}

export function shiftWords(nudges: IndustryNudges | null | undefined): ShiftWords {
  const { shift, shifts, openShift } = nudges?.terms ?? { shift: "vardiya", shifts: "vardiyalar", openShift: "açık vardiya" };
  return {
    shift,
    Shift: titleCaseTr(shift),
    Shifts: titleCaseTr(shifts),
    MyShifts: titleCaseTr(shifts + (backVowel(shifts) ? "ım" : "im")),
    openShift,
    OpenShifts: titleCaseTr(openShift + (backVowel(openShift) ? "lar" : "ler")),
  };
}

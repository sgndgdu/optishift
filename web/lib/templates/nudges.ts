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

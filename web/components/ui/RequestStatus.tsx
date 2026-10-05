import { StatusPill, type PillTone } from "@/components/ui/StatusPill";

/**
 * Talep durumu rozeti (takas, düzenleme, izin, ilan): TEK KAYNAK. Renk anlamı her yerde
 * aynı (StatusPill): bekleyen = dikkat, onaylanan = yolunda, reddedilen = sorun, iptal = nötr.
 * Metin okuyana göre değişir (müdür / personel).
 */
const TONE: Record<string, PillTone> = {
  pending: "attention", peer_accepted: "attention", open: "attention",
  approved: "positive", manager_approved: "positive", claimed: "positive",
  rejected: "danger", manager_rejected: "danger", peer_rejected: "danger",
  cancelled: "neutral",
};

const LABELS: Record<"manager" | "employee", Record<string, string>> = {
  manager: {
    pending: "Bekliyor", peer_accepted: "Onay Bekliyor", approved: "Onaylandı", manager_approved: "Onaylandı",
    rejected: "Reddedildi", manager_rejected: "Reddedildi", peer_rejected: "Personel Reddetti", cancelled: "İptal Edildi",
    open: "Açık", claimed: "Üstlenildi",
  },
  employee: {
    pending: "Bekliyor", peer_accepted: "Sorumlu Onayı Bekliyor", peer_rejected: "Karşı Taraf Reddetti",
    cancelled: "İptal Edildi", manager_approved: "Onaylandı", manager_rejected: "Reddedildi", approved: "Onaylandı",
    open: "Üstlenen bekleniyor", claimed: "Devredildi", rejected: "Reddedildi",
  },
};

export function RequestStatusPill({ status, audience }: { status: string; audience: "manager" | "employee" }) {
  return <StatusPill tone={TONE[status] ?? "neutral"}>{LABELS[audience][status] ?? status}</StatusPill>;
}

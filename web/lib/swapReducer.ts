// Factor 12: Stateless Reducer — Shift Swap durum makinesi
//
// Kurallar:
//   pending       → PEER_ACCEPT  (sadece target)     → peer_accepted
//   pending       → PEER_REJECT  (sadece target)     → peer_rejected
//   pending       → CANCEL       (sadece requester)  → cancelled
//   peer_accepted → MANAGER_APPROVE                  → manager_approved
//   peer_accepted → MANAGER_REJECT                   → manager_rejected
//   Terminal durumlar (rejected / approved / cancelled) → işlem yapılamaz

export type SwapStatus =
  | "pending"
  | "peer_accepted"
  | "peer_rejected"
  | "cancelled"
  | "manager_approved"
  | "manager_rejected";

export type SwapEvent =
  | { type: "PEER_ACCEPT";  by_personnel_id: string }
  | { type: "PEER_REJECT";  by_personnel_id: string }
  | { type: "CANCEL";       by_personnel_id: string }
  | { type: "MANAGER_APPROVE" }
  | { type: "MANAGER_REJECT" };

export type SideEffect =
  | {
      type: "SWAP_SHIFTS";
      requester_shift_id: number;
      target_shift_id: number;
      requester_id: string;
      target_id: string;
    }
  | {
      type: "NOTIFY";
      personnel_id: string;
      title: string;
      message: string;
    }
  | {
      // Factor 7: insana araç gibi sor — müdürü bul ve bildir
      type: "NOTIFY_MANAGER";
      location_id: string;
      title: string;
      message: string;
    };

export type TransitionResult =
  | { ok: true;  newStatus: SwapStatus; sideEffects: SideEffect[] }
  | { ok: false; error: string; httpStatus: number };

type SwapContext = {
  target_id: string;
  requester_id: string;
  requester_name: string;
  target_name: string;
  requester_shift_id: number;
  target_shift_id: number;
  location_id: string;
};

export function swapReducer(
  currentStatus: SwapStatus,
  event: SwapEvent,
  swap: SwapContext
): TransitionResult {
  switch (currentStatus) {
    case "pending": {
      if (event.type === "PEER_ACCEPT") {
        if (event.by_personnel_id !== swap.target_id) {
          return { ok: false, error: "Sadece hedef personel kabul edebilir", httpStatus: 403 };
        }
        return {
          ok: true,
          newStatus: "peer_accepted",
          sideEffects: [
            // Talep sahibine: "karşı taraf kabul etti" bildirimi
            {
              type: "NOTIFY",
              personnel_id: swap.requester_id,
              title: "Vardiya takası kabul edildi",
              message: `${swap.target_name} takası kabul etti. Müdür onayı bekleniyor.`,
            },
            // Factor 7: akış duraklar, müdüre "onayını bekliyorum" bildirimi gider
            {
              type: "NOTIFY_MANAGER",
              location_id: swap.location_id,
              title: "Vardiya takası onay bekliyor",
              message: `${swap.requester_name} ↔ ${swap.target_name} arası takas karşılıklı kabul edildi. Onayınızı bekliyor.`,
            },
          ],
        };
      }

      if (event.type === "PEER_REJECT") {
        if (event.by_personnel_id !== swap.target_id) {
          return { ok: false, error: "Sadece hedef personel reddedebilir", httpStatus: 403 };
        }
        return {
          ok: true,
          newStatus: "peer_rejected",
          sideEffects: [
            {
              type: "NOTIFY",
              personnel_id: swap.requester_id,
              title: "Vardiya takası reddedildi",
              message: `${swap.target_name} takası reddetti.`,
            },
          ],
        };
      }

      if (event.type === "CANCEL") {
        if (event.by_personnel_id !== swap.requester_id) {
          return { ok: false, error: "Sadece teklifi gönderen iptal edebilir", httpStatus: 403 };
        }
        return {
          ok: true,
          newStatus: "cancelled",
          sideEffects: [
            {
              type: "NOTIFY",
              personnel_id: swap.target_id,
              title: "Takas teklifi geri alındı",
              message: `${swap.requester_name} takas teklifini geri aldı.`,
            },
          ],
        };
      }

      return {
        ok: false,
        error: "pending durumunda yalnızca peer kabul/ret veya iptal yapılabilir",
        httpStatus: 400,
      };
    }

    case "peer_accepted": {
      if (event.type === "MANAGER_APPROVE") {
        return {
          ok: true,
          newStatus: "manager_approved",
          sideEffects: [
            {
              type: "SWAP_SHIFTS",
              requester_shift_id: swap.requester_shift_id,
              target_shift_id:    swap.target_shift_id,
              requester_id:       swap.requester_id,
              target_id:          swap.target_id,
            },
            {
              type: "NOTIFY",
              personnel_id: swap.requester_id,
              title: "Vardiya takası onaylandı",
              message: "Müdürünüz vardiya takasını onayladı.",
            },
            {
              type: "NOTIFY",
              personnel_id: swap.target_id,
              title: "Vardiya takası onaylandı",
              message: "Müdürünüz vardiya takasını onayladı.",
            },
          ],
        };
      }

      if (event.type === "MANAGER_REJECT") {
        return {
          ok: true,
          newStatus: "manager_rejected",
          sideEffects: [
            {
              type: "NOTIFY",
              personnel_id: swap.requester_id,
              title: "Vardiya takası reddedildi",
              message: "Müdürünüz vardiya takasını reddetti.",
            },
            {
              type: "NOTIFY",
              personnel_id: swap.target_id,
              title: "Vardiya takası reddedildi",
              message: "Müdürünüz vardiya takasını reddetti.",
            },
          ],
        };
      }

      return {
        ok: false,
        error: "peer_accepted durumunda yalnızca müdür onay/ret yapabilir",
        httpStatus: 400,
      };
    }

    case "cancelled":
    case "peer_rejected":
    case "manager_approved":
    case "manager_rejected":
      return {
        ok: false,
        error: "Bu talep zaten sonuçlanmış, üzerinde işlem yapılamaz",
        httpStatus: 409,
      };

    default:
      return { ok: false, error: "Bilinmeyen durum", httpStatus: 500 };
  }
}

// API body'deki status string'ini SwapEvent'e çevirir
export function toSwapEvent(
  statusFromBody: string,
  actorPersonnelId: string | null
): SwapEvent | null {
  switch (statusFromBody) {
    case "peer_accepted":
      return { type: "PEER_ACCEPT",  by_personnel_id: actorPersonnelId ?? "" };
    case "peer_rejected":
      return { type: "PEER_REJECT",  by_personnel_id: actorPersonnelId ?? "" };
    case "cancelled":
      return { type: "CANCEL",       by_personnel_id: actorPersonnelId ?? "" };
    case "manager_approved":
      return { type: "MANAGER_APPROVE" };
    case "manager_rejected":
      return { type: "MANAGER_REJECT" };
    default:
      return null;
  }
}

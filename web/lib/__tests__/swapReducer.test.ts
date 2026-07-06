import { describe, it, expect } from "vitest";
import { swapReducer, toSwapEvent, type SwapStatus } from "../swapReducer";

const baseSwap = {
  target_id: "P-B",
  requester_id: "P-A",
  requester_name: "Ayşe",
  target_name: "Burak",
  requester_shift_id: 1,
  target_shift_id: 2,
  location_id: "L-001",
};

describe("swapReducer", () => {
  describe("pending durumu", () => {
    it("hedef personel kabul edebilir -> peer_accepted, NOTIFY + NOTIFY_MANAGER üretir", () => {
      const result = swapReducer(
        "pending",
        { type: "PEER_ACCEPT", by_personnel_id: "P-B" },
        baseSwap
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.newStatus).toBe("peer_accepted");
      expect(result.sideEffects.map((e) => e.type)).toEqual(["NOTIFY", "NOTIFY_MANAGER"]);
    });

    it("hedef olmayan biri kabul edemez -> 403", () => {
      const result = swapReducer(
        "pending",
        { type: "PEER_ACCEPT", by_personnel_id: "P-C" },
        baseSwap
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(403);
    });

    it("hedef personel reddedebilir -> peer_rejected", () => {
      const result = swapReducer(
        "pending",
        { type: "PEER_REJECT", by_personnel_id: "P-B" },
        baseSwap
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.newStatus).toBe("peer_rejected");
    });

    it("hedef olmayan biri reddedemez -> 403", () => {
      const result = swapReducer(
        "pending",
        { type: "PEER_REJECT", by_personnel_id: "P-C" },
        baseSwap
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(403);
    });

    it("talep sahibi iptal edebilir -> cancelled", () => {
      const result = swapReducer(
        "pending",
        { type: "CANCEL", by_personnel_id: "P-A" },
        baseSwap
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.newStatus).toBe("cancelled");
    });

    it("talep sahibi olmayan biri iptal edemez -> 403", () => {
      const result = swapReducer(
        "pending",
        { type: "CANCEL", by_personnel_id: "P-B" },
        baseSwap
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(403);
    });

    it("pending durumunda müdür onayı geçersiz -> 400", () => {
      const result = swapReducer("pending", { type: "MANAGER_APPROVE" }, baseSwap);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(400);
    });
  });

  describe("peer_accepted durumu", () => {
    it("müdür onayı -> manager_approved + SWAP_SHIFTS side effect", () => {
      const result = swapReducer("peer_accepted", { type: "MANAGER_APPROVE" }, baseSwap);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.newStatus).toBe("manager_approved");
      const swapEffect = result.sideEffects.find((e) => e.type === "SWAP_SHIFTS");
      expect(swapEffect).toBeDefined();
      if (swapEffect?.type === "SWAP_SHIFTS") {
        expect(swapEffect.requester_shift_id).toBe(1);
        expect(swapEffect.target_shift_id).toBe(2);
      }
      // Her iki tarafa da bildirim gitmeli
      const notifyTargets = result.sideEffects
        .filter((e) => e.type === "NOTIFY")
        .map((e) => (e.type === "NOTIFY" ? e.personnel_id : null));
      expect(notifyTargets).toEqual(expect.arrayContaining(["P-A", "P-B"]));
    });

    it("müdür reddi -> manager_rejected, SWAP_SHIFTS YOK", () => {
      const result = swapReducer("peer_accepted", { type: "MANAGER_REJECT" }, baseSwap);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.newStatus).toBe("manager_rejected");
      expect(result.sideEffects.some((e) => e.type === "SWAP_SHIFTS")).toBe(false);
    });

    it("peer_accepted durumunda peer eventleri geçersiz -> 400", () => {
      const result = swapReducer(
        "peer_accepted",
        { type: "PEER_ACCEPT", by_personnel_id: "P-B" },
        baseSwap
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(400);
    });
  });

  describe("terminal durumlar", () => {
    const terminalStatuses: SwapStatus[] = [
      "cancelled",
      "peer_rejected",
      "manager_approved",
      "manager_rejected",
    ];

    it.each(terminalStatuses)("%s durumunda hiçbir event kabul edilmez -> 409", (status) => {
      const result = swapReducer(status, { type: "MANAGER_APPROVE" }, baseSwap);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(409);
    });
  });
});

describe("toSwapEvent", () => {
  it("body status string'lerini doğru event'e çevirir", () => {
    expect(toSwapEvent("peer_accepted", "P-B")).toEqual({
      type: "PEER_ACCEPT",
      by_personnel_id: "P-B",
    });
    expect(toSwapEvent("peer_rejected", "P-B")).toEqual({
      type: "PEER_REJECT",
      by_personnel_id: "P-B",
    });
    expect(toSwapEvent("cancelled", "P-A")).toEqual({
      type: "CANCEL",
      by_personnel_id: "P-A",
    });
    expect(toSwapEvent("manager_approved", null)).toEqual({ type: "MANAGER_APPROVE" });
    expect(toSwapEvent("manager_rejected", null)).toEqual({ type: "MANAGER_REJECT" });
  });

  it("bilinmeyen status için null döner", () => {
    expect(toSwapEvent("something_else", "P-A")).toBeNull();
  });

  it("actorPersonnelId null ise boş string'e düşer", () => {
    expect(toSwapEvent("peer_accepted", null)).toEqual({
      type: "PEER_ACCEPT",
      by_personnel_id: "",
    });
  });
});

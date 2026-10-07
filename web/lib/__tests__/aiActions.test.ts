import { describe, it, expect } from "vitest";
import { matchPerson, normalizeLeaveType, splitAssistantReply } from "@/lib/ai/actions";

describe("splitAssistantReply", () => {
  it("işlem bloğunu metinden ayırır", () => {
    const r = splitAssistantReply('Mehmet o gün boş.\n<islem>[{"type":"absence","assignment_id":45,"replacement":"Mehmet Kaya"}]</islem>');
    expect(r.answer).toBe("Mehmet o gün boş.");
    expect(r.raw).toEqual([{ type: "absence", assignment_id: 45, replacement: "Mehmet Kaya" }]);
  });
  it("kod bloğu içindeki ve tek nesne olarak yazılmış işlemi okur", () => {
    const r = splitAssistantReply('Tamam.<islem>```json\n{"type":"open_shift","date":"2026-10-10"}\n```</islem>');
    expect(r.raw).toEqual([{ type: "open_shift", date: "2026-10-10" }]);
  });
  it("bozuk bloğu yok sayar, metne ham işaret bırakmaz", () => {
    const r = splitAssistantReply("Cevap <islem>[{bozuk</islem>");
    expect(r.answer).toBe("Cevap");
    expect(r.raw).toEqual([]);
  });
  it("iç numaraları cevap metninden siler", () => {
    expect(splitAssistantReply("Batuhan Yazıcı'nın izin talebi ([izin 3625]) bekliyor. Pzt vardiyası [v12] boş.").answer)
      .toBe("Batuhan Yazıcı'nın izin talebi bekliyor. Pzt vardiyası boş.");
  });
  it("açık vardiya numarasını da siler (ekip üyesinin asistanı)", () => {
    expect(splitAssistantReply("Cumartesi 10:00-17:00 ilanı [ilan 7] açık.").answer).toBe("Cumartesi 10:00-17:00 ilanı açık.");
  });
  it("blok yoksa metin aynen kalır", () => {
    expect(splitAssistantReply("Bu hafta 3 kişi izinli.")).toEqual({ answer: "Bu hafta 3 kişi izinli.", raw: [] });
  });
});

describe("normalizeLeaveType", () => {
  it("serbest yazılmış türleri uygulamadaki türlere çevirir", () => {
    expect(normalizeLeaveType("hastalık")).toBe("Hastalık / Rapor");
    expect(normalizeLeaveType("doktor raporu")).toBe("Hastalık / Rapor");
    expect(normalizeLeaveType("Ücretsiz İzin")).toBe("Ücretsiz İzin");
    expect(normalizeLeaveType("mazeret")).toBe("Mazeret İzni");
    expect(normalizeLeaveType("")).toBe("Yıllık İzin");
  });
});

describe("matchPerson", () => {
  const people = [
    { id: "1", name: "Ayşe Demir", weekly_off_day: null },
    { id: "2", name: "Mehmet Kaya", weekly_off_day: null },
    { id: "3", name: "Mehmet Öz", weekly_off_day: null },
  ];
  it("tam adı büyük/küçük harften bağımsız bulur", () => {
    expect(matchPerson(people, "ayşe demir")?.id).toBe("1");
    expect(matchPerson(people, "AYŞE DEMİR")?.id).toBe("1");
  });
  it("tek eşleşen ad parçasıyla bulur", () => {
    expect(matchPerson(people, "Ayşe")?.id).toBe("1");
    expect(matchPerson(people, "Kaya")?.id).toBe("2");
  });
  it("birden çok kişiyle eşleşen adı reddeder", () => {
    expect(matchPerson(people, "Mehmet")).toBeNull();
  });
  it("ekipte olmayan kişiyi bulmaz", () => {
    expect(matchPerson(people, "Can Bulut")).toBeNull();
  });
});

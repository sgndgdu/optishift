import { describe, it, expect } from "vitest";
import { pickGeocodeHit, type GeocodeHit } from "@/lib/geo";

const h = (name: string, admin1: string): GeocodeHit => ({ name, admin1, country: "Türkiye", latitude: 0, longitude: 0 });

describe("pickGeocodeHit", () => {
  it("il bağlamı verilirse o ildeki sonucu seçer", () => {
    const hits = [h("Kadıköy", "Denizli"), h("Kadıköy", "İstanbul")];
    expect(pickGeocodeHit(hits, ["İstanbul"])?.admin1).toBe("İstanbul");
  });
  it("Türkçe büyük/küçük harf farkını yok sayar", () => {
    expect(pickGeocodeHit([h("Bornova", "İzmir")], ["izmir"])?.name).toBe("Bornova");
  });
  it("bağlam eşleşmezse ilk sonuca düşer, sonuç yoksa null", () => {
    expect(pickGeocodeHit([h("A", "X"), h("B", "Y")], ["Z"])?.name).toBe("A");
    expect(pickGeocodeHit([], ["İzmir"])).toBeNull();
  });
});

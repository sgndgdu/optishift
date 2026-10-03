/**
 * Paketlerin TEK KAYNAĞI: ad, fiyat, sınırlar ve özellik listesi.
 * Tanıtım fiyat sayfası (/pricing), Faturalandırma (/billing), amir Ayarlar'ı, God Mode
 * ve sunucudaki sınır kontrolleri (şube/personel) buradan okur. Yeni paket ya da sınır
 * değişikliği sadece burada yapılır.
 */

export type PlanId = "free" | "pro" | "enterprise";

export interface PlanInfo {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  desc: string;
  /** null = sınırsız */
  maxLocations: number | null;
  /** İşletme genelinde aktif personel; null = sınırsız */
  maxPersonnel: number | null;
  features: string[];
}

export const SALES_EMAIL = "sgndgdu@gmail.com";

export const PLANS: PlanInfo[] = [
  {
    id: "free",
    name: "Ücretsiz",
    price: "₺0",
    period: "/ay",
    desc: "Tek şubeli kafeler ve butik restoranlar için, süresiz.",
    maxLocations: 1,
    maxPersonnel: 10,
    features: ["1 şube", "10 personele kadar", "Akıllı otomatik planlama", "Personel için mobil portal"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₺1.299",
    period: "/ay",
    desc: "Büyüyen işletmeler ve zincir mağazalar için.",
    maxLocations: null,
    maxPersonnel: null,
    features: ["Sınırsız şube", "Sınırsız personel", "Adalet Puanı raporları", "Anlık bildirimler", "Puantaj ve bordro raporları"],
  },
  {
    id: "enterprise",
    name: "Kurumsal",
    price: "Özel fiyat",
    period: "",
    desc: "Büyük zincirler ve özel destek ihtiyacı olan markalar için.",
    maxLocations: null,
    maxPersonnel: null,
    features: ["Pro'daki her şey", "Özel kurulum desteği", "Öncelikli destek"],
  },
];

/** Bilinmeyen ya da boş plan Ücretsiz sayılır. */
export function getPlan(id: string | null | undefined): PlanInfo {
  return PLANS.find(p => p.id === id) ?? PLANS[0];
}

/** Sunucu ve arayüz aynı cümleyi kullansın diye */
export function limitMessage(kind: "locations" | "personnel"): string {
  const free = PLANS[0];
  return kind === "locations"
    ? `${free.name} pakette ${free.maxLocations} şube açılabilir. Daha fazla şube için Pro pakete geçin.`
    : `${free.name} pakette en fazla ${free.maxPersonnel} personel eklenebilir. Daha fazlası için Pro pakete geçin.`;
}

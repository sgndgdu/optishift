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

/**
 * Ücretsiz paket yok (kullanıcı kararı 2026-10-06): her yeni işletme Pro pakette
 * TRIAL_DAYS günlük denemeyle açılır. "free" kimliği sadece eski hesaplar için durur,
 * fiyat sayfasında gösterilmez.
 */
export const TRIAL_DAYS = 14;

/** Yeni işletmenin deneme bitişi (saniye) */
export function trialEndsAt(nowSec: number): number {
  return nowSec + TRIAL_DAYS * 86400;
}

export const PLANS: PlanInfo[] = [
  {
    id: "free",
    name: "Ücretsiz",
    price: "₺0",
    period: "/ay",
    desc: "Tek şubeli küçük işletmeler için.",
    maxLocations: 1,
    maxPersonnel: 10,
    features: ["1 şube", "10 kişiye kadar", "Otomatik planlama", "Ekibiniz planı anında görür"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₺1.299",
    period: "/ay",
    desc: "Tek şubeli ve çok şubeli bütün işletmeler için.",
    maxLocations: null,
    maxPersonnel: null,
    features: ["Sınırsız şube ve kişi", "Yapay zekâ ile kurulum ve İşletme Asistanı", "Otomatik Pilot", "Bir kişi birden çok şubede çalışabilir", "Ekibiniz planı anında görür"],
  },
  {
    id: "enterprise",
    name: "Kurumsal",
    price: "Özel fiyat",
    period: "",
    desc: "Kurulumda ve kullanımda özel destek isteyen büyük zincirler için.",
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
    : `${free.name} pakette en fazla ${free.maxPersonnel} kişi eklenebilir. Daha fazlası için Pro pakete geçin.`;
}

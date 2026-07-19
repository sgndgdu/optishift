/**
 * Özellik bayrakları — TEK KAYNAK.
 * Basic sürümde henüz kullanıma açılmayan (yarım/backend'i eksik) modüller
 * buradan kapatılır: sidebar linki gizlenir, sayfa "kullanımda değil" kartı gösterir.
 * Bir modülü geri açmak için ilgili bayrağı true yapmak yeterlidir — kod silinmedi.
 */
export const FEATURES = {
  /** ERP entegrasyonları (SAP/Nebim/Logo) — UI hazır, gerçek senkron backend'i yok */
  integrations: false,
  /** Faturalandırma — Lemon Squeezy entegrasyonu tamamlanmadı */
  billing: false,
  /** Canlı mola takibi — backend akışı tamamlanmadı */
  breaks: false,
  /** Google ile giriş — GOOGLE_CLIENT_ID/SECRET + NEXT_PUBLIC_APP_URL env'leri kurulunca aç */
  googleAuth: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

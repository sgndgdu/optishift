/**
 * Sektör preset'leri — TEK KAYNAK.
 * Onboarding sihirbazı, schedule sayfasındaki yerinde "Vardiya Tanımla" modalı
 * ve gelecekteki tüm kurulum yüzeyleri bu listeden beslenir.
 */
import type { ShiftDefinition } from "./types";

export interface SectorPreset {
  key: string;
  label: string;
  /** Sektöre uygun hazır vardiya şablonları */
  shiftDefs: ShiftDefinition[];
  /** Sektöre uygun departman önerileri */
  depts: string[];
  /** Basit mod: KOBİ sektörlerinde sidebar/ayarlar sade açılır (bkz. rules.simple_mode) */
  simpleMode: boolean;
}

export const SECTOR_PRESETS: SectorPreset[] = [
  {
    key: "cafe",
    label: "Kafe / Bar",
    simpleMode: true,
    depts: ["Mutfak", "Bar", "Salon", "Kasa"],
    shiftDefs: [
      { id: "s1", name: "Açılış",  start: "07:00", end: "13:00", base_points: 5 },
      { id: "s2", name: "Öğlen",   start: "11:00", end: "17:00", base_points: 3 },
      { id: "s3", name: "Kapanış", start: "15:00", end: "22:00", base_points: 8 },
    ],
  },
  {
    key: "retail",
    label: "Perakende",
    simpleMode: true,
    depts: ["Kasa", "Reyon", "Depo", "Güvenlik"],
    shiftDefs: [
      { id: "s1", name: "Sabah",      start: "09:00", end: "17:00", base_points: 3 },
      { id: "s2", name: "Akşam",      start: "14:00", end: "22:00", base_points: 5 },
      { id: "s3", name: "Hafta Sonu", start: "10:00", end: "19:00", base_points: 8 },
    ],
  },
  {
    key: "hotel",
    label: "Otel / Konaklama",
    simpleMode: true,
    depts: ["Resepsiyon", "Kat Hizmetleri", "Restaurant", "Bar", "Mutfak"],
    shiftDefs: [
      { id: "s1", name: "Gündüz", start: "07:00", end: "15:00", base_points: 3 },
      { id: "s2", name: "Akşam",  start: "15:00", end: "23:00", base_points: 5 },
      { id: "s3", name: "Gece",   start: "23:00", end: "07:00", base_points: 10, is_night: true },
    ],
  },
  {
    key: "restaurant",
    label: "Restoran",
    simpleMode: true,
    depts: ["Mutfak", "Servis", "Bar", "Kasa"],
    shiftDefs: [
      { id: "s1", name: "Öğle Servisi",  start: "10:00", end: "16:00", base_points: 3 },
      { id: "s2", name: "Akşam Servisi", start: "17:00", end: "24:00", base_points: 7 },
    ],
  },
  {
    key: "factory",
    label: "Fabrika / Üretim",
    simpleMode: false, // rotasyon/ekip/mesai yüzeyleri gerekir — gelişmiş mod
    depts: ["Üretim", "Kalite Kontrol", "Depo", "Bakım"],
    shiftDefs: [
      { id: "s1", name: "Sabah Vardiyası",  start: "06:00", end: "14:00", base_points: 5 },
      { id: "s2", name: "Öğleden Sonra",    start: "14:00", end: "22:00", base_points: 7 },
      { id: "s3", name: "Gece Vardiyası",   start: "22:00", end: "06:00", base_points: 10, is_night: true },
    ],
  },
];

export function getSectorPreset(key: string): SectorPreset {
  return SECTOR_PRESETS.find(s => s.key === key) ?? SECTOR_PRESETS[0];
}

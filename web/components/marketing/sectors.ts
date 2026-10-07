/**
 * Tanıtım sayfalarındaki sektör içerikleri (landing sektör sekmeleri, plan önizlemeleri).
 * Buradaki her özellik uygulamada gerçekten var; olmayan bir şey yazılmaz.
 * Plan önizlemesindeki isimler ve saatler örnektir, gerçek veri değildir.
 */

import { Coffee, BedDouble, ShoppingBag, Factory } from "lucide-react";

export type SectorId = "kafe" | "otel" | "perakende" | "uretim";

export type ShiftTone = "forest" | "ember" | "sky" | "violet";

export interface SectorShift {
  code: string;
  label: string;
  time: string;
  tone: ShiftTone;
}

export interface Sector {
  id: SectorId;
  label: string;
  short: string;
  /** public/marketing altındaki fotoğraf (yoksa sayfa degrade zemine düşer) */
  image: string;
  headline: string;
  location: string;
  shifts: SectorShift[];
  /** Plan önizlemesi: kişi, departman, 7 güne vardiya kodu (null = izin) */
  rows: { name: string; role: string; days: (string | null)[] }[];
}

export const SECTORS: Sector[] = [
  {
    id: "kafe",
    label: "Kafe & Restoran",
    short: "Kafe",
    image: "/marketing/sector-kafe.webp",
    headline: "Hafta sonu yoğunluğunda her vardiyada yeterli kişi olur.",
    location: "Moda Şube",
    shifts: [
      { code: "A", label: "Açılış", time: "07:00 - 15:00", tone: "forest" },
      { code: "R", label: "Ara", time: "11:00 - 19:00", tone: "sky" },
      { code: "K", label: "Kapanış", time: "15:00 - 23:30", tone: "ember" },
    ],
    rows: [
      { name: "Elif K.", role: "Barista", days: ["A", "A", null, "K", "K", "R", null] },
      { name: "Burak T.", role: "Servis", days: ["K", null, "A", "A", null, "K", "K"] },
      { name: "Selin A.", role: "Kasa", days: [null, "R", "R", null, "A", "A", "R"] },
      { name: "Mert Y.", role: "Mutfak", days: ["R", "K", "K", "R", null, null, "A"] },
      { name: "Deniz Ö.", role: "Servis", days: ["A", null, "K", "K", "R", "K", null] },
    ],
  },
  {
    id: "otel",
    label: "Otel & Konaklama",
    short: "Otel",
    image: "/marketing/sector-otel.webp",
    headline: "Gece vardiyaları ekip içinde sırayla dağıtılır.",
    location: "Ön Büro",
    shifts: [
      { code: "S", label: "Sabah", time: "07:00 - 15:00", tone: "forest" },
      { code: "A", label: "Akşam", time: "15:00 - 23:00", tone: "ember" },
      { code: "G", label: "Gece", time: "23:00 - 07:00", tone: "violet" },
    ],
    rows: [
      { name: "Ayşe D.", role: "Resepsiyon", days: ["S", "S", "A", "A", null, null, "G"] },
      { name: "Kerem B.", role: "Resepsiyon", days: ["G", "G", null, null, "S", "S", "A"] },
      { name: "Nazlı E.", role: "Kat Hizmetleri", days: ["S", null, "S", "S", "S", "A", null] },
      { name: "Onur K.", role: "Gece Sorumlusu", days: [null, "A", "G", "G", "G", null, "S"] },
      { name: "Zehra P.", role: "Konuk İlişkileri", days: ["A", "A", "S", null, "A", "G", "G"] },
    ],
  },
  {
    id: "perakende",
    label: "Perakende & Mağaza",
    short: "Perakende",
    image: "/marketing/sector-perakende.webp",
    headline: "Bütün mağazaların planlarını tek ekrandan, aynı kurallarla yönetirsiniz.",
    location: "Kanyon Mağaza",
    shifts: [
      { code: "S", label: "Sabah", time: "09:30 - 17:30", tone: "forest" },
      { code: "O", label: "Orta", time: "12:00 - 20:00", tone: "sky" },
      { code: "A", label: "Akşam", time: "14:00 - 22:00", tone: "ember" },
    ],
    rows: [
      { name: "Gizem S.", role: "Mağaza Sorumlusu", days: ["S", "S", "S", null, "O", "A", null] },
      { name: "Emre Ç.", role: "Kasa", days: ["A", "A", null, "S", "S", null, "O"] },
      { name: "İrem T.", role: "Reyon", days: [null, "O", "A", "A", null, "S", "S"] },
      { name: "Okan V.", role: "Depo", days: ["S", null, "O", "O", "A", "A", null] },
      { name: "Buse N.", role: "Kasa", days: ["O", "S", null, "A", "A", "O", "A"] },
    ],
  },
  {
    id: "uretim",
    label: "Üretim & Fabrika",
    short: "Üretim",
    image: "/marketing/sector-uretim.webp",
    headline: "Üç vardiyalı düzen ve gece çalışma kuralları kurulu gelir.",
    location: "Hat 2 · Montaj",
    shifts: [
      { code: "1", label: "Sabah", time: "08:00 - 16:00", tone: "forest" },
      { code: "2", label: "Akşam", time: "16:00 - 24:00", tone: "ember" },
      { code: "3", label: "Gece", time: "00:00 - 08:00", tone: "violet" },
    ],
    rows: [
      { name: "Hasan Ü.", role: "Hat Sorumlusu", days: ["1", "1", "1", "1", "1", null, null] },
      { name: "Murat E.", role: "Operatör", days: ["2", "2", "2", "2", "2", null, null] },
      { name: "Serkan A.", role: "Forklift", days: ["3", "3", "3", "3", null, null, "3"] },
      { name: "Fatma Y.", role: "Kalite", days: ["1", "1", null, "2", "2", "2", null] },
      { name: "Cem D.", role: "Operatör", days: [null, "3", "3", "1", "1", "1", null] },
    ],
  },
];

export const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export const TONE_CLASSES: Record<ShiftTone, string> = {
  forest: "bg-forest-50 text-forest-800 ring-1 ring-inset ring-forest-200",
  ember: "bg-ember-50 text-ember-800 ring-1 ring-inset ring-ember-200",
  sky: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200",
};

export const SECTOR_ICONS: Record<SectorId, typeof Coffee> = {
  kafe: Coffee,
  otel: BedDouble,
  perakende: ShoppingBag,
  uretim: Factory,
};

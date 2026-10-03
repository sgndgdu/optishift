import type { IndustryProfile } from "../types";

/** Perakende ve Mağazacılık */
export const retail: IndustryProfile = {
  key: "retail",
  label: "Perakende ve Mağazacılık",
  description: "Mağaza, market, AVM. Açılış-kapanış dengesi, kasa yetkisi ve hafta sonu yoğunluğu.",
  icon: "ShoppingBag",

  variants: [
    {
      key: "mall",
      label: "AVM Mağazası",
      description: "10:00-22:00 açık, hafta sonu yoğun.",
      departments: ["Satış", "Kasa", "Depo"],
      shifts: [
        { id: "s-acilis",  name: "Açılış",  start: "09:30", end: "18:00", base_points: 4 },
        { id: "s-ara",     name: "Ara (Yoğun Saat)", start: "12:00", end: "20:00", base_points: 4 },
        { id: "s-kapanis", name: "Kapanış", start: "14:00", end: "22:30", base_points: 6 },
      ],
      skillRecommendations: [
        { shiftId: "s-kapanis", skill: "Kasa Sorumlusu", count: 1, reason: "Gün sonu kasa kapanışını yetkili biri yapmalı." },
        { shiftId: "s-acilis", skill: "Kasa Sorumlusu", count: 1, reason: "Kasa açılışı yetki gerektirir." },
      ],
    },
    {
      key: "street",
      label: "Cadde Mağazası",
      description: "09:00-21:00, daha kısa gün.",
      departments: ["Satış", "Kasa"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "08:30", end: "16:30", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "13:00", end: "21:30", base_points: 5 },
      ],
    },
    {
      key: "market",
      label: "Market / Süpermarket",
      description: "Uzun açık kalma süresi, reyon ve kasa ayrı.",
      departments: ["Kasa", "Reyon", "Depo"],
      shifts: [
        { id: "s-acilis",  name: "Açılış",  start: "07:30", end: "15:30", base_points: 4 },
        { id: "s-ara",     name: "Ara",     start: "11:00", end: "19:00", base_points: 4 },
        { id: "s-kapanis", name: "Kapanış", start: "15:00", end: "23:00", base_points: 6 },
      ],
    },
  ],

  roles: [
    { id: "magaza-muduru",   label: "Mağaza Müdürü",        category: "yonetim", senior: true, requiredDocs: ["kasa-yetkisi"] },
    { id: "mudur-yardimcisi", label: "Müdür Yardımcısı",    category: "yonetim", senior: true, requiredDocs: ["kasa-yetkisi"] },
    { id: "kasa-sorumlusu",  label: "Kasa Sorumlusu",       category: "operasyon", requiredDocs: ["kasa-yetkisi"] },
    { id: "kasiyer",         label: "Kasiyer",              category: "operasyon" },
    { id: "satis-danismani", label: "Satış Danışmanı",      category: "operasyon" },
    { id: "gorsel-duzenleme", label: "Görsel Düzenleme", category: "operasyon" },
    { id: "reyon",           label: "Reyon Görevlisi",      category: "operasyon" },
    { id: "depo",            label: "Depo / Stok Sorumlusu", category: "destek" },
  ],

  documents: [
    { id: "kasa-yetkisi", label: "Kasa Açma-Kapama Yetkisi", aliases: ["Kasa Yetkisi", "Kasa Yetki Belgesi"], strict: true,
      legalBasis: "Şirket içi yetkilendirme" },
    { id: "pos-egitimi", label: "Yazar Kasa / POS Eğitimi", aliases: ["POS Eğitimi"], strict: false },
  ],

  rules: {
    max_weekly_hours: 45,
    min_rest_hours: 11,
    max_consecutive_days: 6,
    clopening_enabled: true,
    clopening_min_rest_hours: 13,
    // Perakendenin en büyük şikâyeti: gece kapanıp sabah açmak. Ceza yüksek tutulur.
    clopening_penalty_weight: 60,
    hard_shift_points: 4,
    ensure_senior_per_shift: true,
    auto_open_shift_on_late: true,
    late_threshold_min: 15,
  },

  modules: {
    fatigue_radar_enabled: false,
    open_shifts_enabled: true,
    swap_requests_enabled: true,
    availability_collection_enabled: true,
    forecasting_enabled: true,
    compliance_tracking_enabled: true,
    tip_pooling_enabled: false,
  },

  taskTemplates: {
    "*": ["Vitrin ve reyon düzeni", "Kasa sayımı"],
  },

  legalNotes: [
    { title: "Kapanıştan açılışa", text: "Gece kapanışı yapıp ertesi sabah açılışa gelmek yasal 11 saatin üstünde kalsa bile yorar. Otomatik planlama 13 saatten kısa geçişlerden güçlü biçimde kaçınır.", basis: "Şirket politikası (yasal alt sınır 11 saat)" },
    { title: "Haftalık 45 saat", text: "Tam zamanlı personel için haftalık çalışma 45 saati geçmez.", basis: "4857 sayılı İş Kanunu" },
  ],

  nudges: {
    terms: { shift: "vardiya", shifts: "vardiyalar", openShift: "açık vardiya", handover: "devir-teslim", staff: "ekip" },
    inboxPriority: ["late", "next-week", "open-shifts", "approvals", "availability", "certifications", "fatigue", "tasks", "overtime", "handover", "accounts"],
    inboxCopy: {
      "next-week": { title: "Gelecek haftanın planı henüz hazır değil", detail: "Hafta sonu yoğunluğu için erken yayınlayın, ekip plan yapsın." },
    },
    firstSteps: [
      "Kasa yetkisi olan kişileri Kasa Sorumlusu olarak işaretleyin ve yetki belgesini girin.",
      "Satış ve Yoğunluk Tahmini açık: günlük ciroyu girdikçe personel ihtiyacı önerisi iyileşir.",
      "Hafta sonu için Personel İhtiyacı tablosunda Cumartesi-Pazar sayılarını artırın.",
    ],
  },

  limitations: [
    "Mola Takibi modülü henüz genel kullanıma açık değil; açıldığında perakende şablonunda varsayılan açık gelecek.",
  ],
};

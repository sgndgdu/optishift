import type { IndustryProfile } from "../types";

/** Ağır Sanayi ve Üretim */
export const manufacturing: IndustryProfile = {
  key: "manufacturing",
  label: "Üretim ve Sanayi",
  description: "Fabrika, atölye, üretim hattı. Vardiya düzeni, iş güvenliği ve yorgunluk takibi.",
  icon: "Factory",

  variants: [
    {
      key: "three-shift",
      label: "3 Vardiya (7/24)",
      description: "Sabah, akşam ve gece vardiyası; hat hiç durmaz.",
      departments: ["Üretim", "Bakım", "Kalite", "Depo"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "06:00", end: "14:00", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "14:00", end: "22:00", base_points: 5 },
        // Gece çalışması 7,5 saati aşamaz (sanayide istisna yok)
        { id: "s-gece",  name: "Gece",  start: "22:00", end: "05:30", base_points: 8 },
      ],
      skillRecommendations: [
        { shiftId: "s-gece", skill: "Bakım Teknisyeni", count: 1, reason: "Gece arızasında hattı ayağa kaldıracak biri olmalı." },
        { shiftId: "s-sabah", skill: "Vardiya Amiri", count: 1, reason: "Her vardiyada sorumlu bir amir bulunmalı." },
      ],
    },
    {
      key: "two-shift",
      label: "2 Vardiya",
      description: "Gündüz ve akşam; gece çalışılmaz.",
      departments: ["Üretim", "Bakım", "Kalite"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "07:00", end: "15:00", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "15:00", end: "23:00", base_points: 5 },
      ],
    },
    {
      key: "day-maintenance",
      label: "Gündüz + Bakım",
      description: "Tek vardiya üretim, hafta sonu planlı bakım.",
      departments: ["Üretim", "Bakım"],
      shifts: [
        { id: "s-gunduz", name: "Gündüz", start: "08:00", end: "17:00", base_points: 4 },
        { id: "s-bakim",  name: "Bakım",  start: "08:00", end: "16:00", base_points: 5 },
      ],
    },
  ],

  roles: [
    { id: "fabrika-muduru",   label: "Fabrika Müdürü",     category: "yonetim", senior: true },
    { id: "vardiya-amiri",    label: "Vardiya Amiri",      category: "yonetim", senior: true, requiredDocs: ["isg-temel"] },
    { id: "bakim-muhendisi",  label: "Bakım Mühendisi",    category: "operasyon", senior: true, requiredDocs: ["isg-temel", "yuksekte-calisma"] },
    { id: "bakim-teknisyeni", label: "Bakım Teknisyeni",   category: "operasyon", requiredDocs: ["isg-temel", "yuksekte-calisma"] },
    { id: "elektrik",         label: "Elektrik Teknisyeni", category: "operasyon", requiredDocs: ["isg-temel", "myk"] },
    { id: "hat-operatoru",    label: "Hat Operatörü",      category: "operasyon", requiredDocs: ["isg-temel"] },
    { id: "cnc-operatoru",    label: "CNC Operatörü",      category: "operasyon", requiredDocs: ["isg-temel", "myk"] },
    { id: "kaynakci",         label: "Kaynakçı",           category: "operasyon", requiredDocs: ["isg-temel", "kaynakci-sertifikasi"] },
    { id: "kalite-kontrol",   label: "Kalite Kontrol",     category: "destek", requiredDocs: ["isg-temel"] },
    { id: "forklift",         label: "Forklift Operatörü", category: "destek", requiredDocs: ["isg-temel", "forklift-belgesi"] },
    { id: "depo-sorumlusu",   label: "Depo Sorumlusu",     category: "destek", requiredDocs: ["isg-temel"] },
    { id: "isg-uzmani",       label: "İSG Uzmanı",         category: "destek", senior: true },
  ],

  documents: [
    { id: "isg-temel", label: "İSG Temel Eğitimi", aliases: ["İş Güvenliği Eğitimi", "İş Sağlığı ve Güvenliği Eğitimi", "İş Güvenliği Belgesi"],
      validityMonths: 12, strict: false, requiredForAll: true,
      legalBasis: "6331 sayılı İSG Kanunu; çok tehlikeli sınıfta yılda en az bir tekrar" },
    { id: "periyodik-muayene", label: "Periyodik Sağlık Muayenesi", aliases: ["İşe Giriş Muayenesi", "Periyodik Muayene"],
      validityMonths: 12, strict: false, requiredForAll: true, legalBasis: "6331 sayılı İSG Kanunu" },
    { id: "yuksekte-calisma", label: "Yüksekte Çalışma Eğitimi", strict: true },
    { id: "myk", label: "MYK Mesleki Yeterlilik Belgesi", aliases: ["Mesleki Yeterlilik Belgesi"], strict: false,
      legalBasis: "Tehlikeli ve çok tehlikeli işlerde zorunlu meslekler için" },
    { id: "kaynakci-sertifikasi", label: "Kaynakçı Sertifikası", strict: true },
    { id: "forklift-belgesi", label: "Forklift Operatör Belgesi", aliases: ["İş Makinesi Operatör Belgesi"], strict: true },
  ],

  rules: {
    max_weekly_hours: 45,
    min_rest_hours: 11,
    max_consecutive_days: 6,
    no_night_to_morning: true,
    night_legal_warning_enabled: true,
    clopening_enabled: true,
    clopening_min_rest_hours: 13,
    clopening_penalty_weight: 50,
    hard_shift_points: 5,
    checkin_required: true,
    auto_open_shift_on_late: false,
  },

  modules: {
    forecasting_enabled: false,
    handover_log_enabled: true,
    fatigue_radar_enabled: true,
    compliance_tracking_enabled: true,
    overtime_tracking_enabled: true,
    kiosk_mode_enabled: true,
    task_management_enabled: true,
    tip_pooling_enabled: false,
  },

  taskTemplates: {
    "*": ["Makine ön kontrol listesi", "KKD (baret, gözlük, eldiven) kontrolü", "Hat temizliği ve düzeni"],
  },

  legalNotes: [
    { title: "Haftalık 45 saat, günlük 11 saat", text: "Haftalık çalışma 45 saati, günlük çalışma 11 saati aşamaz. Denkleştirme uygulanmıyorsa 45 saat katı sınırdır.", basis: "4857 sayılı İş Kanunu" },
    { title: "11 saat dinlenme", text: "İki vardiya arasında en az 11 saat kesintisiz dinlenme verilir; otomatik planlama bunu kesin kural olarak uygular.", basis: "İş Kanunu'na İlişkin Çalışma Süreleri Yönetmeliği" },
    { title: "Gece vardiyası 7,5 saat", text: "Sanayide gece çalışması 7,5 saati aşamaz. Gece vardiyası bu yüzden 22:00-05:30 gelir.", basis: "4857 sayılı İş Kanunu" },
    { title: "Ardışık gece haftası", text: "Gece vardiyasında bir hafta çalışan, sonraki hafta gündüz vardiyasına alınır.", basis: "Vardiyalı çalışma yönetmeliği" },
    { title: "İSG eğitimi", text: "Çalışanların İSG eğitimi ve periyodik muayenesi güncel olmalı. Belge Takibi açıkken süresi dolan kişi o hafta plana alınmaz.", basis: "6331 sayılı İSG Kanunu" },
  ],

  nudges: {
    terms: { shift: "vardiya", shifts: "vardiyalar", openShift: "açık vardiya", handover: "devir-teslim", staff: "personel" },
    inboxPriority: ["fatigue", "late", "handover", "certifications", "next-week", "overtime", "approvals", "open-shifts", "availability", "tasks", "accounts"],
    inboxCopy: {
      handover: { title: "{n} devir-teslim notu henüz teslim alınmadı", detail: "Bir sonraki vardiya notu okumadan hatta başlayamaz." },
    },
    firstSteps: [
      "Personelin rollerini (Hat Operatörü, Bakım Teknisyeni...) ve İSG belgelerini girin.",
      "Personel sayfasından ortak tablet PIN'lerini atayın, girişler hattaki tabletten yapılsın.",
    ],
  },

  // Günlük 11 saat (m.63) artık vardiya düzenleyicide ve yayın kontrolünde uyarılıyor (lib/legal.ts)
  limitations: [],
};

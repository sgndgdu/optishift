import type { IndustryProfile } from "../types";

/** Sağlık ve Klinik */
export const healthcare: IndustryProfile = {
  key: "healthcare",
  label: "Sağlık ve Klinik",
  description: "Hastane, klinik, poliklinik, bakım evi. Nöbet düzeni, nöbet teslimi ve sertifika kontrolü.",
  icon: "Stethoscope",

  variants: [
    {
      key: "clinic",
      label: "Klinik / Poliklinik",
      description: "Gündüz çalışan, gece kapalı birimler.",
      departments: ["Hekim", "Hemşirelik", "Hasta Kabul"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "08:00", end: "16:00", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "12:00", end: "20:00", base_points: 5 },
      ],
    },
    {
      key: "hospital-12h",
      label: "Hastane · 12 Saatlik Nöbet",
      description: "08-20 gündüz, 20-08 gece nöbeti.",
      departments: ["Acil", "Yoğun Bakım", "Servis"],
      shifts: [
        { id: "s-gunduz", name: "Gündüz Nöbeti", start: "08:00", end: "20:00", base_points: 5 },
        { id: "s-gece",   name: "Gece Nöbeti",   start: "20:00", end: "08:00", base_points: 9, is_night: true },
      ],
      rules: { min_rest_hours: 12 },
      skillRecommendations: [
        { shiftId: "s-gece", skill: "Yoğun Bakım Hemşiresi", count: 1, reason: "Gece yoğun bakımda sertifikalı hemşire bulunmalı." },
        { shiftId: "s-gece", skill: "Uzman Hekim", count: 1, reason: "Gece nöbetinde sorumlu uzman hekim bulunmalı." },
      ],
    },
    {
      key: "hospital-24h",
      label: "Hastane · 24 Saat Nöbet",
      description: "08:00'de başlayıp ertesi gün 08:00'de biten nöbet, ardından dinlenme.",
      departments: ["Acil", "Yoğun Bakım"],
      shifts: [
        { id: "s-nobet", name: "24 Saat Nöbet", start: "08:00", end: "08:00", base_points: 10, is_night: true },
      ],
      // 24 saatlik nöbetten sonra en az 24 saat dinlenme; 45 saatlik ortalama
      // iki haftalık denkleştirmeyle korunur (tek hafta tavanı 66 saat).
      rules: { min_rest_hours: 24, balancing_period_weeks: 2, max_consecutive_days: 4 },
    },
  ],

  roles: [
    { id: "sorumlu-mudur",   label: "Sorumlu Müdür / Başhekim", category: "yonetim", senior: true, requiredDocs: ["diploma-tescil"] },
    { id: "uzman-hekim",     label: "Uzman Hekim",         category: "operasyon", senior: true, requiredDocs: ["diploma-tescil", "uzmanlik"] },
    { id: "pratisyen",       label: "Pratisyen Hekim",     category: "operasyon", requiredDocs: ["diploma-tescil"] },
    { id: "sorumlu-hemsire", label: "Sorumlu Hemşire",     category: "yonetim", senior: true, requiredDocs: ["diploma-tescil", "tyd"] },
    { id: "acil-hemsiresi",  label: "Acil Hemşiresi",      category: "operasyon", requiredDocs: ["diploma-tescil", "tyd"] },
    { id: "yb-hemsiresi",    label: "Yoğun Bakım Hemşiresi", category: "operasyon", requiredDocs: ["diploma-tescil", "tyd", "yb-sertifika"] },
    { id: "servis-hemsiresi", label: "Servis Hemşiresi",   category: "operasyon", requiredDocs: ["diploma-tescil"] },
    { id: "att",             label: "ATT / Paramedik",     category: "operasyon", requiredDocs: ["diploma-tescil", "tyd"] },
    { id: "ebe",             label: "Ebe",                 category: "operasyon", requiredDocs: ["diploma-tescil"] },
    { id: "laborant",        label: "Laborant",            category: "destek" },
    { id: "radyoloji",       label: "Radyoloji Teknisyeni", category: "destek", requiredDocs: ["radyasyon"] },
    { id: "tibbi-sekreter",  label: "Tıbbi Sekreter",      category: "destek" },
    { id: "hasta-kabul",     label: "Hasta Kabul",         category: "destek" },
    { id: "hasta-bakici",    label: "Hasta Bakıcı",        category: "destek" },
  ],

  documents: [
    { id: "diploma-tescil", label: "Diploma Tescili", aliases: ["Mesleki Diploma Tescili"], strict: true,
      legalBasis: "Sağlık meslek mensubu olarak çalışabilmek için" },
    { id: "uzmanlik", label: "Uzmanlık Belgesi", aliases: ["Uzmanlık Tescili"], strict: true },
    { id: "tyd", label: "Temel Yaşam Desteği Sertifikası", aliases: ["CPR Sertifikası", "BLS Sertifikası", "Temel Yaşam Desteği"],
      validityMonths: 24, strict: true },
    { id: "yb-sertifika", label: "Yoğun Bakım Hemşireliği Sertifikası", strict: true },
    { id: "radyasyon", label: "Radyasyon Güvenliği Eğitimi", strict: true },
  ],

  rules: {
    max_weekly_hours: 45,
    min_rest_hours: 11,
    max_consecutive_days: 6,
    // Sağlık hizmetlerinde gece çalışması yazılı onayla 7,5 saati aşabilir
    night_legal_warning_enabled: false,
    no_night_to_morning: true,
    clopening_enabled: true,
    clopening_min_rest_hours: 12,
    clopening_penalty_weight: 40,
    hard_shift_points: 6,
    ensure_senior_per_shift: true,
    checkin_required: true,
    auto_open_shift_on_late: false,
    pre_publish_check: true,
  },

  modules: {
    handover_log_enabled: true,
    compliance_tracking_enabled: true,
    fatigue_radar_enabled: true,
    open_shifts_enabled: true,
    overtime_tracking_enabled: true,
    tip_pooling_enabled: false,
    shift_bidding_enabled: false,
  },

  taskTemplates: {
    "*": ["Nöbet teslim formu", "Acil müdahale arabası kontrolü", "İlaç sayımı"],
  },

  legalNotes: [
    { title: "Gece nöbeti 7,5 saati aşabilir", text: "Sağlık hizmetlerinde gece çalışması, işçinin yazılı onayı alınarak 7,5 saati aşabilir. Onayları özlük dosyasında saklayın.", basis: "4857 sayılı İş Kanunu, gece çalışması" },
    { title: "24 saat nöbet", text: "24 saatlik nöbet, İş Kanunu'nun günlük çalışma sınırlarıyla doğrudan örtüşmez. Özel sağlık kuruluşlarında nöbet düzenini sözleşme ve denkleştirmeyle kurun; uygulamadan önce hukuk danışmanınıza teyit ettirin. Şablon, nöbet sonrası en az 24 saat dinlenme ve iki haftalık denkleştirmeyle gelir.", basis: "4857 sayılı İş Kanunu, denkleştirme" },
    { title: "Sertifika kontrolü", text: "Belge Takibi açıkken diploma tescili, uzmanlık ya da CPR sertifikası geçersiz olan kişi, o belgeyi gerektiren role otomatik planlamada atanmaz." },
  ],

  nudges: {
    terms: { shift: "nöbet", shifts: "nöbetler", openShift: "boş nöbet", handover: "nöbet teslimi", staff: "sağlık personeli" },
    inboxPriority: ["late", "certifications", "handover", "fatigue", "open-shifts", "next-week", "approvals", "overtime", "availability", "tasks", "accounts"],
    inboxCopy: {
      late: { title: "{n} kişi nöbetine gelmedi", detail: "Nöbet başladı, birim eksik çalışıyor." },
      handover: { title: "{n} nöbet teslim notu henüz teslim alınmadı", detail: "Sonraki nöbet notu okumadan başlayamaz." },
      "open-shifts": { title: "{n} boş nöbet henüz dolmadı" },
      "next-week": { title: "Gelecek haftanın nöbet listesi henüz hazır değil", detail: "Nöbet listesini erken yayınlayın." },
    },
    firstSteps: [
      "Her çalışanın unvanını (Uzman Hekim, Yoğun Bakım Hemşiresi...) ve belgelerini girin; süresi dolan sertifikalar otomatik engel olur.",
      "Nöbet Teslimi açık: çıkan nöbetçi not bırakır, gelen okumadan başlayamaz.",
      "Gece nöbeti tutacak kişilerden 7,5 saati aşan gece çalışması için yazılı onay alın.",
    ],
  },

  limitations: [
    "İcap (evden çağrılabilir) nöbeti henüz ayrı bir vardiya türü değil: normal vardiya olarak tanımlanırsa saatleri çalışma süresine sayılır. İcap için motor desteği yol haritasında.",
  ],
};

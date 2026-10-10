import type { IndustryProfile } from "../types";

/** Yeme-İçme, Bar, Eğlence ve Konaklama */
export const hospitality: IndustryProfile = {
  key: "hospitality",
  label: "Yeme-İçme ve Konaklama",
  description: "Kafe, restoran, bar, otel. Yoğun saatlere göre esnek kadro ve kolay vardiya değiştirme.",
  icon: "UtensilsCrossed",

  variants: [
    {
      key: "cafe",
      label: "Kafe / Pastane",
      description: "Sabah açılışı erken, öğlen ve akşamüstü yoğun.",
      departments: ["Bar", "Salon", "Kasa"],
      shifts: [
        { id: "s-acilis",  name: "Açılış",  start: "07:00", end: "15:00", base_points: 5 },
        { id: "s-yogun",   name: "Yoğun Saat", start: "11:30", end: "18:30", base_points: 4 },
        { id: "s-kapanis", name: "Kapanış", start: "15:00", end: "23:00", base_points: 7 },
      ],
    },
    {
      key: "restaurant",
      label: "Restoran",
      description: "Öğle ve akşam servisi.",
      departments: ["Mutfak", "Salon", "Bar"],
      shifts: [
        { id: "s-ogle",    name: "Öğle Servisi", start: "10:00", end: "17:00", base_points: 4 },
        { id: "s-ara",     name: "Ara (Yoğun Saat)", start: "12:00", end: "20:00", base_points: 5 },
        { id: "s-aksam",   name: "Akşam Servisi", start: "16:00", end: "00:00", base_points: 7 },
      ],
    },
    {
      key: "bar",
      label: "Bar / Gece Mekânı",
      description: "Akşam başlar, gece yarısını geçer.",
      departments: ["Bar", "Salon", "Güvenlik"],
      shifts: [
        { id: "s-hazirlik", name: "Hazırlık", start: "16:00", end: "00:00", base_points: 5 },
        { id: "s-gece",     name: "Gece",     start: "20:00", end: "03:30", base_points: 8 },
      ],
      rules: { night_legal_warning_enabled: false },
    },
    {
      key: "hotel",
      label: "Otel / Konaklama",
      description: "7/24 resepsiyon, kat hizmetleri gündüz.",
      departments: ["Ön Büro", "Kat Hizmetleri", "Yiyecek-İçecek"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "07:00", end: "15:00", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "15:00", end: "23:00", base_points: 5 },
        { id: "s-gece",  name: "Gece",  start: "23:00", end: "07:00", base_points: 8 },
      ],
      rules: { night_legal_warning_enabled: false },
    },
  ],

  roles: [
    { id: "isletme-muduru",   label: "İşletme Müdürü",     category: "yonetim", senior: true, variants: ["restaurant", "hotel"] },
    { id: "vardiya-sorumlusu", label: "Vardiya Kaptanı", category: "yonetim", senior: true, requiredDocs: ["hijyen"] },
    { id: "sef",              label: "Şef / Aşçıbaşı",     category: "operasyon", senior: true, requiredDocs: ["hijyen", "portor"] },
    { id: "asci",             label: "Aşçı",               category: "operasyon", requiredDocs: ["hijyen", "portor"] },
    { id: "komi",             label: "Komi",               category: "operasyon", requiredDocs: ["hijyen"] },
    { id: "garson",           label: "Garson",             category: "operasyon", requiredDocs: ["hijyen"] },
    { id: "barmen",           label: "Barmen",             category: "operasyon", requiredDocs: ["hijyen"] },
    { id: "barista",          label: "Barista",            category: "operasyon", requiredDocs: ["hijyen"] },
    { id: "hostes",           label: "Hostes / Karşılama", category: "operasyon" },
    { id: "kasiyer",          label: "Kasiyer",            category: "operasyon" },
    { id: "bulasik",          label: "Bulaşık ve Temizlik", category: "destek", requiredDocs: ["hijyen"] },
    { id: "kurye",            label: "Kurye",              category: "destek", requiredDocs: ["ehliyet-a2"], variants: ["cafe", "restaurant"] },
    { id: "resepsiyon",       label: "Resepsiyonist",      category: "operasyon", variants: ["hotel"] },
    { id: "kat-gorevlisi",    label: "Kat Görevlisi",      category: "operasyon", variants: ["hotel"] },
    { id: "gece-muduru",      label: "Gece Müdürü", category: "yonetim", senior: true, variants: ["hotel"] },
  ],

  documents: [
    { id: "hijyen", label: "Hijyen Eğitimi Belgesi", aliases: ["Hijyen Belgesi", "Gıda Hijyeni Eğitimi"], strict: false,
      legalBasis: "Gıda hijyeni mevzuatı" },
    { id: "portor", label: "Portör Muayenesi", aliases: ["Sağlık Karnesi", "Portör Raporu"], validityMonths: 6, strict: false,
      legalBasis: "Gıda ile temas eden personel için dönemsel muayene; süre belediyeye göre değişir" },
    { id: "ehliyet-a2", label: "A2 Sürücü Belgesi", aliases: ["A2 Ehliyet", "Motosiklet Ehliyeti"], strict: true },
  ],

  rules: {
    max_weekly_hours: 45,
    min_rest_hours: 11,
    max_consecutive_days: 6,
    clopening_enabled: true,
    clopening_min_rest_hours: 12,
    clopening_penalty_weight: 30,
    hard_shift_points: 4,
  },

  modules: {
    fatigue_radar_enabled: false,
    open_shifts_enabled: true,
    swap_requests_enabled: true,
    availability_collection_enabled: true,
    chat_enabled: true,
  },

  taskTemplates: {
    "*": ["Soğuk zincir sıcaklık kaydı", "Tezgâh ve ekipman temizliği"],
  },

  legalNotes: [
    { title: "Haftalık 45 saat", text: "Tam zamanlı personel için haftalık çalışma 45 saati geçmez, aşan kısım fazla mesaidir.", basis: "4857 sayılı İş Kanunu" },
    { title: "Gece çalışması", text: "Gece çalışması kural olarak 7,5 saati aşamaz. Turizm sektöründe işçinin yazılı onayı alınarak aşılabilir; bu yüzden bar ve otel şablonunda 7,5 saat uyarısı kapalı gelir. Onayları dosyalayın.", basis: "4857 sayılı İş Kanunu, gece çalışması" },
    { title: "Hijyen ve portör", text: "Gıda ile temas eden personelin hijyen eğitimi ve dönemsel sağlık muayenesi güncel olmalı. Belge Takibi açıkken süresi dolan kişi mutfak rollerine atanmaz." },
  ],

  nudges: {
    terms: { shift: "vardiya", shifts: "vardiyalar", openShift: "açık vardiya", handover: "devir-teslim", staff: "ekip" },
    inboxPriority: ["late", "open-shifts", "approvals", "next-week", "availability", "certifications", "tasks", "fatigue", "handover", "accounts", "overtime"],
    inboxCopy: {
      "open-shifts": { title: "{n} açık vardiya henüz dolmadı" },
      late: { title: "{n} kişi vardiyasına gelmedi", detail: "Servis başladı, yerine birini bulun." },
    },
    firstSteps: [
      "Ekibinizi ekleyin, bağlantıyı WhatsApp ile gönderin.",
      "Hafta sonu yoğunluğu için Personel İhtiyacı tablosunda Cuma-Cumartesi sayılarını artırın.",
    ],
  },
};

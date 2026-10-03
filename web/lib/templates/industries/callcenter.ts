import type { IndustryProfile } from "../types";

/** Çağrı Merkezi ve Müşteri Hizmetleri */
export const callcenter: IndustryProfile = {
  key: "callcenter",
  label: "Çağrı Merkezi ve Müşteri Hizmetleri",
  description: "Gelen arama, giden arama, canlı destek. Çağrı yoğunluğuna göre kaydırmalı vardiya ve ekran molaları.",
  icon: "Headset",

  variants: [
    {
      key: "business-hours",
      label: "Mesai Saatleri",
      description: "08:00-20:00 arası, öğlen yoğun.",
      departments: ["Inbound", "Outbound", "Canlı Destek"],
      shifts: [
        { id: "s-erken", name: "Erken",     start: "08:00", end: "16:00", base_points: 4 },
        { id: "s-yogun", name: "Yoğun Saat", start: "10:00", end: "18:00", base_points: 4 },
        { id: "s-gec",   name: "Geç",       start: "12:00", end: "20:00", base_points: 5 },
      ],
    },
    {
      key: "24-7",
      label: "7/24 Destek",
      description: "Kesintisiz hat; gece ekibi küçük.",
      departments: ["Inbound", "Teknik Destek"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "07:00", end: "15:00", base_points: 4 },
        { id: "s-ogle",  name: "Öğle (Yoğun)", start: "11:00", end: "19:00", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "15:00", end: "23:00", base_points: 6 },
        { id: "s-gece",  name: "Gece",  start: "23:00", end: "06:30", base_points: 8, is_night: true },
      ],
    },
  ],

  roles: [
    { id: "cm-muduru",    label: "Çağrı Merkezi Müdürü", category: "yonetim", senior: true, requiredDocs: ["kvkk"] },
    { id: "takim-lideri", label: "Takım Lideri",         category: "yonetim", senior: true, requiredDocs: ["kvkk"] },
    { id: "wfm",          label: "İş Gücü Planlama", category: "destek" },
    { id: "kalite",       label: "Kalite Uzmanı",        category: "destek", requiredDocs: ["kvkk"] },
    { id: "inbound",      label: "Inbound Temsilci",     category: "operasyon", requiredDocs: ["kvkk"] },
    { id: "outbound",     label: "Outbound Temsilci",    category: "operasyon", requiredDocs: ["kvkk", "iys"] },
    { id: "teknik-destek", label: "Teknik Destek Temsilcisi", category: "operasyon", requiredDocs: ["kvkk"] },
    { id: "canli-destek", label: "Canlı Destek",  category: "operasyon", requiredDocs: ["kvkk"] },
    { id: "yabanci-dil",  label: "Yabancı Dil Temsilcisi", category: "operasyon", requiredDocs: ["kvkk", "dil-belgesi"] },
    { id: "back-office",  label: "Back Office",          category: "destek", requiredDocs: ["kvkk"] },
  ],

  documents: [
    { id: "kvkk", label: "KVKK Eğitimi", aliases: ["Kişisel Verilerin Korunması Eğitimi"], validityMonths: 12, strict: false,
      requiredForAll: true, legalBasis: "6698 sayılı KVKK" },
    { id: "iys", label: "Ticari İleti ve İYS Eğitimi", aliases: ["İYS Eğitimi"], validityMonths: 12, strict: false },
    { id: "dil-belgesi", label: "Yabancı Dil Yeterlilik Belgesi", aliases: ["Dil Sertifikası", "YDS", "IELTS", "TOEFL"], strict: true },
  ],

  rules: {
    max_weekly_hours: 45,
    min_rest_hours: 11,
    max_consecutive_days: 6,
    clopening_enabled: true,
    clopening_min_rest_hours: 12,
    clopening_penalty_weight: 40,
    hard_shift_points: 4,
    ensure_senior_per_shift: true,
    checkin_required: true,
    auto_open_shift_on_late: true,
    late_threshold_min: 10,
  },

  modules: {
    forecasting_enabled: true,
    availability_collection_enabled: true,
    swap_requests_enabled: true,
    shift_bidding_enabled: true,
    open_shifts_enabled: true,
    compliance_tracking_enabled: true,
    tip_pooling_enabled: false,
  },

  legalNotes: [
    { title: "Ekran başında mola", text: "Ekranlı araçlarla çalışanların gün içindeki çalışmasına düzenli aralar verilir. Temsilci vardiyalarını mola planıyla birlikte duyurun.", basis: "Ekranlı Araçlarla Çalışmalarda Sağlık ve Güvenlik Önlemleri Hakkında Yönetmelik" },
    { title: "Kişisel veriler", text: "Müşteri verisine erişen herkesin KVKK eğitimi güncel olmalı; Belge Takibi açıkken süresi dolan kişi o hafta plana alınmaz.", basis: "6698 sayılı KVKK" },
  ],

  nudges: {
    terms: { shift: "vardiya", shifts: "vardiyalar", openShift: "açık vardiya", handover: "devir-teslim", staff: "temsilci" },
    inboxPriority: ["late", "open-shifts", "next-week", "availability", "approvals", "certifications", "overtime", "fatigue", "tasks", "handover", "accounts"],
    inboxCopy: {
      late: { title: "{n} temsilci vardiyasına bağlanmadı", detail: "Hat bekleme süresi artar, yedek temsilci çağırın." },
      "open-shifts": { title: "{n} açık vardiya henüz dolmadı", detail: "Yoğun saatlerde kuyruk uzamasın." },
    },
    firstSteps: [
      "Günlük çağrı sayısını Satış ve Yoğunluk Tahmini alanına girin; personel ihtiyacı önerisi çağrı yoğunluğuna göre şekillenir.",
      "Temsilcilerin KVKK eğitim tarihlerini girin.",
      "Vardiya Pazarı açık: temsilciler açık vardiyalara teklif verebilir, esneklik artar.",
    ],
  },

  limitations: [
    "Mikro mola (kısa ekran molası) takibi Mola Takibi modülüne bağlı; modül genel kullanıma açılınca bu şablonda varsayılan açık gelecek.",
  ],
};

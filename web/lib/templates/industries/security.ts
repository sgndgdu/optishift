import type { IndustryProfile } from "../types";

/** Özel Güvenlik ve Tesis Yönetimi */
export const security: IndustryProfile = {
  key: "security",
  label: "Özel Güvenlik ve Tesis",
  description: "Güvenlik şirketi, site ve tesis yönetimi. 12 saatlik dönüşümlü nöbet, kimlik kartı kontrolü, devriye.",
  icon: "ShieldCheck",

  variants: [
    {
      key: "12-24",
      label: "12/24 Dönüşümlü",
      description: "12 saat çalışma, en az 24 saat dinlenme; gündüz ve gece dönüşür.",
      departments: ["Nizamiye", "Devriye", "CCTV"],
      shifts: [
        { id: "s-gunduz", name: "Gündüz", start: "08:00", end: "20:00", base_points: 5 },
        { id: "s-gece",   name: "Gece",   start: "20:00", end: "08:00", base_points: 8 },
      ],
      // 12 saatlik vardiyadan sonra 24 saat dinlenme şartı, motoru 12/24 düzenine iter
      rules: { min_rest_hours: 24, balancing_period_weeks: 2 },
      skillRecommendations: [
        { shiftId: "s-gece", skill: "Silahlı Güvenlik Görevlisi", count: 1, reason: "Silahlı koruma gereken sahalarda her gece en az bir silahlı görevli." },
      ],
    },
    {
      key: "12-36",
      label: "12/36 Dönüşümlü",
      description: "12 saat çalışma, en az 36 saat dinlenme.",
      departments: ["Nizamiye", "Devriye", "CCTV"],
      shifts: [
        { id: "s-gunduz", name: "Gündüz", start: "08:00", end: "20:00", base_points: 5 },
        { id: "s-gece",   name: "Gece",   start: "20:00", end: "08:00", base_points: 8 },
      ],
      rules: { min_rest_hours: 36 },
    },
    {
      key: "8-hour",
      label: "8 Saatlik 3 Vardiya",
      description: "08-16, 16-24, 00-08 klasik düzen.",
      departments: ["Nizamiye", "Devriye"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "08:00", end: "16:00", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "16:00", end: "00:00", base_points: 6 },
        { id: "s-gece",  name: "Gece",  start: "00:00", end: "08:00", base_points: 8 },
      ],
    },
  ],

  roles: [
    { id: "proje-muduru",   label: "Güvenlik Proje Müdürü", category: "yonetim", senior: true },
    { id: "guvenlik-amiri", label: "Güvenlik Amiri",        category: "yonetim", senior: true, requiredDocs: ["ogkk-silahsiz"] },
    { id: "silahli",        label: "Silahlı Güvenlik Görevlisi",  category: "operasyon", requiredDocs: ["ogkk-silahli"] },
    { id: "silahsiz",       label: "Silahsız Güvenlik Görevlisi", category: "operasyon", requiredDocs: ["ogkk-silahsiz"] },
    { id: "cctv",           label: "CCTV Operatörü",        category: "operasyon", requiredDocs: ["ogkk-silahsiz"] },
    { id: "devriye",        label: "Devriye Görevlisi",     category: "operasyon", requiredDocs: ["ogkk-silahsiz"] },
    { id: "karsilama",      label: "Karşılama / Resepsiyon", category: "destek" },
    { id: "teknik",         label: "Tesis Teknisyeni",      category: "destek" },
  ],

  documents: [
    { id: "ogkk-silahli", label: "Özel Güvenlik Kimlik Kartı (Silahlı)", aliases: ["Silahlı Kimlik Kartı", "Silahlı Özel Güvenlik Kimlik Kartı"],
      validityMonths: 60, strict: true, legalBasis: "5188 sayılı Özel Güvenlik Hizmetlerine Dair Kanun" },
    { id: "ogkk-silahsiz", label: "Özel Güvenlik Kimlik Kartı (Silahsız)", aliases: ["Silahsız Kimlik Kartı", "Özel Güvenlik Kimlik Kartı"],
      validityMonths: 60, strict: true, legalBasis: "5188 sayılı Özel Güvenlik Hizmetlerine Dair Kanun" },
    { id: "ilk-yardim", label: "İlk Yardım Sertifikası", aliases: ["İlkyardım Sertifikası"], validityMonths: 36, strict: false },
  ],

  rules: {
    max_weekly_hours: 45,
    min_rest_hours: 11,
    max_consecutive_days: 6,
    // Özel güvenlikte gece çalışması yazılı onayla 7,5 saati aşabilir
    night_legal_warning_enabled: false,
    clopening_enabled: false,
    hard_shift_points: 5,
  },

  modules: {
    forecasting_enabled: false,
    compliance_tracking_enabled: true,
    handover_notes_enabled: true,
    fatigue_radar_enabled: true,
    open_shifts_enabled: true,
    overtime_tracking_enabled: true,
    tip_pooling_enabled: false,
  },

  taskTemplates: {
    "*": ["Devriye turu (saatlik)", "Kamera ve alarm kontrolü", "Olay tutanağı defteri"],
  },

  legalNotes: [
    { title: "12 saatlik vardiya", text: "Günlük çalışma 11 saati aşamaz. 12 saatlik vardiya en az 1 saat ara dinlenmeyle 11 saat fiili çalışma olarak planlanır; molaların gerçekten kullandırıldığını kayıt altına alın.", basis: "4857 sayılı İş Kanunu, ara dinlenmesi" },
    { title: "Gece nöbeti 7,5 saati aşabilir", text: "Özel güvenlik hizmetlerinde gece çalışması işçinin yazılı onayıyla 7,5 saati aşabilir.", basis: "4857 sayılı İş Kanunu, gece çalışması" },
    { title: "Kimlik kartı", text: "Geçerli özel güvenlik kimlik kartı olmayan kişi görevlendirilemez. Belge Takibi açıkken kartı eksik ya da süresi dolmuş kişi ilgili role atanmaz.", basis: "5188 sayılı Kanun" },
  ],

  nudges: {
    terms: { shift: "nöbet", shifts: "nöbetler", openShift: "boş nöbet", handover: "nöbet devri", staff: "görevli" },
    inboxPriority: ["late", "certifications", "open-shifts", "handover", "fatigue", "next-week", "approvals", "overtime", "availability", "tasks", "accounts"],
    inboxCopy: {
      late: { title: "{n} görevli nöbet noktasına gelmedi", detail: "Nokta boş kalmasın, yedek görevli çağırın." },
      "open-shifts": { title: "{n} boş nöbet henüz dolmadı" },
      handover: { title: "{n} nöbet devir notu henüz teslim alınmadı" },
    },
    firstSteps: [
      "Her görevlinin kimlik kartını (silahlı/silahsız) ve bitiş tarihini girin; süresi dolan kart otomatik engel olur.",
      "GPS doğrulamalı giriş açık: görevli ancak nöbet noktasındayken vardiyasını başlatabilir.",
      "12 saatlik gece nöbeti için görevlilerden yazılı onay alın.",
    ],
  },

  limitations: [
    "Saha devriyesi için ara nokta (checkpoint) okutma henüz yok; giriş GPS ile, tur kontrolü görev listesiyle takip edilir.",
  ],
};

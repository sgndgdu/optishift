import type { IndustryProfile } from "../types";

/** Lojistik ve Depo Yönetimi */
export const logistics: IndustryProfile = {
  key: "logistics",
  label: "Lojistik ve Depo",
  description: "Depo, dağıtım merkezi, filo. Sürücü belgeleri, araç devir-teslimi ve fazla mesai kontrolü.",
  icon: "Truck",

  variants: [
    {
      key: "warehouse-3",
      label: "Depo · 3 Vardiya",
      description: "Mal kabul, toplama ve sevkiyat gece gündüz sürer.",
      departments: ["Mal Kabul", "Toplama", "Sevkiyat"],
      shifts: [
        { id: "s-sabah", name: "Sabah", start: "06:00", end: "14:00", base_points: 4 },
        { id: "s-aksam", name: "Akşam", start: "14:00", end: "22:00", base_points: 5 },
        { id: "s-gece",  name: "Gece",  start: "22:00", end: "05:30", base_points: 8, is_night: true },
      ],
      skillRecommendations: [
        { shiftId: "s-gece", skill: "Forklift Operatörü", count: 1, reason: "Gece sevkiyatında belgeli forklift operatörü bulunmalı." },
      ],
    },
    {
      key: "distribution",
      label: "Dağıtım / Filo",
      description: "Sabah erken çıkan araçlar, gün içinde teslimat.",
      departments: ["Sevkiyat", "Filo", "Depo"],
      shifts: [
        // driving_hours: direksiyon süresi; motor AETR sınırlarını uygular (günde 9, haftada 56, iki haftada 90 saat)
        { id: "s-erken", name: "Erken Çıkış", start: "05:30", end: "14:30", base_points: 5, driving_hours: 7 },
        { id: "s-gun",   name: "Gündüz",      start: "09:00", end: "18:00", base_points: 4, driving_hours: 6 },
      ],
    },
    {
      key: "cargo",
      label: "Kargo Aktarma",
      description: "Gece yoğun aktarma, gündüz dağıtım.",
      departments: ["Aktarma", "Dağıtım"],
      shifts: [
        { id: "s-gunduz", name: "Gündüz", start: "08:00", end: "17:00", base_points: 4 },
        { id: "s-gece",   name: "Gece Aktarma", start: "22:00", end: "05:30", base_points: 8, is_night: true },
      ],
    },
  ],

  roles: [
    { id: "depo-muduru",    label: "Depo Müdürü",          category: "yonetim", senior: true },
    { id: "vardiya-sefi",   label: "Vardiya Şefi",         category: "yonetim", senior: true },
    { id: "sevkiyat-plan",  label: "Sevkiyat Planlama",    category: "destek" },
    { id: "tir-soforu",     label: "Tır Şoförü",           category: "operasyon", requiredDocs: ["ehliyet-ce", "src", "psikoteknik", "takograf"] },
    { id: "kamyonet-soforu", label: "Kamyonet Şoförü",     category: "operasyon", requiredDocs: ["ehliyet-b", "src", "psikoteknik"] },
    { id: "adr-sofor",      label: "Tehlikeli Madde Şoförü (ADR)", category: "operasyon", requiredDocs: ["ehliyet-ce", "src", "psikoteknik", "adr", "takograf"] },
    { id: "kurye",          label: "Kurye",                category: "operasyon", requiredDocs: ["ehliyet-b"] },
    { id: "forklift",       label: "Forklift Operatörü",   category: "operasyon", requiredDocs: ["forklift-belgesi"] },
    { id: "reach-truck",    label: "Reach Truck Operatörü", category: "operasyon", requiredDocs: ["forklift-belgesi"] },
    { id: "toplama",        label: "Toplama Personeli",    category: "operasyon" },
    { id: "mal-kabul",      label: "Mal Kabul",            category: "operasyon" },
    { id: "paketleme",      label: "Paketleme",            category: "destek" },
  ],

  documents: [
    { id: "src", label: "SRC Belgesi", aliases: ["SRC-3", "SRC-4", "SRC 3", "SRC 4", "Mesleki Yeterlilik (SRC)"], strict: true,
      legalBasis: "Karayolu Taşıma Yönetmeliği" },
    { id: "psikoteknik", label: "Psikoteknik Değerlendirme Belgesi", aliases: ["Psikoteknik"], validityMonths: 60, strict: true },
    { id: "adr", label: "ADR / SRC-5 Tehlikeli Madde Belgesi", aliases: ["ADR Belgesi", "SRC-5", "SRC 5"], validityMonths: 60, strict: true },
    { id: "takograf", label: "Takograf Sürücü Kartı", aliases: ["Sürücü Kartı", "Takograf Kartı"], validityMonths: 60, strict: true },
    { id: "ehliyet-ce", label: "CE Sürücü Belgesi", aliases: ["CE Ehliyet"], strict: true },
    { id: "ehliyet-b", label: "B Sürücü Belgesi", aliases: ["B Ehliyet"], strict: true },
    { id: "forklift-belgesi", label: "Forklift Operatör Belgesi", aliases: ["İş Makinesi Operatör Belgesi"], strict: true },
  ],

  rules: {
    max_weekly_hours: 45,
    min_rest_hours: 11,
    max_consecutive_days: 6,
    no_night_to_morning: true,
    consecutive_night_weeks_enabled: true,
    night_legal_warning_enabled: true,
    clopening_enabled: true,
    clopening_min_rest_hours: 12,
    clopening_penalty_weight: 40,
    hard_shift_points: 5,
    checkin_required: true,
    auto_open_shift_on_late: true,
    late_threshold_min: 15,
  },

  modules: {
    handover_log_enabled: true,
    overtime_tracking_enabled: true,
    compliance_tracking_enabled: true,
    fatigue_radar_enabled: true,
    open_shifts_enabled: true,
    kiosk_mode_enabled: true,
    tip_pooling_enabled: false,
  },

  taskTemplates: {
    "*": ["Araç ön kontrol (lastik, far, yağ)", "Araç devir-teslim formu", "Forklift günlük kontrolü"],
  },

  legalNotes: [
    { title: "Sürüş süreleri", text: "Sürücüler için günlük sürüş 9 saati (haftada iki kez 10 saati), haftalık sürüş 56 saati, iki haftalık toplam 90 saati aşamaz; 4,5 saat sürüşten sonra 45 dakika mola verilir. OptiShift vardiya süresini sınırlar, sürüş süresinin kaynağı takograf kayıtlarıdır.", basis: "AETR ve Karayolu Taşıma Yönetmeliği" },
    { title: "İşçi olarak çalışma süresi", text: "Sürücü aynı zamanda işçi olduğu için İş Kanunu'nun haftalık 45 saati de geçerlidir; ikisinden hangisi daha sıkıysa o uygulanır.", basis: "4857 sayılı İş Kanunu" },
    { title: "Gece çalışması 7,5 saat", text: "Depo gece vardiyası 7,5 saati aşamaz; bu yüzden 22:00-05:30 gelir.", basis: "4857 sayılı İş Kanunu" },
  ],

  nudges: {
    terms: { shift: "vardiya", shifts: "vardiyalar", openShift: "açık vardiya", handover: "araç devir-teslimi", staff: "personel" },
    inboxPriority: ["late", "certifications", "overtime", "fatigue", "handover", "open-shifts", "next-week", "approvals", "availability", "tasks", "accounts"],
    inboxCopy: {
      handover: { title: "{n} araç devir-teslim notu henüz teslim alınmadı", detail: "Araç, not okunmadan yola çıkmasın." },
      overtime: { title: "{n} kişi yıllık fazla mesai sınırına yaklaştı", detail: "Sürücü yorgunluğu kaza riskidir; bu hafta mesaiyi dağıtın." },
    },
    firstSteps: [
      "Sürücülerin SRC, psikoteknik ve takograf kartı bitiş tarihlerini girin; süresi dolan belge sürücüyü direksiyondan otomatik indirir.",
      "Araç devir-teslimi açık: şoför çıkışta aracın durumunu not bırakır, sonraki şoför okumadan başlayamaz.",
      "Forklift belgesi olanları Forklift Operatörü olarak işaretleyin.",
    ],
  },

  // Sürüş süresi artık vardiya tanımında (driving_hours); gerçekleşen sürüş yine takografta
  limitations: [],
};

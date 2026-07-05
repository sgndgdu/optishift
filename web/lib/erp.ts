// Tek ERP kataloğu — hem müdür Entegrasyonlar sayfası hem supervisor Ayarlar
// aynı listeyi kullanır. Bağlı sistem organizations.connected_erp'ta tutulur
// (tek değer: bir organizasyon aynı anda tek ERP'ye bağlıdır).

export interface ErpSystem {
  value: string;   // organizations.connected_erp'a yazılan değer
  label: string;
  desc: string;
  logo: string;    // kart üzerindeki kısa rozet metni
  color: string;   // rozet arka plan sınıfı
}

export const ERP_SYSTEMS: ErpSystem[] = [
  { value: "SAP_SuccessFactors", label: "SAP SuccessFactors",  desc: "SAP S/4HANA & SuccessFactors REST/OData API", logo: "SAP", color: "bg-blue-600" },
  { value: "SAP_ECC",            label: "SAP ECC",             desc: "SAP ECC 6.0 / R/3 RFC-BAPI bağlantısı",       logo: "ECC", color: "bg-blue-800" },
  { value: "Nebim_V3",           label: "Nebim V3",            desc: "Nebim V3 REST API — mağaza ağacı + çalışanlar", logo: "NBM", color: "bg-teal-600" },
  { value: "Logo",               label: "Logo Tiger / Netsis", desc: "Logo / Netsis n8n entegrasyon şablonu",       logo: "LGO", color: "bg-orange-600" },
  { value: "Mikro",              label: "Mikro ERP",           desc: "Mikro ERP güvenli DB tüneli",                 logo: "MKR", color: "bg-slate-600" },
  { value: "Luca",               label: "Luca",                desc: "Luca Bulut API — bordro aktarımı",            logo: "LCA", color: "bg-purple-600" },
  { value: "Orka",               label: "Orka",                desc: "Orka Bordro API + Excel/CSV aktarımı",        logo: "ORK", color: "bg-rose-600" },
];

export function erpLabel(value: string | null | undefined): string {
  if (!value) return "Bağlı Değil";
  return ERP_SYSTEMS.find(e => e.value === value)?.label ?? value;
}

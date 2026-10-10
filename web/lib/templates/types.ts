/**
 * Sektörel Zeka ve Akıllı Şablon Motoru: veri modeli.
 *
 * Her sektör tek bir `IndustryProfile` nesnesidir (strateji deseni): roller, belgeler,
 * vardiya şablonları (alt türler), yasal/kural varsayılanları ve iletişim dili aynı
 * yerde durur. Kayıtlar statik ve tip güvenlidir (lib/templates/industries/*): sürüm
 * kontrolünde izlenir, test edilir, veritabanı göçü gerektirmez. Şube hangi sektörü
 * seçtiyse `locations.rules.industry` / `industry_variant` anahtarlarında tutulur.
 *
 * Tasarım ilkesi: her alan JSON'a çevrilebilir (fonksiyon yok, {n} yer tutuculu metin).
 * İleride AI Copilot ve Excel içe aktarma aynı nesneleri okuyup yazabilsin diye.
 */

import type { ShiftDefinition } from "@/lib/types";
import type { ModuleKey } from "@/lib/moduleVisibility";

export type IndustryKey =
  | "hospitality"
  | "manufacturing"
  | "retail"
  | "healthcare"
  | "security"
  | "logistics"
  | "callcenter";

/** lucide-react ikon adı. lib katmanı React'e bağımlı kalmasın diye ad olarak tutulur. */
export type IndustryIcon =
  | "UtensilsCrossed" | "Factory" | "ShoppingBag" | "Stethoscope" | "ShieldCheck" | "Truck" | "Headset";

/** Belge / sertifika tanımı. `label` personel belgesinde yazılan adla eşleştirilir (büyük/küçük harf duyarsız). */
export interface DocumentSpec {
  id: string;
  label: string;
  /** Aynı belgenin sahada kullanılan diğer adları, örn. "Portör Muayenesi" için "Sağlık Karnesi". */
  aliases?: string[];
  /** Tipik geçerlilik süresi (ay). Bilgi amaçlıdır; kesin süre belgedeki son tarihtir. */
  validityMonths?: number;
  /**
   * Kritik belge: bağlı olduğu rol için belge HİÇ girilmemişse de rol düşer
   * (örn. Silahlı Özel Güvenlik Kimlik Kartı). Kritik olmayan belgede sadece süresi
   * dolmuş belge rolü düşürür, hiç girilmemiş belge engel sayılmaz.
   */
  strict: boolean;
  /** Herkes için zorunlu mu? Süresi dolarsa (kritikse eksikse de) kişi o hafta plana hiç alınmaz. */
  requiredForAll?: boolean;
  /** Kısa dayanak, örn. "5188 sayılı Kanun". Kesin madde numarası bilinmiyorsa yazılmaz. */
  legalBasis?: string;
}

export type RoleCategory = "yonetim" | "operasyon" | "destek";

/** Pozisyon. `label` personelin yetkinlik listesine yazılan ve vardiyanın zorunlu yetkinliğiyle eşleşen metindir. */
export interface RoleSpec {
  id: string;
  label: string;
  category: RoleCategory;
  /** Bu rolü üstlenebilmek için geçerli olması gereken belgeler (DocumentSpec.id). */
  requiredDocs?: string[];
  /** Kıdemli sayılır (Kıdemli Personel Kuralı için öneri). */
  senior?: boolean;
  /** Sadece bu alt türlerde listelenir (IndustryVariant.key); yoksa sektörün tüm alt türlerinde. */
  variants?: string[];
}

/** Sektör içindeki alt tür (örn. Yeme-İçme → Kafe / Restoran / Bar / Otel). Vardiya şablonunu belirler. */
export interface IndustryVariant {
  key: string;
  label: string;
  description: string;
  shifts: ShiftDefinition[];
  /** Önerilen departmanlar (otomatik oluşturulmaz, personel ihtiyacı tablosu düz kalsın). */
  departments?: string[];
  /** Bu alt türe özel kural farkları (sektör kurallarının üstüne yazılır). */
  rules?: Partial<IndustryRules>;
  /**
   * Önerilen zorunlu yetkinlikler (örn. gece postasında ≥1 Bakım Teknisyeni).
   * Vardiyaya OTOMATİK YAZILMAZ: motor bu yetkinliğe sahip kimse yokken vardiyayı hiç
   * açamaz, yeni şubede roller henüz işaretli değildir. Müdüre öneri olarak gösterilir.
   */
  skillRecommendations?: { shiftId: string; skill: string; count: number; reason: string }[];
}

/**
 * `locations.rules` içine yazılabilen kural anahtarları. Hepsi motor ya da
 * uygulama tarafından gerçekten okunan alanlardır (bkz. lib/__tests__/industries.test.ts).
 */
export interface IndustryRules {
  max_weekly_hours: number;
  min_rest_hours: number;
  max_consecutive_days: number;
  balancing_period_weeks: number;
  no_night_to_morning: boolean;
  night_legal_warning_enabled: boolean;
  clopening_enabled: boolean;
  clopening_min_rest_hours: number;
  clopening_penalty_weight: number;
  hard_shift_points: number;
  overtime_threshold_hours: number;
  handover_notes_enabled: boolean;
}

export interface LegalNote {
  title: string;
  text: string;
  /** Kısa dayanak (kanun/yönetmelik adı). */
  basis?: string;
}

/** Ana Sayfa Bekleyen İşler maddelerinin kimlikleri (lib/inbox.ts ile aynı). */
export type InboxItemId =
  | "add-personnel" | "late" | "fatigue" | "approvals" | "accounts" | "handover"
  | "tasks" | "open-shifts" | "next-week" | "availability" | "overtime" | "certifications" | "industry";

/** Sektöre göre dil ve öncelik (Davranışsal Dürtme katmanı). */
export interface IndustryNudges {
  /** Sektörde yerleşik terimler. Yalın halde tutulur; çekimli cümleler aşağıdaki kalıplarda hazır yazılır. */
  terms: {
    shift: string;          // "vardiya" | "nöbet" | "posta"
    shifts: string;         // "vardiyalar"
    openShift: string;      // "açık vardiya" | "boş nöbet"
    handover: string;       // "devir-teslim" | "nöbet teslimi"
    staff: string;          // "personel" | "ekip" | "temsilci"
  };
  /** Aynı aciliyetteki maddeler arasında sektörün en büyük derdi üste çıkar. */
  inboxPriority: InboxItemId[];
  /** Bekleyen İşler başlıklarının sektöre özel hali. {n} sayıyla değiştirilir. */
  inboxCopy?: Partial<Record<InboxItemId, { title?: string; detail?: string }>>;
  /** Şube açıldığında gösterilen "ilk adımlar" önerileri. */
  firstSteps: string[];
}

export interface IndustryProfile {
  key: IndustryKey;
  label: string;
  /** Tek satırlık, müdürün kendini tanıyacağı açıklama. */
  description: string;
  icon: IndustryIcon;
  variants: IndustryVariant[];
  roles: RoleSpec[];
  documents: DocumentSpec[];
  /** Sektör kural varsayılanları (Yasal Kısıt Dağıtımı katmanı). */
  rules: Partial<IndustryRules>;
  /** Varsayılan olarak açılacak / kapatılacak özellikler. */
  modules: Partial<Record<ModuleKey, boolean>>;
  /** Vardiya görev şablonları ("*" = tüm vardiyalar). Görev Listeleri açıkken kullanılır. */
  taskTemplates?: Record<string, string[]>;
  legalNotes: LegalNote[];
  nudges: IndustryNudges;
  /** Motorun henüz karşılamadığı, bilinçli olarak belgelenen sınırlar. */
  limitations?: string[];
}

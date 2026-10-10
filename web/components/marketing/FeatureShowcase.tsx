import {
  Check, CalendarDays, Layers, ShieldCheck, Smartphone, Clock, FileSpreadsheet, Users, Sparkles, StickyNote,
} from "lucide-react";

/**
 * Tanıtım: bütün özelliklerin listesi (/ozellikler).
 * Liste koddaki özelliklerden çıkarıldı (2026-10-07); yeni özellik eklenince buraya da yazın.
 */

const st = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/* ─── Bütün özellikler ─────────────────────────────────────── */
export const FEATURE_GROUPS: { icon: typeof Check; title: string; items: string[] }[] = [
  {
    icon: Sparkles, title: "Yapay zekâ",
    items: [
      "İşletmenizi anlatarak kurulum",
      "Kâğıttaki ya da Excel'deki çizelgenin fotoğrafından kurulum: ekip, vardiyalar ve günlük kişi sayısı okunur",
      "Departman, vardiya ve günlük kişi sayısı önerisi",
      "İşletme Asistanı: işletmenizle ilgili sorulara cevap verir",
      "İşletme Asistanı işlem önerir: izin ekler, talepleri karara bağlar, gelemeyen kişinin yerine birini bulur",
      "Hazır çözümler: biri izin isteyince ya da gelemeyeceğini söyleyince yerine uygun kişi seçilmiş olarak gelir, tek dokunuşla onaylanır",
      "Sorumlu ve işletme sahibi için anlık bildirim",
      "Aylık özet: kaç planın otomatik hazırlandığı, boşalan vardiyaların kaçının dolduğu, kural aşımı olup olmadığı ve fazla mesainin önceki aya göre değişimi",
      "Hiçbir kayıt sizin onayınız olmadan değişmez",
    ],
  },
  {
    icon: CalendarDays, title: "Planlama",
    items: [
      "Gereken kişi sayısına göre otomatik plan",
      "Otomatik Pilot: her hafta seçtiğiniz gün ve saatte taslak plan hazırlanır",
      "Geçmiş haftalardan ihtiyaç önerisi",
      "Normal hafta ve kampanya haftası için kayıtlı ihtiyaç tabloları",
      "Elle düzenlediğiniz vardiyalar korunur",
      "Mevcut planı olabildiğince koruyarak yeniden hazırlama",
      "İzin ya da ihtiyaç değişirse planın nasıl değişeceğini görme",
      "Bir kişinin vardiyaya neden yazıldığını görme",
      "Yayından önce kural kontrolü",
    ],
  },
  {
    icon: StickyNote, title: "Takvim",
    items: [
      "Resmî tatiller ve bayramlar planda",
      "Güne ya da haftaya not: kampanya, etkinlik, denetim, kapalı gün",
      "Çalışma saatleri ve kapalı günler",
      "Bayram ve tatillerde ihtiyacı gözden geçirme uyarısı",
      "Geçmiş haftaların yayın arşivi",
    ],
  },
  {
    icon: Layers, title: "Departmanlar ve şubeler",
    items: [
      "Departmanlar ve alt departmanlar",
      "Her departman için ayrı kişi sayısı",
      "Birden çok departmanda çalışabilen kişi",
      "Departman sorumlusu kendi planını hazırlayıp onaya gönderir",
      "Birden çok şubede çalışma",
      "Şubeler arasında sırayla çalışma",
      "Başka şubeden yedek",
      "Bütün şubelerin durumu tek ekranda",
    ],
  },
  {
    icon: ShieldCheck, title: "Kurallar ve adalet",
    items: [
      "İş Kanunu kuralları kurulu gelir: haftalık saat, dinlenme, hafta tatili",
      "Gece vardiyası en fazla 7,5 saat; gebe, emziren ve 18 yaşından küçüklere gece vardiyası yazılmaz",
      "Denkleştirme dönemi",
      "Yıllık izin hakkı kıdeme göre hesaplanır",
      "Adalet Puanı: zor günler kişiler arasında sırayla dağıtılır",
      "Zor günleri siz seçersiniz: her güne ayrı puan, bayramlar ve kendi özel günleriniz (örneğin yılbaşı gecesi)",
      "Birlikte çalışamaz kişiler",
      "Yorgunluk ve kaza riski uyarısı",
      "Dönüşümlü çalışma düzeni (ör. 4 gün çalış, 2 gün izin)",
    ],
  },
  {
    icon: Smartphone, title: "Ekibiniz için",
    items: [
      "Uygunluk bildirme",
      "İzin isteği",
      "Arkadaşıyla vardiya değiştirme",
      "Gelemeyeceği vardiyayı ekibe duyurma",
      "Açık vardiyayı alma",
      "Aynı vardiyada kimlerle çalışacağını görme",
      "Anlık bildirim ve ekip sohbeti",
      "Acil durum bildirimi",
    ],
  },
  {
    icon: Clock, title: "Vardiya günü",
    items: [
      "Gelemeyen kişi için uygun yedek önerisi",
      "Devir-teslim notu",
      "Belge ve sertifika süresi takibi",
    ],
  },
  {
    icon: FileSpreadsheet, title: "Rapor ve maliyet",
    items: [
      "Excel olarak indirilen puantaj",
      "Çalışanın onayladığı fazla mesai kaydı",
      "Haftalık personel maliyeti ve sınırı",
      "Aylık rapor ve ay kilitleme",
      "Adalet raporu",
    ],
  },
  {
    icon: Users, title: "Hesaplar ve yetki",
    items: [
      "Sorumlulara tek tek seçilen yetkiler",
      "WhatsApp ile gönderilen davet bağlantısı",
      "Ekibin kendisinin kaydolabileceği bağlantı",
      "Excel'den toplu ekleme",
      "Telefon, e-posta ya da Google ile giriş",
    ],
  },
  {
    icon: Sparkles, title: "İşletme türüne göre ayarlar",
    items: [
      "Kafe, restoran, otel, perakende, fabrika, lojistik, sağlık, güvenlik, çağrı merkezi",
      "Sektöre göre vardiyalar ve kurallar",
      "Nöbet (sağlık, fabrika, güvenlik)",
      "Sürüş süresi sınırları (lojistik)",
      "Çağrı yoğunluğundan kişi hesabı (çağrı merkezi)",
    ],
  },
];

export function FeatureCatalog() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURE_GROUPS.map(({ icon: Icon, title, items }, i) => (
        <div key={title} className="m-up rounded-3xl bg-white p-6 ring-1 ring-slate-900/5" style={st(80 + (i % 3) * 90)}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700"><Icon size={18} /></span>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
          <ul className="mt-4 space-y-2">
            {items.map((t) => (
              <li key={t} className="flex gap-2 text-[14.5px] leading-snug text-slate-600">
                <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-forest-600" /> {t}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

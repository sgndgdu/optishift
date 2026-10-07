import {
  Check, CalendarDays, Layers, ShieldCheck, Smartphone, Clock, FileSpreadsheet, Users, Sparkles, StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tanıtım: departmanlar, takvim (bayram + güne not) önizlemeleri ve bütün özelliklerin listesi.
 * Önizlemeler süs (aria-hidden), örnek veri; görünüm uygulamadaki ekranlara benzer.
 * Liste koddaki özelliklerden çıkarıldı (2026-10-07); yeni özellik eklenince buraya da yazın.
 */

const st = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;
const TONE = {
  A: "bg-forest-100 text-forest-800",
  R: "bg-sky-100 text-sky-800",
  K: "bg-ember-100 text-ember-800",
};

/** Departmanlara bölünmüş gün planı: sayaçlar departman başına, joker kişi başka departmanda */
export function DepartmentsMock({ className }: { className?: string }) {
  const depts = [
    { name: "Salon", sub: "Salon › Teras", need: "2/2", rows: [["Elif K.", "A", "Açılış"], ["Mert Y.", "K", "Kapanış"]] },
    { name: "Mutfak", need: "2/2", rows: [["Can B.", "A", "Açılış"], ["Ayşe D.", "K", "Kapanış"]], pending: true },
    { name: "Bar", need: "2/2", rows: [["Burak T.", "K", "Kapanış"], ["Deniz Ö.", "R", "Ara"]], joker: "Deniz Ö." },
  ] as const;
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {depts.map((dp, i) => (
        <div key={dp.name} className="m-up rounded-2xl bg-white p-3.5 ring-1 ring-slate-900/5" style={st(150 + i * 140)}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[14px] font-semibold text-slate-900">{dp.name}</span>
            <span className="flex items-center gap-1.5">
              {"pending" in dp && <span className="rounded-full bg-ember-50 px-2 py-0.5 text-[11.5px] font-semibold text-ember-700">Onaya gönderildi</span>}
              <span className="flex items-center gap-1 rounded-full bg-forest-50 px-2 py-0.5 text-[11.5px] font-semibold text-forest-700"><Check size={11} strokeWidth={3} /> {dp.need}</span>
            </span>
          </div>
          <div className="space-y-1">
            {dp.rows.map(([n, c, l]) => (
              <div key={n} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate text-slate-700">
                  {n}
                  {"joker" in dp && dp.joker === n && <span className="ml-1.5 text-[11.5px] text-slate-400">Salon çalışanı, bugün Bar&apos;da</span>}
                </span>
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold", TONE[c])}>{l}</span>
              </div>
            ))}
          </div>
          {"sub" in dp && <p className="mt-2 text-[11.5px] text-slate-400">Alt departman: {dp.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** Haftanın takvimi: resmî tatil, güne ve haftaya düşülen notlar */
export function CalendarMock({ className }: { className?: string }) {
  const days = [
    { d: "Pzt", n: 26 },
    { d: "Sal", n: 27, note: { e: "📋", t: "Belediye denetimi", tone: "bg-orange-50 text-orange-700 ring-orange-200" } },
    { d: "Çar", n: 28, note: { e: "📌", t: "Arife, 13:00'te kapanış", tone: "bg-slate-100 text-slate-600 ring-slate-200" } },
    { d: "Per", n: 29, holiday: "Cumhuriyet Bayramı" },
    { d: "Cum", n: 30, note: { e: "🎉", t: "Akşam canlı müzik", tone: "bg-blue-50 text-blue-700 ring-blue-200" } },
    { d: "Cmt", n: 31, note: { e: "🎯", t: "Hafta sonu menüsü", tone: "bg-ember-50 text-ember-700 ring-ember-200" } },
    { d: "Paz", n: 1 },
  ];
  return (
    <div className={cn("rounded-2xl bg-white p-4 ring-1 ring-slate-900/5", className)} aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-slate-900">26 Ekim - 1 Kasım</span>
        <span className="rounded-full bg-ember-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-ember-700">🎯 Hafta notu: Ekim kampanyası</span>
      </div>
      <div className="space-y-1.5">
        {days.map((x, i) => (
          <div key={x.n} className={cn("m-up flex items-center gap-3 rounded-xl px-3 py-2", x.holiday ? "bg-red-50 ring-1 ring-red-100" : "bg-slate-50")} style={st(150 + i * 90)}>
            <span className="w-14 shrink-0 text-[13px] font-semibold text-slate-700">{x.d} {x.n}</span>
            <span className="min-w-0 flex-1 truncate">
              {x.holiday && <span className="text-[12.5px] font-semibold text-red-600">🎌 {x.holiday}</span>}
              {x.note && <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-0.5 text-[12px] font-medium ring-1", x.note.tone)}>{x.note.e} {x.note.t}</span>}
            </span>
          </div>
        ))}
      </div>
      <p className="m-up mt-3 rounded-xl bg-cream px-3 py-2 text-[12.5px] leading-snug text-slate-600" style={st(900)}>
        İhtiyaç önerisi: Perşembe resmî tatil, kaç kişi gerektiğini gözden geçirin.
      </p>
    </div>
  );
}

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
      "Sorumlu ve işletme sahibi için bildirim zili ve telefon bildirimi",
      "Hiçbir kayıt sizin onayınız olmadan değişmez",
    ],
  },
  {
    icon: CalendarDays, title: "Planlama",
    items: [
      "Gereken kişi sayısına göre otomatik plan",
      "Otomatik Pilot: her hafta taslak plan hazırlanır",
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
      "Adalet Puanı: zor vardiyalar sırayla dağıtılır",
      "Birlikte çalışamaz kişiler",
      "Yorgunluk ve kaza riski uyarısı",
      "Dönüşümlü çalışma düzeni (ör. 4 gün çalış, 2 gün izin)",
    ],
  },
  {
    icon: Smartphone, title: "Ekibin telefonu",
    items: [
      "Uygunluk bildirme",
      "İzin isteği",
      "Arkadaşıyla vardiya değiştirme",
      "Gelemeyeceği vardiyayı ekibe duyurma",
      "Açık vardiya üstlenme",
      "Aynı vardiyada kimlerle çalışacağını görme",
      "Anlık bildirim ve ekip sohbeti",
      "Acil durum bildirimi",
    ],
  },
  {
    icon: Clock, title: "Vardiya günü",
    items: [
      "Telefondan giriş-çıkış",
      "Konum doğrulamalı giriş ya da ortak tablet",
      "Geç kalan ve gelmeyen kişi için uyarı",
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

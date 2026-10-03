/**
 * Arayüz sözlüğü — kullanıcıya görünen terimlerin tek kaynağı.
 *
 * Hedef kitle teknik olmayan şube müdürü / fabrika amiri. Mühendislik jargonu,
 * İngilizce karşılıklar ve plaza Türkçesi yerine sade, standart Türkçe kullanılır.
 * `lib/__tests__/copy.test.ts` arayüz dosyalarını tarar; GLOSSARY'deki yasaklı
 * bir ifade kullanıcıya görünen metne geri sızarsa test kırılır.
 *
 * Kapsam: sadece görünür metin. Kod tanımlayıcıları, route'lar
 * (/portal/availability), DB alanları (availability_collection_enabled) ve
 * rules anahtarları olduğu gibi kalır.
 */

export type GlossaryEntry = {
  /** Arayüzde artık kullanılmayan ifade (büyük/küçük harf duyarsız aranır). */
  avoid: string;
  /** Yerine kullanılacak ifade. */
  use: string;
  /** Neden değişti. */
  why?: string;
};

export const GLOSSARY: GlossaryEntry[] = [
  { avoid: "müsait",            use: "uygun / uygunluk", why: "Standart Türkçe karşılık" },
  { avoid: "OR-Tools",          use: "otomatik planlama", why: "Mühendislik terimi" },
  { avoid: "CP-SAT",            use: "otomatik planlama", why: "Mühendislik terimi" },
  { avoid: "çözücü",            use: "otomatik planlama", why: "Mühendislik terimi" },
  { avoid: "optimizasyon",      use: "planlama", why: "Mühendislik terimi" },
  { avoid: "optimize",          use: "daha dengeli", why: "Plaza Türkçesi" },
  { avoid: "minimize",          use: "azaltmak", why: "İngilizce" },
  { avoid: "standart sapma",    use: "eşit dağılım", why: "İstatistik terimi" },
  { avoid: "algoritma",         use: "otomatik planlama", why: "Mühendislik terimi" },
  { avoid: "Kural Motoru",      use: "Planlama Kuralları", why: "Mühendislik terimi" },
  { avoid: "kısıt",             use: "kural / sınır / engel", why: "Mühendislik terimi" },
  { avoid: "clopening",         use: "kapanıştan açılışa", why: "İngilizce" },
  { avoid: "Kapasite Planı",    use: "Personel İhtiyacı", why: "Ne istendiğini doğrudan söyler" },
  { avoid: "Kapasite matris",   use: "Personel İhtiyacı tablosu", why: "Mühendislik terimi" },
  { avoid: "Headcount",         use: "Personel İhtiyacı", why: "İngilizce" },
  { avoid: "Uçuş Öncesi",       use: "Hazırlık Kontrolü", why: "Plaza Türkçesi" },
  { avoid: "Lokasyon",          use: "Şube", why: "Ürün genelinde tek terim" },
  { avoid: "sarı gün",          use: "esnek gün", why: "Personel portalda 'Esnek' görüyor; renk adı terim değil" },
  { avoid: "Alan Kota",         use: "Rol Kotaları", why: "Kota Ekip'teki Roller listesinden seçilir" },
  { avoid: "Organizasyon",      use: "İşletme", why: "Plaza Türkçesi" },
  { avoid: "Maksimum",          use: "en fazla / sınır", why: "Standart Türkçe karşılık" },
  { avoid: "Minimum",           use: "en az", why: "Standart Türkçe karşılık" },
  { avoid: "Kümülatif",         use: "birikimli", why: "Teknik terim" },
  { avoid: "ağırlıksız",        use: "(çıkarıldı)", why: "Teknik ayrıntı" },
  { avoid: "Manuel",            use: "elle", why: "Standart Türkçe karşılık" },
  { avoid: "Dashboard",         use: "Ana Sayfa", why: "İngilizce" },
  { avoid: "Revizyon",          use: "güncelleme", why: "Plaza Türkçesi" },
  { avoid: "Canlı Operasyon",   use: "Canlı Durum", why: "Plaza Türkçesi" },
  { avoid: "Öncülüğü",          use: "Erken Yayın", why: "Yanlış türetilmiş" },
  { avoid: "KPI",               use: "gösterge", why: "İngilizce kısaltma" },
  { avoid: "slot",              use: "vardiya / yer", why: "İngilizce" },
  { avoid: "Adalet Skoru",      use: "Adalet Puanı", why: "Ürün genelinde tek terim" },
  { avoid: "Açığa Çıkar",       use: "İlana Çevir", why: "Yanlış anlam (ifşa etmek)" },
  { avoid: "trend",             use: "değişim", why: "İngilizce" },
  { avoid: "Senkronizasyon",    use: "eşitleme", why: "Plaza Türkçesi" },
  { avoid: "opsiyonel",         use: "isteğe bağlı", why: "Plaza Türkçesi" },
  { avoid: "Onboarding",        use: "ilk kurulum", why: "İngilizce" },
  { avoid: "Export",            use: "dışa aktarma", why: "İngilizce" },
  { avoid: "Limitleri",         use: "sınırları", why: "Plaza Türkçesi" },
  { avoid: "sidebar",           use: "menü", why: "İngilizce" },
  { avoid: "Check-in",          use: "vardiya girişi", why: "İngilizce" },
  { avoid: "Check-out",         use: "çıkış", why: "İngilizce" },
  { avoid: "Kiosk Modu",        use: "Ortak Tablet Modu", why: "Teknik terim" },
  { avoid: "YTD",               use: "yıllık / bu yıl", why: "İngilizce kısaltma" },
];

# OptiShift — Shift Oluşturma Test Raporu

**Tarih:** 2026-06-05  
**Senaryo:** LC Waikiki Kadıköy Şubesi — 1 Müdür, 1 Supervisor, 5 Personel  
**Test Yöntemi:** Kod analizi + API incelemesi + DB durumu doğrulama

---

## Test Senaryosu: Gerçek Kullanım Akışı

### Roller & Giriş Bilgileri
| Rol | Email | Şifre |
|-----|-------|-------|
| Müdür | ahmet.mudur.kadikoy@lcw.com | 123456 |
| Supervisor | ayse.yrd.kadikoy@lcw.com | 123456 |
| Personel 1 | joker.hasan.kadikoy@lcw.com | 123456 |
| Personel 2 | cemil.kadikoy@lcw.com | 123456 |
| Personel 3 | derya.kadikoy@lcw.com | 123456 |
| Personel 4 | efe.kadikoy@lcw.com | 123456 |
| Personel 5 | figen.kadikoy@lcw.com | 123456 |

### Şube Ayarları (DB'de Doğrulandı)
- Şube: LCW Kadıköy Şubesi (LOC-KADIKOY)
- Shift tanımları: Sabah 09:00–17:00 (3p), Akşam 14:00–22:00 (5p) ✅

---

## 🔴 KRİTİK BUGLAR (Düzeltilmeden ürün çalışmaz)

### BUG-1: Fairness sayfası yanlış localStorage key okuyor
**Dosya:** `app/(app)/fairness/page.tsx` — satır 32  
```ts
// YANLIŞ — bu employee portalının key'i
return JSON.parse(localStorage.getItem("optishift_portal_user") || "null");
// OLMASI GEREKEN
return JSON.parse(localStorage.getItem("optishift_manager_user") || "null");
```
**Etki:** Müdür fairness sayfasına girdiğinde `user` null gelir, login sayfasına redirect eder. Sayfa **hiç çalışmıyor.**

---

### BUG-2: OR-Tools motoru LCW Kadıköy için sıfır personel döndürüyor
**Dosya:** `app/api/generate/route.ts` — satır 51  
```ts
// YANLIŞ: assigned_location_ids LIKE '%"LOC-KADIKOY"%' çalışır
// AMA aynı zamanda primary_location_id'ye göre de bakmalı
const personnelRows = db.prepare(
  `SELECT * FROM personnel WHERE assigned_location_ids LIKE ? AND status = 'active'`
).all(`%"${branchId}"%`)
```
**Problem:** LCW Kadıköy personelinin `assigned_location_ids` = `["LOC-KADIKOY"]` (JSON array). `LIKE '%"LOC-KADIKOY"%'` doğru eşleşiyor aslında — ama availability tablosunda bu personel için **hiç kayıt yok** (`SELECT * FROM availability WHERE personnel_id LIKE 'P-178013658%'` → boş sonuç). Bu durumda OR-Tools motoru müsaitlik verisi olmadan çalışıyor ancak `available` varsayıyor. Sorun değil ama log'da görünmüyor, müdür neyin ne olduğunu anlamıyor.

**Gerçek sorun:** Otomatik oluştur → vardiyalar atanıyor ama hangi mantıkla atandığı müdüre gösterilmiyor.

---

### BUG-3: Çakışma kontrolünde 11 saat dinlenme kuralı yok
**Dosya:** `app/api/shifts/route.ts`  
CLAUDE.md'de tanımlanan **"İki vardiya arasında en az 11 saat"** kuralı POST handler'da kontrol edilmiyor. Aynı personele Pazartesi 22:00 kapanış + Salı 09:00 açılış atanabiliyor (sadece 11 saat = sınırda, ama gece geçişli olduğu için aslında 11 saat = tam ihlal).  
**Etki:** Yasal uyumluluk riski, temel USP vaadini bozuyor.

---

### BUG-4: Excel export'ta adalet puanı hatalı hesaplanıyor
**Dosya:** `app/api/export/schedule/route.ts` — satır 73–76  
```ts
// Sadece prev_score kullanıyor, bu haftanın vardiya puanlarını eklemiyor
score: s.prev_score ?? 0,
```
KPI sekmesindeki "Adalet Puanı" sütunu bu haftaki atamaların puanlarını içermiyor — sadece önceki dönem birikimini gösteriyor. Excel export'ta büyük yanıltıcı.

---

## 🟡 UX SORUNLARI (Müdürü zorlaştıran, konfüzyon yaratan şeyler)

### UX-1: Popover ekranda kesilme sorunu
**Dosya:** `app/(app)/schedule/page.tsx` — satır 186–192  
Popover X koordinatı hesaplanıyor ama **Y koordinatı hesaplanmıyor**. Tablonun alt satırlarına tıklandığında popover ekranın altına taşıyor, scroll gerekirken görünmez oluyor.

---

### UX-2: Slider tam gece yarısını temsil edemiyor
**Dosya:** `components/schedule/TimeRangeSlider.tsx`  
`trackMax = 1440` → gece yarısı = dakika 1440. Akşam vardiyası 22:00'da bitiyor normal ama 23:59 → 00:00 vardiyası için slider gece yarısını aşmıyor. Gece geçişli vardiyalar (bar/otel senaryoları) slider ile ayarlanamıyor.

---

### UX-3: Slider handle'ları overlap edince çakışıyor
`startMin` ve `endMin` çok yakın olduğunda (örn. 15 dakika aralık) iki handle üst üste biniyor ve sadece üstteki seçilebiliyor. `z-index` veya minimum mesafe garantisi yok.

---

### UX-4: Hücre renklendirmesi müsaitlik yoksa boş kalıyor
Tüm LCW Kadıköy personelinin müsaitlik kaydı DB'de yok. Bu durumda hücreler renksiz (beyaz) geliyor. Müdür hangi günün "müsaitlik bilgisi yok" vs "boş" olduğunu ayırt edemiyor. Legend'da "Bilgi Yok" yazıyor ama beyaz hücre ile müsaitlik göndermemiş kişi görsel olarak aynı.

---

### UX-5: "Müsaitlik İste" butonu sadece bir sonraki haftaya gönderiliyor
**Dosya:** `app/(app)/schedule/page.tsx` — satır 302  
```ts
const nextWeek = getWeekStartISO(weekOffset + 1);
```
Müdür 3 hafta ileri gitmiş takvimi açıksa, "Müsaitlik İste" butonu yine de şu anki haftanın bir sonrasına (hafta+1) gönderiyor. Müdürün baktığı haftayla uyumsuz.

---

### UX-6: Yayınla butonu shift yokken "alert" ile uyarıyor
```ts
alert("Yayınlanacak vardiya yok...");
```
Native browser `alert()` kullanımı tasarımla tutarsız. Uygulamanın kendi UI bileşenleriyle yapılmalı.

---

### UX-7: Otomatik oluştur → mevcut vardiyaları siliyor, uyarı yok
`handleGenerate` fonksiyonu başarılı olduğunda `setCellMap(newCellMap)` ile mevcut manuel girişlerin **tamamını siliyor**. Müdür 30 dakika elle girmiş vardiyaların üzerine otomatik oluştur basarsa hepsini kaybediyor. Onay diyalogu yok.

---

### UX-8: Supervisor — vardiya sayfası read-only ama bu belirtilmiyor
Supervisor schedule sayfasında hücreler tıklanamıyor ama cursor veya görsel bir ipucu yok. "Read-only görünüm" badge'i / uyarısı eksik.

---

## 🟢 ÇALIŞAN / İYİ OLAN ŞEYLER

- **TimeRangeSlider** genel olarak sağlam — pointer events, drag, track click hepsi doğru implement edilmiş.
- **Çakışma kontrolü** (aynı günde farklı şube atama engeli) DB seviyesinde doğru çalışıyor.
- **Excel export** iki sekme yapısı doğru — KPI özeti + haftalık matris formatı CLAUDE.md ile uyumlu.
- **Vardiya yayınlama** akışı (POST /api/shifts → POST /api/schedule/publish) doğru sırayla çalışıyor.
- **Adalet dağılımı paneli** (sağ sidebar) skor renklendirmesi mantığı sağlam, gerçek zamanlı güncelleniyor.
- **Personel portalı** — kendi vardiyasını görme, hafta gezinme düzgün çalışıyor.
- **Çakışma senaryosu:** Joker Hasan'ın iki şubeye atanabileceği (primary + secondary branch) alt yapısı DB'de hazır.

---

## 📋 ÖNCELİK SIRASI — DÜZELTİLECEKLER

| # | Sorun | Efor | Etki |
|---|-------|------|------|
| 1 | BUG-1: Fairness sayfası yanlış key | 2 dk | Sayfa hiç açılmıyor |
| 2 | UX-7: Otomatik oluştur onaysız siliyor | 30 dk | Veri kaybı riski |
| 3 | BUG-3: 11 saat kuralı yok | 1 saat | Yasal uyumluluk |
| 4 | UX-5: Müsaitlik İste yanlış hafta | 5 dk | Konfüzyon |
| 5 | UX-1: Popover Y-taşma | 30 dk | Alt satırlar kullanılamıyor |
| 6 | UX-6: alert() → UI component | 15 dk | Tasarım tutarsızlığı |
| 7 | BUG-4: Excel'de yanlış puan | 30 dk | Yanıltıcı rapor |
| 8 | UX-2: Gece yarısı slider sorunu | 1 saat | Otel/bar senaryoları |
| 9 | UX-3: Handle overlap | 45 dk | Kullanılabilirlik |
| 10 | UX-4/8: Görsel ipuçları eksik | 1 saat | Kullanıcı konfüzyonu |

---

## 🔧 SONRAKI ADIMLAR ÖNERİSİ

**Sprint 1 (Hemen):** BUG-1 düzelt + UX-7 onay dialogu + UX-5 hafta fix  
**Sprint 2 (Bu hafta):** BUG-3 dinlenme kuralı + UX-1 popover fix + UX-6 UI component  
**Sprint 3 (Sonraki hafta):** BUG-4 Excel fix + UX-2 gece slider + UX-3 handle overlap  

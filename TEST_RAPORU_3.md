# OptiShift · 3. Tur Canlı Test Raporu (tüm roller)

**Test tarihi:** 3 Ekim 2026
**Durum:** 31 bulgu, HİÇBİRİ henüz düzeltilmedi. Kullanıcı kararı: bir sonraki oturumda hepsi ele alınacak.
**Ortam:** kayıt ve kurulum canlıda (https://web-nine-drab-19.vercel.app), sonrası localhost:3000 (aynı canlı DB). Asistan canlıda test edildi.

## Test işletmesi (canlı DB'de duruyor, silinmedi)

- **Test Lokanta**, org `ORG-1790976573938`, plan test için DB'den `pro` yapıldı.
- Şubeler: Kadıköy `L-1790976608035`, Beşiktaş `L-1790976637532`.
- Patron: Deniz Yılmaz (`tmp.testlokanta.1003@optishift.test`).
- Bölge müdürü: Selin Kaya (`selin.kaya`, sadece Kadıköy).
- Müdürler: Murat Demir (`murat.demir`, Kadıköy), Ayşe Çelik (`ayse.celik`, Beşiktaş; ücret ve personel silme yetkisi KAPALI).
- Personel: Kadıköy'de 8 kişi (Ali Vural departmansız; Burak Şahin ve Elif Arslan giriş yaptı), Beşiktaş'ta 6 kişi.
- Kadıköy'de 5-11 Ekim planı yayınlandı. Burak↔Elif takası onaylandı, Burak'ın 20-21 Ekim izni onaylandı, Elif Burak'ın Pazartesi vardiyasını açık vardiyadan üstlendi.
- Şifreler test değerleri; sohbete yazılmadı. Gerekirse DB'den davet token'ı ya da şifre sıfırlama kullan.
- **Kullanıcıya sorulacak:** bu işletme silinsin mi? (Silme betiği deseni: §8 "Uçtan uca sadeleştirme", `sql(q, params)`.)

---

## KRİTİK (7)

**K1 · Kurulum yarıda kalıyor, ilk şube ayarsız kalıyor** (bulgu 1 + 12 + 24)
- Ücretsiz planda kurulum sihirbazı ikinci şubeyi eklemeye izin veriyor, en sonda "Free plan limiti: 1 şube" hatası veriyor (metin İngilizce karışık).
- Tekrar "Tamamla"ya basınca ilk denemede açılan Kadıköy "zaten var" diye atlanıyor. Vardiya tanımları, sektör kuralları, çalışma saatleri ve görev listeleri Kadıköy'e HİÇ yazılmıyor. Ekran yine "2 şube vardiya şablonlarıyla kuruldu" diyor.
- Yan etki: Kadıköy müdür ana sayfası "İşletme türünüzü seçin" diyor.
- Kök: `web/app/(app)/onboarding/page.tsx` `saveAll` sadece `newLocationIds` için PATCH yapıyor.
- Çözüm yönü: şube adımında plan limitini göster ya da ikinci şubeyi kilitle; varsayılanları "ayarı boş olan" mevcut şubelere de yaz; hata metni Türkçe olsun.

**K2 · Şube değiştirince açık sayfa eski şubede kalıyor** (bulgu 10)
- Sol üst şube seçiciden Kadıköy → Beşiktaş: bant ve menü "Beşiktaş" oluyor ama Ekip listesi ve toplu eklemedeki departman kontrolü Kadıköy verisiyle kalıyor. Yenileyince düzeliyor. Bu arada yapılan işlem yanlış şubeye gidebilir.
- Kök: `web/components/Sidebar.tsx` `handleLocationChange` sadece `optishift_location_changed` olayı atıyor; bu olayı yalnız schedule, settings, overtime ve birkaç bileşen dinliyor (personnel, dashboard, requests dinlemiyor).
- Çözüm yönü: değişimde sayfanın tamamını yeniden yükle ya da layout'ta `key={locationId}` ile yeniden mount et.

**K3 · Takas onayında kural kontrolü yok** (bulgu 22)
- Elif Çarşamba 07-15 açılıştayken takasla Burak'ın 15-23 kapanışını aldı ve gün 16 saat oldu. Burak'a Cuma 23:00 → Cumartesi 07:00 arası 8 saat dinlenme kaldı.
- Personel kabulünde, müdür onay kartında ve sunucuda uyarı veya engel yok. Plan Asistanı sorunu ancak onaydan SONRA "acil" diye gösteriyor.
- Kök: `web/app/api/swap-requests/route.ts` (PATCH, yaklaşık 222-240. satırlar) sadece `personnel_id` değiştiriyor.
- Çözüm yönü: kabul ve onaydan önce aynı gün çakışma, 11 saat dinlenme ve haftalık max saat kontrolü; müdür kartında uyarı göster, ihlalde engelle ya da açık onay iste.

**K4 · Haftalık saat sınırı takas ve açık vardiyada kontrol edilmiyor** (bulgu 28 + 27)
- Elif takas ve açık vardiya üstlenmesiyle 47 saate çıktı (sınır 45). Açık vardiya müdür onayı olmadan anında alınıyor.
- İşletme Asistanı bunu doğru yakaladı, plan ekranı yakalamadı.
- Çözüm yönü: K3'teki kontrol fonksiyonunu açık vardiya üstlenmede de kullan.

**K5 · Plan tablosu aynı gündeki 2. vardiyayı gizliyor** (bulgu 23)
- Elif'in Çarşamba hem açılış hem kapanış vardiyası var (DB'de `shift_assignments` 331985 ve 331981), hücrede sadece Açılış görünüyor.
- Plan Asistanı "Çarşamba Kapanış 1/2 eksik" diyor; vardiya var ama görünmüyor.
- Kök: `web/app/(app)/schedule/page.tsx` hücre kişi ve gün başına tek atama varsayıyor.
- Çözüm yönü: hücrede birden çok vardiyayı göster ve çakışmayı kırmızı işaretle; asistan sayımını düzelt.

**K6 · Bölge müdürü şube açabiliyor** (bulgu 29)
- "Şube Ekle" görünüyor ve çalışıyor. Açılan şube kendi `managed_location_ids` kapsamına da eklenmiyor.
- Kök: `web/app/api/locations/route.ts` POST `admin || supervisor`.
- Çözüm yönü: şube açma sadece patron (admin) olsun; ya da supervisor'ın kapsamı boşsa (tümü) izin ver. Kullanıcı kararıyla netleştir; önceki karar "bölge müdürü sadece atanan şubeler".

**K7 · Toplu personel eklemede veri kaybı** (bulgu 8)
- "Eksik departmanları oluştur" kutusu işaretlenince modal kısalıyor ve "7 kişiyi ekle" butonu yer değiştiriyor. Modal dışına tıklanınca pencere uyarısız kapanıyor ve yapıştırılan liste kayboluyor.
- Kök: `web/components/personnel/BulkImportModal.tsx`.
- Çözüm yönü: veri girilmişken dış tıklama kapatmasın (ya da onay sorsun); buton yerini sabitle.

---

## ÖNEMLİ (kullanım kolaylığı)

- **Ö1 · Müdürler görünmüyor** (bulgu 3): patron oluşturduğu şube müdürlerini "Tüm Personel"de hiçbir yerde göremiyor ("0 kişi"). Müdürler bölümü ya da listesi olmalı.
- **Ö2 · Departmansız personel fazla yazılıyor** (bulgu 17 + 26):
  - Tek kişi ekle ile eklenen Ali departmansız. İhtiyaç tablosu dışında kalıyor, ihtiyaç karşılansa da 6 vardiyaya yazılıyor ve her gün "6/5" çıkıyor.
  - Taslakta Plan Asistanı "Planda sorun görünmüyor" diyor, yayından sonra "6 vardiyada fazla kişi" diyor.
  - Tek kişi ekle formunda departman seçimi yok.
- **Ö3 · İhtiyaç tablosu zahmetli** (bulgu 16): metin "öneriyi tek tıkla uygula" diyor ama yeni işletmede öneri yok. 42 hücre tek tek dolduruluyor. "Tüm haftaya uygula" veya "satırı doldur" kısayolu gerekli.
- **Ö4 · İki farklı varsayılan vardiya şablonu** (bulgu 15):
  - Kayıt sihirbazındaki restoran şablonu: Öğle 10-17, Ara 12-20, Akşam 16-00.
  - Plan › Hızlı Kurulum'daki yeme-içme şablonu: Açılış 07-15, Yoğun 11:30-18:30, Kapanış 15-23.
  - İki şablon tek kaynaktan gelmeli.
- **Ö5 · "Gelemeyeceğim" takip edilemiyor** (bulgu 21): duyuru Taleplerim'de görünmüyor, geri alınamıyor. Takası bekleyen vardiya için ayrıca "gelemeyeceğim" de seçilebiliyor.
- **Ö6 · Mesaj kolay kaçıyor** (bulgu 25): müdüre gelen mesaj sadece kapalı "Daha fazla" menüsünde küçük bir rozet. Bekleyen İşler'de "okunmamış mesaj" maddesi olmalı.
- **Ö7 · Patron kendini silebilir** (bulgu 6): şube Ekip sayfasında patronun kendi kartında sil ikonu var. Bölge müdürü de şube ekibinde görünmüyor.
- **Ö8 · Bölge müdürü işletme geneli ayar değiştirebiliyor** (bulgu 30): ERP entegrasyonu dahil. Ekranda teknik ORG ID ve şube ID'leri de görünüyor.
- **Ö9 · Takasta departman kontrolü yok** (bulgu 20): takas arkadaş listesinde başka departman da çıkıyor (garson ↔ aşçı).

## KÜÇÜK

- **2 · Dil tutarsızlığı:** giriş sayfası sağ panelinde hâlâ "süpervizör" yazıyor.
- **4 · Çift satır:** Bölge Müdürleri kartında yeni eklenen kişi iki kez görünüyor (davet satırı ve liste satırı).
- **5 · Anlamsız kutu:** Genel Bakış'ta restoran için "Departman 0" kutusu.
- **7 · Şube seçili gelmiyor:** şube içindeyken "Tek kişi ekle" formunda o şube otomatik seçili değil.
- **9 · İlerleme yok:** toplu ekleme yaklaşık 8 sn sürüyor ve ilerleme göstergesi yok.
- **11 · Unvan tutarsızlığı:** toplu eklemede "Yetenek" (Garson) kartta unvan olarak görünmüyor, herkes "Personel".
- **13 · Hızlı Kurulum adımı:** "1/3", vardiyalar tanımlıyken bile "Vardiyaları tanımla" tamamlanmamış görünebilir; Beşiktaş'ta kontrol edilecek.
- **14 · Çalışma saatleri:** restoran için "Her gün 24 saat açık" geliyor; vardiyalardan türetilmeli.
- **18 · Telefon boş geliyor:** davet kurulum ekranında telefon önceden dolu gelmiyor (kayıtlı telefon silinmiyor).
- **19 · Vardiya adı yok:** personelin takas ve gelemeyeceğim listesinde vardiya adı yok, sadece "· 11:30-18:30".
- **31 · Yayın durumu:** Genel Bakış'ta "Plan yayını: —", gelecek haftanın planı yayınlıyken bile.
- **Ek · Yayınlama yavaş:** yaklaşık 11 sn sürüyor; SMS'ler sırayla gönderiliyor (`/api/schedule/publish`).

## Sorunsuz çalışanlar

- Bölge müdürü kapsamı API'de sağlam: Beşiktaş personel, izin, şube ve kullanıcı verisi boş dönüyor ya da "Erişim reddedildi".
- Müdür kilitleri (ücret, silme) arayüzde doğru ve açıklamalı.
- Personel tarafı sorunsuz: ilk giriş (davet), uygunluk gönder ve kilitle, izin talebi (hak bilgisiyle), takas adımları, açık vardiya ve bonus, mesajlaşma.
- Plan sihirbazı sorunsuz: ihtiyaç tablosu, ön kontrol, oluşturma (41 vardiya) ve yayın.
- İşletme Asistanı canlıda doğru ve faydalı cevap verdi; K3, K4 ve K5'i plan ekranından önce yakaladı.

## Önerilen sıra (bir sonraki oturum)

1. K2 (şube değişimi): tek satırlık düzeltme, veri bozulmasını önler.
2. K3 ve K4: ortak bir "atama kural kontrolü" fonksiyonu; takas, açık vardiya ve elle atamada kullanılacak.
3. K5: plan hücresinde çoklu vardiya.
4. K1: kurulum.
5. K6 ve K7, ardından Ö1-Ö9, ardından küçükler.
6. Her adımda e2e (`npm run seed:mega && npx playwright test tests/e2e_mega_test.spec.ts tests/e2e_access.spec.ts`) ve kural gereği push ve deploy.

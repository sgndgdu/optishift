# OptiShift — 2. Tur Canlı Test Raporu
**Test tarihi:** 1 Temmuz 2026
**Ortam:** https://web-nine-drab-19.vercel.app (production)
**Kapsam:** Sıfırdan yeni organizasyon (Kadıköy Cafe & Bistro), 1 Admin/Supervisor (Aylin Kaya), 1 Müdür (Deniz Yıldız), 2 Personel (Elif Çelik – Kasa, Kerem Aydın – Mutfak). Gerçek bir haftalık müsaitlik girişi, kapasite matrisi, OR-Tools ile otomatik oluşturma, yayınlama ve personel tarafında doğrulama uçtan uca yapıldı.
**Not:** Kullanıcı talimatı gereği ERP entegrasyonu test kapsamı dışında tutuldu (bilinen sorun).

---

## Önce: 1. turda bulunan 3 kritik hata — DOĞRULANDI, DÜZELMİŞ ✅

Bu hatalar önceki Claude Code oturumunda düzeltilmiş ve canlıda tekrar test edilerek doğrulandı:

1. `web/app/api/users/route.ts` — `is_temp_password` artık `true` literal ile yazılıyor, ayrıca users insert başarısız olursa orphan `personnel` kaydı otomatik siliniyor. Canlıda Müdür + 2 Personel hesabı sorunsuz oluşturuldu.
2. `web/app/api/shifts/route.ts` — `force_assigned` artık `true`/`false` ile yazılıyor (kod incelemesiyle doğrulandı; force-assign senaryosu bu turda ayrıca uçtan uca denenmedi).
3. `web/app/api/register/route.ts` — organizasyon kaydı artık sıralı `await` ile yazılıyor, race condition kalmamış. Canlıda yeni organizasyon kaydı anında ve sorunsuz tamamlandı.

---

## YENİ BULGU #1 (KRİTİK — Ürünün ana USP'si çalışmıyor): Kapasite Matrisi belirli vardiya tipini garanti etmiyor

**CLAUDE.md'deki tanım:** Kapasite matrisi `exact_coverage` hard constraint'tir — "Mutfak/Açılış: 1" dendiğinde OR-Tools o gün Mutfak departmanına tam olarak 1 kişiyi **Açılış vardiyasında** atamak zorundadır.

**Gözlenen davranış:** Motor, talep edilen vardiya TİPİNİ yok sayıp aynı gün içindeki farklı (talep edilmeyen) bir vardiya tipine kişi kaydırıyor; talep edilen slot ise boş kalıyor.

**Somut tekrar üretim adımları:**
1. 6–12 Temmuz 2026 haftası için Kapasite Planı'na girildi: **Mutfak / Açılış = 1** (Pzt, Çar, Per, Cum, Cmt, Paz), **Kasa / Kapanış = 1** (Pzt, Sal, Çar, Cum, Cmt, Paz). Öğlen ve Salon satırları tamamen boş bırakıldı (talep = 0).
2. "Otomatik Oluştur" tıklandı (ilk denemede 30 saniyede zaman aşımına uğradı, bkz. Bulgu #2). İkinci denemede ~10 saniyede taslak üretildi.
3. Üretilen atamalarda **Kerem (tek Mutfak personeli) hiçbir gün "Açılış" vardiyası almadı** — bunun yerine "Kapanış" (Pzt, Çar, Cmt, Paz) ve "Öğlen" (Per, Cum) vardiyalarına atandı; bunlar Mutfak için hiç talep edilmemiş vardiya tipleriydi.
4. Kapasite Planı'ndaki canlı sayaç bunu doğruluyor: **Mutfak/Açılış satırı, talep edilen HER gün için kırmızı "0/1" gösteriyor** (Pzt, Çar, Per, Cum, Cmt, Paz) — yani talep edilen slotların tamamı karşılanmamış, motor kapasiteyi hiç ilgisi olmayan vardiya tiplerine harcamış.
5. Kasa/Kapanış tarafında kısmen doğru çalıştı (çoğu gün 1/1 yeşil), ama Cmt/Paz günlerinde yine 0/1 kırmızı çıktı.

**Neden kritik:** CLAUDE.md'nin "En Kritik Satış Vaatleri" bölümünde bu özellik #2 sırada listeleniyor ve "Kapasite Matrisi (Demand Template)" ÇEKİRDEK ÖZELLİK olarak tanımlanıyor. Şu haliyle müdür "Pazartesi sabah 2 kişi" dediğinde motor bunu tam olarak karşılamıyor; sadece toplam kişi sayısını/uygunluğu optimize ediyor gibi görünüyor, vardiya tipi eşleşmesini garanti etmiyor.

**Muhtemel kök neden (kod incelemesi yapılmadı, sadece canlı davranıştan çıkarım):** `optishift_engine.py` içindeki `exact_coverage` kısıtı muhtemelen `(day)` bazında toplam kişi sayısını kısıtlıyor ama `(shift_def_id, day)` çiftini hard constraint olarak bağlamıyor — ya da constraint doğru kuruluyor ama motor "coverage-max fallback" mantığına kayarak talep edilmeyen ama uygunluk açısından daha kolay olan bir shift'e atama yapıp exact_coverage'ı ihlal ediyor (yani ihlal cezası soft/yumuşak kalmış olabilir, hard olması gerekirken).

---

## YENİ BULGU #2 (Yüksek — Güvenilirlik): OR-Tools motoru ilk çağrıda zaman aşımına uğruyor

Basit bir senaryoda (2 personel, 2 dolu satır kapasite matrisi) "Otomatik Oluştur" ilk tıklamada ~19 saniye sonra şu hatayı verdi:
> "Optimizasyon motoru zaman aşımına uğradı (30s). Personel sayısı veya kısıtlamalar çok fazla olabilir."

Hemen ardından aynı ekranda tekrar denendiğinde ~10 saniyede başarıyla tamamlandı. Bu, trivial ölçekli bir senaryo için beklenmedik bir davranış — muhtemelen serverless fonksiyonun "cold start" gecikmesi (Python/OR-Tools servisi ilk çağrıda uyanıyor) 30 saniyelik timeout'a çarpıyor. Küçük işletmeler (2-5 personel) için bile ilk kullanımda kullanıcıya "sistem bozuk" izlenimi verebilir.

**Öneri:** Timeout süresini arttırmak (ör. 45-60s) veya cold-start'ı önlemek için motoru sıcak tutmak (health-check ping / min instance) ya da kullanıcıya "motor ısınıyor, tekrar deneyin" gibi daha açıklayıcı bir mesaj göstermek.

---

## YENİ BULGU #3 (Orta — Ürün mimarisi notu): Tek paylaşımlı oturum çerezi, aynı tarayıcıda birden fazla hesabı aynı anda tutmayı imkansız kılıyor

Test sırasında aynı tarayıcıda farklı sekmelerde Müdür (Deniz), Supervisor (Aylin) ve Personel (Elif → sonra Kerem) hesaplarına giriş yapıldı. Kerem'in bir sekmede giriş yapılmasının hemen ardından **hem Deniz'in hem Aylin'in oturumu sekmelerinde sessizce sonlandı** (bir sonraki sayfa yüklemesinde `/login`'e yönlendirildiler) — bu, `optishift_session` çerezinin sekmeye değil tarayıcıya/domaine bağlı tek bir oturum olduğunu doğruluyor. Backend tarafında bir güvenlik açığı YOK (her rol kendi JWT'siyle doğru şekilde yetkilendiriliyor, çapraz erişim/IDOR test edildi ve engellendiği görüldü) — ama pratik kullanım açısından önemli bir sonucu var:

**Gerçek dünya etkisi:** Ortak/paylaşılan bir cihazdan (ör. mağazada tek bir tablet/kiosk ile personelin check-in yapması senaryosu, CLAUDE.md bölüm F) birden fazla kişi arka arkaya giriş yapacaksa, her seferinde önceki kişinin oturumu sessizce kapanacak. Bu muhtemelen kabul edilebilir (zaten check-in için her personel kendi girişini yapmalı), ama müdürün "iki sekmede iki farklı hafta karşılaştırma" gibi bir alışkanlığı yoksa sorun değil; ancak müdür + supervisor aynı bilgisayarda farklı sekmelerde çalışıyorsa birbirini sessizce login ekranına düşürebilir. Kod değişikliği gerektirmeyebilir ama bilinmesi gereken bir davranış.

---

## YENİ BULGU #4 (Düşük — UX metni): Atanmamış gün "Haftalık İzin" olarak etiketleniyor

Personel takviminde (`/portal/calendar`), o gün için hiç vardiya atanmamışsa sistem "**Haftalık İzin / Atanmadı**" yazıyor. Bu yanıltıcı: personel onaylı izinde değil, sadece o gün için vardiya atanmamış. "İzin" kelimesi personelin resmi izinli olduğu izlenimini veriyor. Öneri: metni "Bu gün için vardiya yok" gibi nötr bir ifadeyle değiştirmek.

---

## Doğrulanan, sorunsuz çalışan akışlar

- Kayıt (register) → onboarding (şube + departman) → Müdür/Personel hesabı oluşturma → davet linki/geçici şifre → `/setup` ile şifre belirleme → giriş: uçtan uca sorunsuz.
- Personel müsaitlik girişi (3 renk + saat aralığı) ve sarı gün hakkı limiti (haftada 1) hem UI'da hem `/api/availability` POST'ta doğru engelleniyor.
- Taslak → Yayınla akışı: "Yayınla" tıklandığında durum "Taslak" → "Yayınlandı" olarak güncelleniyor ve personel takviminde yayınlanan vardiyalar doğru şekilde (yalnızca published) görünüyor.
- Adalet Puanı Dağılımı, dashboard'daki bekleyen talep sayacı, supervisor'ın Genel Bakış sayfası gerçek veriyle doğru rakamlar gösteriyor.
- **Not:** Yayınlama öncesi kural ihlali özeti modalı ("3 personelde 11 saat ihlali...") tetiklenmedi — CLAUDE.md'nin kendi yol haritasında bu zaten Tier 2 (henüz yapılmamış) olarak işaretli, yani bu bir regresyon değil, henüz inşa edilmemiş bir özellik.

---

## Claude Code'a yapıştırılacak tek prompt

```
OptiShift projesinde canlı ortamda (production) yapılan 2. tur uçtan uca testte şu kritik sorun tespit edildi:

SORUN: Kapasite Matrisi (demand_matrix) belirli vardiya TİPİNİ (shift_def_id) garanti etmiyor.

Tekrar üretim: Bir departmana (örn. Mutfak) sadece "Açılış" vardiyası için talep girildiğinde
(demand_matrix: { "acilis-shift-id": { "0": 1, "2": 1, ... } }, diğer vardiya tipleri o departman
için talep=0), OR-Tools motoru o departmandaki personeli talep edilmeyen başka bir vardiya tipine
(örn. "Kapanış" veya "Öğlen") atıyor ve gerçek talep edilen "Açılış" slotunu boş bırakıyor. Grid'deki
coverage sayacı bunu "0/1" kırmızı olarak doğru gösteriyor, yani sorun UI'da değil motorun/constraint
kurulumunun kendisinde.

GÖREV:
1. `optishift_engine.py` (OR-Tools motoru) dosyasını bul ve demand_matrix / exact_coverage
   constraint'inin nasıl kurulduğunu incele. CLAUDE.md'ye göre format şu olmalı:
   { [shiftDefId]: { [day 0-6]: exactCount } } ve bu HARD CONSTRAINT olarak (shift_def_id, day)
   çiftine göre uygulanmalı — yani "o gün o ŞUBE'ye N kişi" değil, "o gün o VARDİYA TANIMINA
   (shift_def_id) tam N kişi" atanmalı.
2. Kısıtın günlük toplam personel sayısına göre mi yoksa spesifik shift_def_id'ye göre mi
   kurulduğunu tespit et. Muhtemel hata: constraint (department, day) bazında toplam kişi sayısını
   kısıtlıyor ama hangi shift_def_id'ye atandığını serbest bırakıyor; ya da constraint doğru
   kuruluyor ama soft/penalty olarak ekleniyor, hard olarak zorunlu kılınmıyor.
3. Düzeltmeyi yap: her (shift_def_id, day) hücresi için demand_matrix'te sayı > 0 ise, o sayıda
   personelin TAM OLARAK o shift_def_id'ye atanmasını hard constraint (== kısıtı, <= veya soft değil)
   olarak modelle. Talep edilmeyen (sayı=0 veya matriste olmayan) shift_def_id + day kombinasyonlarına
   atama yapılmasın (ya da en azından demand olan hücreler tam doldurulmadan başka hücrelere kapasite
   kaydırılmasın).
4. Değişikliği bir unit test veya manuel senaryo ile doğrula: 1 personel + tek bir departmanda sadece
   bir vardiya tipine talep=1 girilen bir hafta için motoru çalıştır, o personelin gerçekten talep
   edilen vardiya tipine atandığını doğrula.

İKİNCİ SORUN (daha düşük öncelik): "Otomatik Oluştur" butonuna ilk tıklamada motor 30 saniyelik
timeout'a uğrayıp "Optimizasyon motoru zaman aşımına uğradı" hatası veriyor, hemen ardından ikinci
denemede ~10 saniyede başarıyla tamamlanıyor. Bu muhtemelen OR-Tools servisinin serverless
cold-start gecikmesinden kaynaklanıyor. `/api/generate` route'undaki timeout süresini arttır
(örn. 45-60 saniyeye) VE/VEYA motor servisinin sıcak tutulmasını sağla (health-check / keep-warm
mekanizması) VE/VEYA kullanıcıya ilk denemede daha açıklayıcı bir mesaj göster ("Motor ilk kez
başlatılıyor, birkaç saniye içinde tekrar deneyin" gibi) ki timeout gerçek bir hata gibi algılanmasın.

ÜÇÜNCÜ SORUN (kozmetik, düşük öncelik): Personel takviminde (`/portal/calendar` sayfası, muhtemelen
web/app/portal/calendar/ altında) bir gün için vardiya atanmamışsa metin "Haftalık İzin / Atanmadı"
olarak gösteriliyor. Bu yanıltıcı çünkü personel resmi izinde değil, sadece o gün vardiyasız. Metni
"Bu gün için vardiya yok" gibi nötr bir ifadeyle değiştir; "İzin" kelimesini sadece gerçekten
onaylanmış bir leave_request varsa kullan.

Her üç değişikliği de yap, mevcut testleri bozmadığından emin ol, ve özetle neyi nasıl değiştirdiğini
raporla.
```

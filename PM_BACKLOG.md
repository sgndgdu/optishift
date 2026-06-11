# OptiShift — Ürün Backlog ve Sprint Planı

**Hazırlayan:** Alex (PM Agent)
**Tarih:** 2026-06-08
**Versiyon:** 1.0
**Kaynak:** 30 yıllık deneyimli vardiya müdürü audit raporu + codebase analizi

---

## Vizyon Özeti

OptiShift bugün itibarıyla çalışan bir iskelete sahip: OR-Tools motoru ayakta, üç portal yönlendirmesi doğru, temel CRUD endpoint'leri org izolasyonlu ve auth korumalı. Ancak ürünün en kritik iş akışlarında — izin onayı, vardiya değişimi, kapasite bazlı planlama ve canlı operasyon takibi — gerçek veriden koparık yerleri var. Müdür dashboard'ında hardcoded sıfırlar görüyor, izin onayladığında kalan vardiyalar DB'den silinmiyor, swap teklifi gönderdiğinde karşı taraf haberdar edilmiyor. Bunlar güven kıran, yasal risk yaratan ve ürünü kullanılamaz hale getiren kırıklardır.

Hedef: İki sprint içinde P0 kırıklarını tamamen kapatmak, üçüncü sprintte ürünün müdür açısından "tamamlanmış" hissettirdiği P1 özelliklerini teslim etmek. Bu süreçte sıfır yeni tablo eklenmeyecek — schema zaten hazır, eksik olan bağlantılar ve iş kurallarıdır. Sprint 3 sonunda bir müdür sistemi gerçek verilerle eksiksiz kullanabilmeli; personel portalı, kapasite matrisi ve OR-Tools entegrasyonu uçtan uca çalışmalıdır.

---

## Sprint 1 — P0 Kritik Buglar (Hafta 1–2)

**Sprint Hedefi:** Müdürün yasal risk altına girmemesi ve temel bilgilerin doğru görünmesi.
**Tahmini Kapasite:** 1 backend + 1 frontend geliştirici, 10 iş günü.

---

**[OPTI-001] İzin Onaylandığında Vardiya İptal ve Müsaitlik Güncelleme**

Kullanıcı hikayesi: Müdür olarak, onayladığım izin dönemindeki personelin vardiyalarının otomatik iptal edilmesini ve müsaitliğinin "unavailable" olarak güncellenmesini istiyorum; aksi takdirde İş Kanunu ihlali riski oluşuyor.

Kabul kriterleri:
- [ ] `PATCH /api/leave-requests/review` endpoint'i `status: 'approved'` aldığında, iznin `start_date`–`end_date` aralığına düşen tüm `shift_assignments` kayıtlarının `status`'ını `'absent'` olarak işaretler.
- [ ] Aynı endpoint, ilgili personelin o haftalara ait `availability` kayıtlarında kapsanan günlerin değerini `'unavailable'` olarak günceller (UPSERT — kayıt yoksa oluşturur).
- [ ] İptal edilen her vardiya için o günün diğer atamalarının kapasite açığını kontrol eden bir `open_shift` kaydı oluşturulur (location_id + date + start_time + end_time ile).
- [ ] Müdüre bildirim gider: "{personel_adı} izni onaylandı. {N} vardiya iptal edildi, {M} açık vardiya oluşturuldu."
- [ ] Personele bildirim gider: "İzniniz onaylandı. {start_date}–{end_date} tarihlerindeki vardiyalarınız iptal edildi."
- [ ] İzin reddedildiğinde (status: 'rejected') herhangi bir vardiya veya müsaitlik değişikliği yapılmaz.

Teknik not:
- Dosya: `web/app/api/leave-requests/review/route.ts` — `PATCH` handler, satır 7.
- `leave_requests` tablosundan `start_date`, `end_date`, `personnel_id` okunacak.
- `shift_assignments` üzerinde tarih hesabı: `week_start + day` kombinasyonu, izin aralığıyla kesişiyorsa iptal. Günü ISO tarihine çeviren yardımcı fonksiyon eklenmeli.
- `availability` tablosunda ilgili `week_start` ve `day_N` sütunları UPSERT ile güncellenmeli.
- `open_shifts` POST zaten çalışıyor (`web/app/api/open-shifts/route.ts`), doğrudan çağrılabilir.

Tahmini süre: 4s (backend 3s, test 1s)

---

**[OPTI-002] Swap Talebi POST'unda Karşı Tarafa Bildirim Eksik**

Kullanıcı hikayesi: Personel olarak, vardiya değişim teklifi gönderdiğimde karşı tarafın bildirim almasını istiyorum; şu anda hiçbir bildirim gitmiyor ve akış başlamıyor.

Kabul kriterleri:
- [ ] `POST /api/swap-requests` talebi oluşturduktan sonra `target_id` personeline `notifications` tablosuna kayıt yazar: başlık "Yeni Vardiya Değişim Teklifi", mesaj "{requester_name} sana vardiya değişimi teklif etti."
- [ ] Bildirimle birlikte `sendPushToPersonnel` ile web push da gönderilmeye çalışılır (hata olursa sessizce geçilir).
- [ ] Yeni kayıt oluştuğunda response'a `notification_sent: true | false` eklenir.
- [ ] Personel `/portal/requests` sayfasındaki "Gelen Talepler" sekmesi bu bildirimi okuyabilir (`target_id` ile GET `/api/swap-requests` çalışıyor, ön yüze bağlanması yeterli).

Teknik not:
- Dosya: `web/app/api/swap-requests/route.ts` — `POST` handler, satır 90–122.
- `PATCH` handler'daki `NOTIFY` effect bloğu (satır 209–220) referans alınabilir — aynı pattern.
- `requester_name` body'den geliyor, `target_name` da geliyor; bu isimler bildirim mesajında kullanılır.
- Push için `sendPushToPersonnel` import zaten dosyada mevcut (satır 7).

Tahmini süre: 2s (backend 1.5s, test 0.5s)

---

**[OPTI-003] Dashboard'da İzin Taleplerinde Personel İsmi Gösterme**

Kullanıcı hikayesi: Müdür olarak, bekleyen izin talepleri listesinde "P-001 için izin talebi" değil "Ali Yılmaz için izin talebi" görmek istiyorum.

Kabul kriterleri:
- [ ] Dashboard izin listesinde her talepte `personnel_name` alanı dolu gelir ve `req.personnel_id` yerine `req.personnel_name` gösterilir.
- [ ] `GET /api/leave-requests?location_id=...` endpoint'i döndürdüğü her satırda `personnel_name` (personelin `name` alanı) içerir.
- [ ] `personnel_name` boş gelirse fallback olarak `personnel_id` gösterilir (regresyon koruması).

Teknik not:
- `GET /api/leave-requests?location_id=...` zaten raw SQL ile JOIN yapıyor ve `p.name as personnel_name` döndürüyor (`web/app/api/leave-requests/route.ts`, satır 36–40). Sorun frontend'de: `web/app/(app)/dashboard/page.tsx` satır 155 `req.personnel_id` kullanıyor, `req.personnel_name` kullanmalı.
- Frontend değişikliği: satır 155'te `{req.personnel_id}` → `{req.personnel_name ?? req.personnel_id}`.
- Tek dosya değişikliği, test dahil 0.5 saat.

Tahmini süre: 0.5s (frontend 0.5s)

---

**[OPTI-004] Dashboard'da Açık Vardiya Sayısı Gerçek Veriden**

Kullanıcı hikayesi: Müdür olarak, dashboard'daki "Açık Vardiya" KPI kartında gerçek açık vardiya sayısını görmek istiyorum; hardcoded "0" güvensizlik yaratıyor.

Kabul kriterleri:
- [ ] Dashboard başlangıçta `GET /api/open-shifts?location_id=...&status=open` çağrısı yapar.
- [ ] KPI kartındaki değer gerçek `open_shifts` sayısını gösterir.
- [ ] `loading` durumunda "—" gösterilir.
- [ ] 0 açık vardiya varken alt metin "Tüm slotlar dolu", 1+ varsa "Dikkat gerekiyor" olarak güncellenir.

Teknik not:
- Dosya: `web/app/(app)/dashboard/page.tsx`.
- `Promise.all` içindeki fetch listesine `open-shifts` endpoint'i eklenir (satır 33–37).
- KPI array'inde (satır 87–91) `value: "0"` → dinamik state değeri kullanılır.
- `GET /api/open-shifts` zaten hazır ve çalışıyor.

Tahmini süre: 1s (frontend 1s)

---

**[OPTI-005] Demand Matrix — Shift ID Eşleştirme Kırığı Düzeltme**

Kullanıcı hikayesi: Müdür olarak, kapasite matrisine girdiğim "Pazartesi Sabah: 2 kişi" bilgisinin OR-Tools'a doğru aktarılmasını ve gerçekten 2 kişi atanmasını istiyorum; şu anda matris tamamen görmezden geliniyor.

Kabul kriterleri:
- [ ] OR-Tools motoru kapasite matrisi tanımlandığında `exact_coverage` constraint'ini uygular ve belirlenen gün/vardiya kombinasyonuna tam olarak N kişi atar.
- [ ] `/api/generate` payload'ındaki `shifts[]` dizisinin her elemanında `id` alanı bulunur.
- [ ] Engine, `id_to_idx` map'ini doldurabilir ve `demand_matrix` key'leriyle eşleştirebilir.
- [ ] Test: 3 kişilik ekip, Pazartesi Sabah için demand=2 girildiğinde motor tam 2 kişi atar.
- [ ] `id` alanı olmayan shift tanımlarında fallback olarak `name` veya sıra indexi kullanılır (mevcut engine davranışı korunur).

Teknik not:
- `/api/generate/route.ts` satır 88–93: `shiftsPayload` oluşturulurken `id` alanı eklenmemiş.
- Düzeltme: `shiftsPayload = defs.map((d: any) => ({ id: String(d.id ?? d.name ?? i), name: ..., start: ..., end: ..., base_points: ... }))`.
- `defaultShifts` (satır 80–83) içine de `id: "default-0"` ve `id: "default-1"` eklenmeli.
- Engine tarafında `id_to_idx` map kurma kodu (`optishift_engine.py` satır 661–666) zaten doğru; sorun tamamen payload'dan `id` gelmemesi.

Tahmini süre: 1s (backend 0.5s, test 0.5s)

---

**[OPTI-006] Personel Kartında Yıllık İzin Bakiyesi Gösterimi**

Kullanıcı hikayesi: Müdür olarak, izin talebi incelerken personelin kaç gün yıllık izin hakkı kaldığını görmek istiyorum; şu anda bu bilgi hiçbir yerde görünmüyor.

Kabul kriterleri:
- [ ] `GET /api/leave-requests?location_id=...` response'unda her personel satırı için `annual_leave_days_total` ve `annual_leave_days_used` (onaylı izin günleri toplamı) alanları bulunur.
- [ ] Dashboard izin talebi kartında her talebin yanında "Kalan: X gün" badge'i gösterilir.
- [ ] Hesaplama: `annual_leave_days_used = SUM(days) FROM leave_requests WHERE personnel_id = ? AND type = 'annual' AND status = 'approved'`.
- [ ] Personel detay sayfasında (personnel page) da izin bakiyesi özet satırı eklenir.

Teknik not:
- `web/app/api/leave-requests/route.ts` satır 34–41: location_id query'sine `annual_leave_days_total` alanını ve ayrı bir sub-select ile kullanılan gün hesaplamasını ekle.
- SQL: `SELECT lr.*, p.name as personnel_name, p.annual_leave_days_total, (SELECT COALESCE(SUM(lr2.days),0) FROM leave_requests lr2 WHERE lr2.personnel_id = lr.personnel_id AND lr2.type = 'annual' AND lr2.status = 'approved') as annual_leave_days_used FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id WHERE ...`
- Frontend: dashboard `page.tsx` satır 152–169 bloğuna badge eklenir.

Tahmini süre: 2s (backend 1s, frontend 1s)

---

**Sprint 1 Özeti**

| # | Başlık | Etki | Süre |
|---|--------|------|------|
| OPTI-001 | İzin → Vardiya çakışma kapatma | İş Kanunu riski | 4s |
| OPTI-002 | Swap POST bildirimi | Akış kırık | 2s |
| OPTI-003 | Dashboard personel ismi | Güven kırıcı | 0.5s |
| OPTI-004 | Açık vardiya gerçek sayısı | Yanlış bilgi | 1s |
| OPTI-005 | Demand matrix ID fix | Kapasite matrisi çalışmıyor | 1s |
| OPTI-006 | Yıllık izin bakiyesi | Müdür kör | 2s |
| **Toplam** | | | **10.5s** |

Kapasite 10 gün = ~10 insan-günü. Süre tahmini 1 backend + 1 frontend için dengeli. OPTI-001 en yüksek riskli; ilk gün başlanmalı.

---

## Sprint 2 — P1 Özellikler, Birinci Tur (Hafta 3–4)

**Sprint Hedefi:** Müdürün haftaya yeni planı sıfırdan girmek zorunda kalmaması; schedule sayfasının production-ready hissettirmesi.

---

**[OPTI-007] Geçen Haftayı Kopyala**

Kullanıcı hikayesi: Müdür olarak, geçen haftanın vardiya planını bir tıkla bu haftaya kopyalamak istiyorum; en çok zaman kaybeden tekrarlı iş bu.

Kabul kriterleri:
- [ ] Schedule sayfasında hafta navigasyonunun yanında "Geçen Haftayı Kopyala" butonu bulunur.
- [ ] Buton tıklandığında `GET /api/shifts?location_id=...&week_start={önceki_hafta}` ile geçen haftanın atamaları çekilir.
- [ ] Çekilen atamalar `week_start` bir hafta ileri alınarak `POST /api/shifts` ile `publication_status: 'draft'` olarak kaydedilir.
- [ ] Kopyalama sonrası grid otomatik yenilenir ve her hücre "kopyalandı" state'inde gösterilir.
- [ ] Geçen hafta verisi yoksa buton "Kopyalanacak veri yok" tooltip'iyle disabled olur.
- [ ] Kopyalama mevcut haftada kayıt varsa üzerine yazmaz; "Bu hafta zaten atama var. Üzerine yaz?" onay dialogu gösterir.

Teknik not:
- Yeni endpoint gerekmez; mevcut `GET /api/shifts` ve `POST /api/shifts` kullanılır.
- Frontend: `web/app/(app)/schedule/page.tsx` — hafta navigasyon bölümüne buton eklenir.
- Kopyalama sırasında `check_in_at`, `check_out_at` alanları sıfırlanır; `status: 'scheduled'`, `publication_status: 'draft'` olarak kopyalanır.

Tahmini süre: 3s (frontend 2s, backend 1s)

---

**[OPTI-008] Taslak / Personele Gönder / Yayınla Üçlü Akışı**

Kullanıcı hikayesi: Müdür olarak, vardiya planını önce taslak olarak kaydedip, sonra personele incelemeleri için göndermek ve nihai onayı ayrıca vermek istiyorum; şu anda tek adımlı kayıt var.

Kabul kriterleri:
- [ ] Schedule sayfası alt eylem barında üç ayrı buton bulunur: "Taslak Kaydet", "Personele Gönder", "Yayınla".
- [ ] "Taslak Kaydet": tüm hücreleri `publication_status: 'draft'` ile kaydeder. Personel portalında görünmez.
- [ ] "Personele Gönder": `publication_status: 'draft'` olan atamaları `publication_status: 'review'` olarak işaretler ve ilgili personele "Bu haftanın taslak planı incelemenize açıldı, 48 saat içinde itiraz edebilirsiniz" bildirimi gider.
- [ ] "Yayınla": `publication_status: 'published'` olarak günceller, tüm personele "Haftalık vardiya planınız yayınlandı" bildirimi gider.
- [ ] Personel portalı sadece `publication_status: 'published'` atamaları gösterir.
- [ ] Butonlar mevcut duruma göre aktif/disabled olur (zaten yayınlandıysa "Yayınla" disabled).

Teknik not:
- `shift_assignments.publication_status` alanı schema'da mevcut (`web/lib/db/schema.ts` satır 161), varsayılan `'published'`.
- Yeni `PATCH /api/shifts/bulk-status` endpoint'i eklenmeli: `{ location_id, week_start, publication_status }` alır, toplu güncelleme yapar.
- Personel portalı `GET /api/shifts` çağrısına `publication_status=published` filtresi eklenmeli.
- Frontend: `web/app/(app)/schedule/page.tsx` — "Yayınla" butonunun yanına iki buton eklenir.

Tahmini süre: 4s (backend 2s, frontend 2s)

---

**[OPTI-009] Aylık Çalışma Saati Raporu Sayfası**

Kullanıcı hikayesi: Müdür olarak, her ay İK'ya göndermek için personel bazında toplam çalışma saatlerini gösteren bir rapor görmek istiyorum.

Kabul kriterleri:
- [ ] `/(app)/reports` sayfası oluşturulur ve sidebar'a eklenir.
- [ ] Ay seçici ile seçilen ay için personel başına: toplam vardiya sayısı, toplam saat, fazla mesai saati, toplam adalet puanı gösterilir.
- [ ] Tablo Excel olarak dışa aktarılabilir (mevcut export altyapısı kullanılır).
- [ ] `GET /api/shifts?location_id=...&month=YYYY-MM` parametresi eklenerek backend tarafında filtreleme yapılır.
- [ ] Yalnızca `publication_status: 'published'` atamaları rapora dahil edilir.

Teknik not:
- `GET /api/shifts` endpoint'ine `month` query parametresi eklenir; `week_start BETWEEN` ile filtre uygulanır.
- Yeni rota: `web/app/(app)/reports/page.tsx`.
- Sidebar: `web/components/Sidebar.tsx`'e "Raporlar" linki eklenir.
- Excel export: mevcut `xlsx` paketini kullanan export util'i genişletilebilir.

Tahmini süre: 4s (backend 1.5s, frontend 2.5s)

---

**[OPTI-010] Kıdemli Personel (Primary Role) Kısıtı OR-Tools'a Ekleme**

Kullanıcı hikayesi: Müdür olarak, her vardiyada en az 1 "primary" seviyesinde yetkin personel olmasını otomatik garanti altına almak istiyorum.

Kabul kriterleri:
- [ ] `role_levels` JSON alanı (`{"kasa": "primary", "reyon": "secondary"}`) OR-Tools motoruna iletilir.
- [ ] Motor, her shift ve her gün için ilgili rolde en az 1 `primary` seviyesinde personelin çalışmasını hard constraint olarak uygular.
- [ ] Bu kısıt karşılanamıyorsa motor `INFEASIBLE` döner ve API "Kıdemli personel kısıtı karşılanamıyor" açıklamalı hata döndürür.
- [ ] Kısıt yalnızca `zone_quotas`'ta tanımlı ve `min_count > 0` olan roller için aktif olur.

Teknik not:
- `optishift_engine.py` `api_mode` fonksiyonunda `PERSONNEL` verisine `role_levels` alanı eklenmeli.
- `web/app/api/generate/route.ts` satır 120–129: `personnelData` map'ine `role_levels: JSON.parse(p.role_levels || "{}")` eklenmeli.
- Engine `build_model` içine yeni constraint bloğu eklenir; `primary_skilled` listesi `role_levels[zone] == "primary"` filtresiyle kurulur.

Tahmini süre: 3s (backend/engine 2s, test 1s)

---

**Sprint 2 Özeti**

| # | Başlık | Değer | Süre |
|---|--------|-------|------|
| OPTI-007 | Geçen haftayı kopyala | Müdür zamanı | 3s |
| OPTI-008 | Taslak/Gönder/Yayınla akışı | İş akışı bütünlüğü | 4s |
| OPTI-009 | Aylık çalışma saati raporu | İK ihtiyacı | 4s |
| OPTI-010 | Kıdemli personel kısıtı | Operasyon güvencesi | 3s |
| **Toplam** | | | **14s** |

14 insan-günü — hafif fazla. Kapasite sıkışırsa OPTI-010 Sprint 3'e kaydırılabilir; diğer üçü Sprint 2 çekirdeğidir.

---

## Sprint 3 — P1 Devamı ve Kalite (Hafta 5–6)

**Sprint Hedefi:** Canlı operasyon takibinin çalışması; schedule'da inline fairness ve kural ihlali önizlemesi.

---

**[OPTI-011] Canlı Operasyon — Check-in / Check-out**

Kullanıcı hikayesi: Personel olarak, vardiyam başladığında uygulamadan check-in yapabilmek istiyorum; müdür de kimlerin geldiğini anlık görmek istiyor.

Kabul kriterleri:
- [ ] Personel portalı `/portal` sayfasındaki aktif vardiya kartında "Check-in" butonu gösterilir (yalnızca bugün vardiyası olan ve henüz check-in yapmamış personele).
- [ ] "Check-in" tıklandığında `PATCH /api/shifts/checkin` endpoint'i çağrılır, `check_in_at` timestamp yazılır.
- [ ] Check-in sonrası buton "Check-out" olarak değişir; tıklandığında `check_out_at` yazılır.
- [ ] Müdür dashboard'ının "Canlı Operasyon" kartı: check-in olan, beklenen, geç kalan (start_time + 30 dk geçmiş, check-in yok) personeli ayrı satırlarda gösterir.
- [ ] Geç kalan için otomatik `open_shifts` kaydı oluşturulur (başlangıç saati = original start_time, bonus multiplier = 1.5).

Teknik not:
- `shift_assignments.check_in_at` ve `check_out_at` alanları schema'da mevcut (satır 162–163).
- Yeni endpoint: `PATCH /api/shifts/checkin` — body: `{ assignment_id, action: 'checkin' | 'checkout' }`. Alternatif olarak mevcut `PATCH /api/shifts` genişletilebilir.
- Dashboard'daki "Canlı Operasyon" kartı zaten `check_in_at` ve `check_out_at` verilerini kullanıyor (satır 238–250); geç kalan mantığı ve open shift oluşturma eklenmeli.
- Personel portalı `/app/(portal)/` veya `/portal` sayfası — check-in butonunu mevcut vardiya kartına ekle.

Tahmini süre: 4s (backend 2s, frontend 2s)

---

**[OPTI-012] Schedule'da Inline Fairness Göstergesi**

Kullanıcı hikayesi: Müdür olarak, schedule grid'inde her personel satırının yanında o anki adalet puanını ve haftalık yükünü renk çubuğuyla görmek istiyorum; manuel atama yaparken kimin yüklü olduğunu hemen anlamalıyım.

Kabul kriterleri:
- [ ] Her personel satırının en sol kolonunda: bu haftanın birikimli adalet puanı + relative yük çubuğu gösterilir.
- [ ] Çubuk rengi: yeşil (en az yük, alt %35), mavi (orta, %35–65), amber (%65–85), kırmızı (en yüksek, üst %15).
- [ ] Yeni bir hücreye atama eklendikçe puan anlık (client-side) güncellenir.
- [ ] OR-Tools sonucu geldiğinde puanlar `data.scores` objesinden alınır ve grid üzerine uygulanır.

Teknik not:
- Schedule sayfasında (`web/app/(app)/schedule/page.tsx`) `scores` state'i zaten mevcut.
- `scoreColor` fonksiyonu (satır 63–68) zaten yazılmış, sadece satır bazlı render'a bağlanması gerekiyor.
- OR-Tools response'undaki `scores` map'i (`personnelId → totalScore`) personnel satırlarıyla eşleştirilmeli.
- Client-side puan hesabı: `calcPoints` (satır 44–49) ile her hücre değişiminde re-calculate.

Tahmini süre: 2s (frontend 2s)

---

**[OPTI-013] Yayınlama Öncesi Kural İhlali Modalı**

Kullanıcı hikayesi: Müdür olarak, "Yayınla" butonuna basmadan önce kuralları ihlal eden atamaları görmek istiyorum; yanlışlıkla İş Kanunu'nu çiğneyen bir plan yayınlamamak için.

Kabul kriterleri:
- [ ] "Yayınla" tıklandığında önce client-side kural kontrol çalışır: 11 saat dinlenme kuralı + 45 saat (veya personel bazında max_weekly_hours) haftalık limit.
- [ ] İhlal varsa "Kural İhlali Uyarısı" modalı açılır; her satırda personel adı + ihlal türü + detay gösterilir.
- [ ] Modal'da "Yine de Yayınla" ve "Geri Dön" butonları bulunur.
- [ ] İhlal yoksa modal açılmaz, doğrudan yayınlanır.
- [ ] Modal state'i persist edilmez — sadece aktif yayınlama akışı için gösterilir.

Teknik not:
- Tüm hesaplama frontend client-side yapılır; ek API endpoint gerekmez.
- `web/app/(app)/schedule/page.tsx` içinde "Yayınla" butonunun onClick handler'ı, mevcut cellMap üzerinde ihlal tespiti fonksiyonu çalıştırır.
- Dinlenme ihlali: aynı personelin ard arda iki günde ataması varsa, gün N bitiş saati ile gün N+1 başlangıç saati arasındaki fark `min_rest_hours * 60`'tan küçükse ihlal.
- Haftalık saat: o personelin o haftaki toplam `(endMin - startMin)` toplamı kişi bazında `max_weekly_hours * 60`'ı geçiyorsa ihlal.

Tahmini süre: 3s (frontend 3s)

---

**[OPTI-014] Müsaitlik Hatırlatma Otomasyonu**

Kullanıcı hikayesi: Müdür olarak, her hafta müsaitlik girmeyen personele otomatik hatırlatma gönderilmesini istiyorum; şu an bunu manuel takip etmem gerekiyor.

Kabul kriterleri:
- [ ] Settings sayfasında "Müsaitlik Hatırlatma" toggle'ı ve zamanlama seçicisi (gün + saat) bulunur.
- [ ] `POST /api/availability/remind` endpoint'i: ilgili `week_start` için availability kaydı olmayan personel listesini bulur, her birine notification yazar, push gönderir.
- [ ] Schedule sayfasındaki "Müsaitlik İste" butonu bu endpoint'i çağırır.
- [ ] Hatırlatma gönderilen personel sayısı response'da döner: `{ sent: N }`.
- [ ] Ayar `locations.rules` JSON alanına eklenir: `{ ..., availability_reminder_day: 0, availability_reminder_hour: 18 }`.

Teknik not:
- Yeni endpoint: `web/app/api/availability/remind/route.ts` (POST).
- Settings sayfası: `web/app/(app)/settings/page.tsx` — mevcut rules bloğuna toggle eklenir.
- Cron ile tam otomatik çalıştırma şu an kapsam dışı; manuel tetik yeterli.

Tahmini süre: 3s (backend 2s, frontend 1s)

---

**Sprint 3 Özeti**

| # | Başlık | Değer | Süre |
|---|--------|-------|------|
| OPTI-011 | Check-in / Check-out | Canlı operasyon | 4s |
| OPTI-012 | Inline fairness göstergesi | Müdür kararı hızlanır | 2s |
| OPTI-013 | Kural ihlali modalı | Yasal güvence | 3s |
| OPTI-014 | Müsaitlik hatırlatma | Veri kalitesi | 3s |
| **Toplam** | | | **12s** |

---

## Backlog — P2 ve P3 (Sprint 4+)

Aşağıdaki maddeler önemlidir ancak P0/P1 kapanmadan başlanmaz. Her biri bir sonraki sprint planlamasında sıralanacak.

**P2 — Ürün Kalitesi**

- [OPTI-015] Dashboard'da "Bu hafta müsaitlik girmeyen: X kişi" özet satırı. Doğrudan backend query, frontend badge. Tahmini: 1s.
- [OPTI-016] Schedule'da kapasite matrisi panel varsayılan açık (demand_matrix dolu geliyorsa). Frontend state fix. Tahmini: 0.5s.
- [OPTI-017] Coverage gap sayacı daha büyük ve belirgin. Grid hücre altında `atanan/gereken` badge. Tahmini: 1s.
- [OPTI-018] Dashboard'dan "Açık Vardiya Oluştur" hızlı akış. Sağ panel veya floating button. Tahmini: 2s.
- [OPTI-019] Personel portalı sidebar'da okunmamış bildirim badge. Notifications count endpoint + sidebar badge. Tahmini: 1.5s.
- [OPTI-020] Swap akışında adım göstergesi (1: Teklif gönderildi → 2: Karşı taraf kabul → 3: Müdür onayı). Frontend sadece. Tahmini: 1.5s.
- [OPTI-021] Minimum haftalık saat garantisi. Part-time personel için `min_weekly_hours` alanı + OR-Tools lower bound constraint. Tahmini: 2s.
- [OPTI-022] "Gelecek hafta plan yayınlanmadı" personel bildirimi. Her Cuma 17:00'de cron/manuel trigger. Tahmini: 1.5s.

**P3 — Stratejik Özellikler**

- [OPTI-023] Split shift desteği (aynı gün 2 vardiya). Schema değişikliği + OR-Tools + grid yeniden tasarımı. Büyük kapsam, ayrı spike gerekir.
- [OPTI-024] Supervisor çapraz şube raporları (`/supervisor/reports`). Multi-branch aggregation query + grafik. 2 haftalık iş.
- [OPTI-025] İzin türü bakiye ayrımı (yıllık vs hastalık bakiyesi ayrı sayaçlar). Schema'ya `sick_leave_days_total` eklenmesi.
- [OPTI-026] Onboarding wizard (5 adımlı org kurulum). Büyük UX işi, ayrıca planlanmalı.
- [OPTI-027] Haftalık bütçe/maliyet takibi. Personnel'e `hourly_rate` alanı + schedule toplam maliyet paneli.
- [OPTI-028] Stripe entegrasyonu + plan limiti. Billing infrastructure.
- [OPTI-029] PWA manifest + service worker. Mobile install desteği.

---

## Teknik Borç Listesi

Aşağıdaki kod noktaları doğrudan iş değeri üretmez ama sprint aralarında küçük PR'larla temizlenmelidir. Birikmesi ilerleyen sprintlerde hız kaybına yol açar.

**Yüksek öncelik (next sprint içinde temizlenmeli):**

1. **`optishift_engine.py` satır 415 — hardcoded tarih:** `"generated_at": "2026-05-29"` — dinamik `datetime.now().isoformat()` yapılmalı.
2. **`optishift_engine.py` satır 319 — manuel avail dict erişimi:** `AVAILABILITY[person["id"]].get(d, "available")` — dict key yoksa `KeyError` riski; `AVAILABILITY.get(person["id"], {}).get(d, "available")` güvenli forma dönüştürülmeli.
3. **`web/app/api/generate/route.ts` satır 79–83 — hardcoded default shifts:** `defaultShifts` içinde `id` alanı yok. OPTI-005 ile birlikte kapatılır ama bağımsız bir PR olarak da temizlenebilir.
4. **`web/app/(app)/dashboard/page.tsx` satır 89 — hardcoded "Tüm slotlar dolu":** OPTI-004 ile kapanır; string de dinamik yapılmalı.

**Orta öncelik (Sprint 3–4 arasında temizlenmeli):**

5. **`web/lib/types.ts` — `ShiftAssignment.shiftId`:** `shiftId: number` (array index) olarak tanımlı; bu alan DB kayıtlarında `shift_id: text` ile uyumsuz. API katmanında normalizasyon şu an manuel, tip tanımı güncellenmeli.
6. **`web/app/api/leave-requests/review/route.ts` — `requireAuth` eksik:** Endpoint auth kontrolü yapmıyor. Herhangi biri `PATCH` isteyebilir. `requireAuth` + `role in ('manager', 'admin', 'supervisor')` kontrolü eklenmeli. Güvenlik açığı.
7. **`optishift_engine.py` satır 182 — `ZONE_DEMAND_PER_DAY` constraint:** `if skilled:` bloğu skill'i olan ama hiç aktif personeli olmayan durumları doğru handle ediyor; ancak zone_quotas payload boş gönderildiğinde global defaults override'ı beklenmedik davranışa yol açabilir. `else: pass` yerine explicit loglama eklenmeli.
8. **`web/lib/mock-data.ts` — canlı ortamda kullanılan mock data:** Bazı sayfalar hala mock data'ya fallback yapıyor. Her sprint sonunda hangi sayfaların gerçek API'a tam bağlı olduğu kontrol edilmeli; mock data import'ları temizlenmeli.
9. **`web/components/Sidebar.tsx` — rota listesi statik:** Yeni sayfa eklendiğinde (OPTI-009 reports) sidebar'a manuel ekleniyor. Merkezi bir rota konfigürasyon array'i oluşturulmalı; sidebar bu array'den render edilmeli.
10. **`web/app/api/shifts` endpoint — `status` vs `publication_status` tutarsızlığı:** Schema'da `status` (scheduled/completed/absent/swapped) ve `publication_status` (draft/published) ayrı alanlar. Bazı API çağrıları yanlış alanı sorgulayabiliyor; her endpoint'te hangi alanın filtrelendiği dokümante edilmeli ve tutarlandırılmalı.

---

*Bu backlog yaşayan bir belgedir. Her sprint planlamasında P2 maddeleri yukarı alınır, tamamlananlar arşivlenir, yeni bulgular eklenir. Herhangi bir maddenin önceliği değişmeden önce müdür audit bulgularıyla çapraz kontrol yapılmalıdır.*

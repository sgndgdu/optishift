# OptiShift — Claude Code Geliştirme Rehberi

> Bu dosya Claude Code için yazılmıştır. Her oturumda baştan okunur. Kodlama kararlarında bu dosyadaki mimari ve iş kuralları esas alınır. Çelişki olursa bu dosya kazanır.

---

# Proje: OptiShift - Akıllı, Adil ve Entegre Vardiya Yönetimi

## 1. Proje Özeti & Vizyonu
OptiShift; köşedeki kafeden 750 şubeli perakende zincirine, butik otelden zincir otel grubuna kadar her ölçekteki işletme için geliştirilmiş, mobil öncelikli (mobile-first) ve matematiksel optimizasyon destekli bir vardiya yönetim platformudur. Hantal kurumsal yazılımların aksine sıfır öğrenme eğrisi (zero-learning curve) sunar.

**Hedef Müşteri Segmentleri:**
- **KOBİ:** Tek şubeli cafe, restoran, butik otel — mağaza müdürü aynı zamanda admin rolündedir
- **Orta Ölçek:** 5–50 şubeli zincir — bölge müdürü + şube müdürleri hiyerarşisi
- **Kurumsal:** Gratis gibi 750+ şubeli perakende zincirleri, zincir otel grupları — IT/HR admin + bölge direktörleri + mağaza/departman müdürleri

**En Kritik Satış Vaatleri (USP):**
1. **Adil Vardiya Puanı:** Müdürün tanımladığı zorluk ağırlıklarına göre matematiksel olarak adil dağıtım — personel sirkülasyonunu düşürür.
2. **Talep Bazlı Otomatik Planlama:** "Pazartesi sabah 2 kişi, akşam 3 kişi" diyerek OR-Tools'a ihtiyaç tanımlanır — sistem müsaitlik, kural ve adalet kısıtlarıyla tam karşılayan planı üretir.
3. **Self-Service ERP Entegrasyonu:** SAP, Logo, Nebim gibi sistemlere üçüncü parti yazılımcı gerekmeden bağlanma.
4. **Sektörden Bağımsız Esneklik:** Kafe, otel, perakende, fabrika — vardiya sayısı, saatler, bölgeler tamamen müdür tarafından tanımlanır. Uygulamada "sabah/akşam vardiyası" gibi sabit kavramlar yoktur.
5. **Mobil-First, Sıfır Öğrenme Eğrisi:** Personel ve müdür için ayrı arayüzler; her ikisi de telefonda tam işlevli çalışır.

---

## 2. Temel Teknolojik Mimari

### A. Optimizasyon Motoru (Core Engine)
- Maliyetleri, token sınırlarını ve halüsinasyon riskini sıfırlamak için takvim oluşturma sürecinde LLM kullanılmaz.
- Backend üzerinde **Python + Google OR-Tools** (Kısıtlamalı Matematiksel Optimizasyon) kütüphanesi koşar.
- **Motor İki Modda Çalışır:**
  - **Demand-Based (Varsayılan):** Müdür kapasite matrisini doldurduysa motor bu sayıları hard constraint olarak alır. "Pazartesi Sabah: tam 2 kişi" — ne fazla ne eksik.
  - **Coverage-Max (Fallback):** Kapasite matrisi boşsa motor müsait herkesi mümkün olduğunca adil şekilde dağıtır.

### B. Entegrasyon Merkezinin Desteklediği Tüm Sistemler (No-Code Integration Hub):
  - **SAP ERP & SAP SuccessFactors (Enterprise Global):** RFC/BAPI (ECC 6.0/R3) ve REST/OData (S4HANA/SuccessFactors) protokolleri. Personel sicil kartları çekilir, puantaj geri basılır.
  - **Nebim V3 (Perakende Sektör Devi):** REST API üzerinden mağaza organizasyon ağacı ve çalışan listesi çift taraflı senkronize edilir.
  - **Logo Yazılım & Logo Netsis & Mikro ERP (KOBİ & Yerel Zincirler):** On-Premise sistemler için güvenli DB tünelleri ve n8n entegrasyon şablonları.
  - **Luca & Orka (Muhasebe & Bordro Yazılımları):** API bağlantısı + alan eşleştirmeli Excel/CSV transfer modu.

---

## 3. Detaylı Sistem Modülleri & İş Kuralları

### A. Personel Kategorizasyonu & Alan Yönetimi (Zonlama)
- **Bölgeler (Zones):** Mağaza müdürleri dinamik fiziksel alanlar tanımlayabilir (Örn: Kasa, Teras, Mutfak, Reyon).
- **Etiketler/Yetenekler (Skills):** Personel kartlarına birden fazla yetenek etiketlenebilir (Örn: #Kasa, #Barista).
- **Esnek Kontrol (Soft Constraint):** Takvimde personelin o alana yeteneği yoksa sistem hafif bir ünlem uyarısı verir ama müdürün operasyonel esnekliğini engellemez.

### B. Kapasite Matrisi (Demand Template) — ÇEKİRDEK ÖZELLİK
Müdürün OR-Tools motoruna "ne istediğini" söyleyebildiği birincil giriş yüzeyi. Availability-based değil, **demand-based** planlama.

**Veri yapısı — iki seviye:**
```
// Departmansız lokasyon: locations.demand_matrix
demand_matrix: {
  [shiftDefId: string]: {   // "sabah", "aksam", vb. (locations.shift_definitions'tan)
    [day: number]: number   // 0=Pzt … 6=Paz → o gün o vardiyaya kaç kişi lazım
  }
}

// Departmanlı lokasyon: departments.demand_matrix (her departmanın kendi satırı)
demand_matrix: {
  [shiftDefId: string]: {
    [day: number]: number   // o departmanda o gün o vardiyaya kaç kişi lazım
  }
}
```

**Nasıl çalışır:**
1. Müdür schedule sayfasının üstündeki "Kapasite Planı" panelinde her gün × her vardiya tipi için ihtiyaç sayısı girer. Lokasyonda departman tanımlıysa (`departments` tablosunda satır varsa) tablo **departman bazlı** gösterilir ve her departmanın talebi kendi `departments.demand_matrix` alanına ayrı ayrı kaydedilir; departman yoksa tek düz `locations.demand_matrix` kullanılır.
2. `/api/generate` route'u her iki seviyeyi de motora gönderir: düz talep `demand_matrix` payload alanında, departman bazlı talep `department_demand_matrix: { [departmentId]: { [shiftDefId]: { [day]: count } } }` payload alanında. Personel objelerine `department_id` de eklenir.
3. OR-Tools motoru (`optishift_engine.py`) düz talebi tüm personel üzerinden, departman talebini ise sadece o `department_id`'ye sahip personel alt kümesi üzerinden `exact_coverage` hard constraint olarak uygular: o gün o vardiyaya (o departmanda) tam N kişi atanır — ne fazla ne eksik, ve başka bir vardiya tipine kaydırılamaz.
4. Motor kapasite matrisini karşıladıktan sonra kalan capacity için fairness optimizasyonu yapar
5. Kapasite matrisi (her iki seviye de) boşsa motor eski davranışa (coverage-max) döner
6. **Dikkat:** Departmanlı bir lokasyonda `locations.demand_matrix`'e yazmak motoru etkilemez — departman satırları varsa talep mutlaka ilgili `departments.demand_matrix`'e gitmelidir.

**Schedule sayfasındaki akış:**
- Grid'in üstünde kompakt bir matris tablosu: satırlar = shift tanımları (departman varsa departman başlığı altında gruplu), sütunlar = 7 gün, hücreler = sayı input
- Hücre `onBlur`'da otomatik kaydedilir (`handleDemandSave` / `handleDeptDemandSave`) → OR-Tools bir sonraki "Otomatik Oluştur"da bu talebi kullanır
- Grid'de her gün/shift kolonunda "atanan/gereken" sayacı gösterilir: `2/3 🔴` eksik, `3/3 ✅` tam, `4/3 🔵` fazla

### C. Shift Öncesi Müsaitlik Toplama
- Müdür tek tıkla personele "Haftalık Müsaitlik İsteği" gönderir.
- **Otomatik Hatırlatma:** Sistem her pazar 18:00'de henüz müsaitlik girmemiş personele push notification gönderir (müdür toggle ile açar/kapar).
- Personel mobil arayüzden günleri/saatleri 3 renkli boyar:
  - **Yeşil:** Müsait
  - **Sarı:** Tercih Etmiyorum (Gerekirse gelebilirim) — OR-Tools soft penalty olarak kullanır
  - **Kırmızı:** Kesinlikle Gelemem (Resmi İzin, Sınav, Okul vb.) — OR-Tools hard constraint (o güne kesinlikle atama yapılmaz)
- Saat aralıklı müsaitlik: Sarı seçenekte "09:00–17:00 arası gelebilirim" gibi zaman aralığı da girilebilir; OR-Tools bu aralığı dışına çıkan shift atamasını soft penalty ile cezalandırır.

### D. Kural Motoru (Rule Engine - Aç/Kapat Toggle)
Müdürün vardiyayı oluşturmadan önce esnetebileceği veya katılaştırabileceği parametreler:
- **Haftalık Maksimum Saat Limiti:** Yasal sınır (Varsayılan: 45 saat). Personel bazında farklı `max_weekly_hours` desteklenir.
- **Minimum Dinlenme Süresi:** İki vardiya arasında en az 11 saat olmalı.
- **Günlük Alan Kotası:** "X alanında her gün en az N kişi" — zone_quotas olarak saklanır.
- **Bütçe/Mesai Limiti:** Haftalık toplam fazla mesai bütçe sınırı.
- *Not:* Kurallar "Kritik" (Değiştirilemez) ve "Esnek" (Uyar ama izin ver) olarak ayrılır.
- **Yayınlama Öncesi İhlal Özeti:** "Yayınla" öncesinde sistem tüm kural ihlallerini tarar ve bir modal gösterir: "3 personelde 11 saat ihlali, 1 personel 45 saati aşacak. Devam etmek istiyor musunuz?"
- **Clopening Tespiti (OPTI-023):** Ardışık gün geçişinde dinlenme `rules.clopening_min_rest_hours` (varsayılan 13) saatin altındaysa (ama yasal 11 saatin üstündeyse) ihlal modalında "clopening (kapanış→açılış)" olarak isimlendirilir; kişi başı haftada 2+ clopening ayrıca özetlenir. OR-Tools motoru her clopening geçişine soft ceza (×30) uygular — alternatif varken kaçınır, mecbursa izin verir.
- **Yayın Sonrası Değişiklik Telafisi (OPTI-023):** Yayınlanmış (published) bir vardiyanın saati değişirse — bugün veya gelecekteki vardiyalar için — personele `rules.change_compensation_points` (varsayılan 2) telafi puanı yazılır (`prev_score += puan × 0.8`, kahraman bonusu emsali) ve bildirim gider. Predictability pay'in puan karşılığıdır; geçmiş hafta düzeltmeleri telafi tetiklemez.
- **Yayın Öncülüğü KPI'ı (OPTI-023):** `shift_assignments.published_at` haftanın ilk yayın anını tutar. `/api/schedule/publish-stats?location_id=` son 8 haftanın `lead_days` (hafta başlangıcı − ilk yayın) ortalamasını döner. Müdür dashboard'unda KPI kartı, supervisor panelinde şube kartı sayacı olarak gösterilir: ≥7 gün yeşil, 3–7 amber, <3 kırmızı.

### E. Dinamik Mola (Break) Yönetimi
- **Mola Havuzu Mantığı:** Çalışan işe gelip check-in yaptıktan sonra molaya çıkarken uygulamadan "Molaya Çık" butonuna basar.
- **Mola Kotası:** Aynı alanda personelin aynı anda molaya çıkması engellenir.
- Müdür dashboard'dan kimin aktif, kimin molada olduğunu canlı görür.

### F. Canlı Operasyon Takibi (Check-in / Live Ops)
- **Check-in:** Personel `/portal` ana sayfasındaki vardiya kartından "Check-in" butonuna basar. Bu, `shift_assignments.check_in_at` alanına timestamp yazar.
- **Dashboard Canlı Durumu:** Müdür dashboard'u şunu gösterir: "Beklenen: 4 | Geldi: 3 | Molada: 1 | Henüz gelmedi: Ali (15 dk geç)"
- **Otomatik Açık Vardiya:** Planlanan başlangıç saatinden 30 dakika sonra hala check-in olmayan personelin vardiyası "açık vardiya"ya düşer ve ekibe bildirim gider.
- `check_in_at` ve `check_out_at` alanları `shift_assignments` tablosunda nullable timestamp olarak tutulur.

### G. Taslak → İnceleme → Yayınla Akışı
Vardiya oluşturma tek adımlı "Yayınla" değildir. Üç aşama desteklenir:

1. **Taslak (draft):** Müdür çalışırken veya OR-Tools çıktısı gelince — `shift_assignments.status = 'draft'`
2. **İnceleme (review) — opsiyonel:** "Personele Gönder" butonu ile personele 48 saatlik itiraz penceresi açılır. Personel `/portal/requests` üzerinden `shift_edit_request` veya `shift_swap_request` oluşturabilir. Müdür onay ekranından batch inceler.
3. **Yayınlandı (published):** Final onay. `status = 'published'`. Tüm personele bildirim gider.

`shift_assignments.status` alanı: `'draft' | 'published'`
Personel portalı sadece `status = 'published'` vardiyeleri gösterir.

### H. Adil Vardiya Puanı (Fairness Score) & Gamification
- Her vardiya tipinin zorluk puanı vardır (müdür tanımlar: 1–10).
- **Optimizasyon Hedefi:** OR-Tools, tüm personellerin toplam puanları arasındaki farkı (max − min) minimize eder.
- **Tercih Edilmeyen Gün Telafisi:** Personelin sarı (preferred_not) işaretlediği güne atama yapılırsa vardiya puanı `rules.preferred_not_multiplier` ile çarpılır (varsayılan 1.5, settings'ten 1.0–3.0 ayarlanır). Motor sarı günden kaçınır (soft penalty) ama mecbur kalırsa fedakarlığı puanla telafi eder. Çarpan motor, publish fallback hesabı ve schedule sayfası client hesabının üçünde de uygulanır.
- **Sarı Gün Hakkı (kötüye kullanım koruması):** Personel haftada en fazla `rules.max_preferred_not_days` gün sarı işaretleyebilir (varsayılan 1). Tüm haftayı sarıya boyayıp bedava çarpan toplamak engellenir. Hem portal UI'da (sayaç + uyarı) hem `/api/availability` POST'ta (400) uygulanır.
- **Kriz Yönetimi:** Personel gelememe bildirimi yapınca shift "Açık Vardiya"ya düşer. Kabul eden personele 1.5x "Kahraman Bonusu" puanı verilir.
- **Kümülatif Grafik:** Fairness sayfasında `score_history` tablosundan çekilen aylık trend grafiği gösterilir.

### I. Raporlama & Dışa Aktarma (Export)
- Oluşturulan vardiya tek tıkla iki sekmeli **Excel (.xlsx)** olarak indirilir.
  - **1. Sekme (Yönetici Özeti & KPI):** Bütçe, yasal uyumluluk, adil puan dağılım metrikleri.
  - **2. Sekme (Haftalık Vardiya Planı):** Personel isimleri, yetenekler, alan bazlı çalışma saatlerinin renkli matrisi.

---

## 4. Çok Kiracılı Mimari (Multi-Tenant) & Organizasyon Hiyerarşisi

```
Organization  (Gratis A.Ş. / Hilton İzmir)
  └─ Branch   (Bağcılar Mağazası / Ana Bina)
       └─ Department  (Kasa / Bar / Salon / Mutfak)
            └─ Personnel
```

- **Organization:** En üst kiracı. Tüm veriler org_id bazında izole edilir.
- **Branch (locations tablosu):** Fiziksel lokasyon. `shift_definitions`, `demand_matrix`, `zone_quotas`, `operating_hours`, `rules`, `rotation_template` JSON alanları burada tutulur.
- **Department:** Branch içindeki operasyonel birim.
- **Personnel:** Her zaman bir branch'e, opsiyonel olarak bir department'a bağlıdır.

**Çoklu Lokasyon:** Part-time personel birden fazla branch'e atanabilir (`assigned_location_ids` JSON array).

---

## 5. Rol Sistemi (RBAC)

```
Admin
  └─ Supervisor   (bölge müdürü, işletmeci)
       └─ Manager  (mağaza müdürü, müdür yardımcısı, bar şefi, departman şefi)
            └─ Employee  (personel)
```

| Rol | Yetki |
|---|---|
| **Admin** | Organizasyon kurar; branch, department, kullanıcı ekler; ERP entegrasyonunu yönetir |
| **Supervisor** | Bağlı branch/department'ların shift'lerini görür; opsiyonel onay verir; raporlara erişir |
| **Manager** | Kendi biriminin shift'ini oluşturur ve yönetir; personel bilgilerini düzenler |
| **Employee** | Kendi vardiyasını görür; müsaitlik bilgisi girer; swap/edit talepleri oluşturur |

---

## 6. Üç Portal Mimarisi (Route Yapısı)

### Portal 1: Personel Portalı — `/portal/*`
**Rol:** `employee`
**Tasarım:** Mobile-first, sade, kart tabanlı.

- `/portal` — Ana sayfa: sıradaki vardiya kartı + Check-in/Check-out butonu, bu haftaki saat özeti, adalet puanı, son bildirimler
- `/portal/calendar` — Haftalık takvim. Sadece `status = 'published'` vardiyeler gösterilir.
- `/portal/availability` — Müsaitlik girişi: 3 renk + saat aralığı seçeneği.
- `/portal/requests` — Talepler merkezi:
  - **Shift Düzenleme Talebi** → `shift_edit_requests` tablosu
  - **Shift Swap Talebi** (3 aşamalı: A teklif → B kabul → müdür onay) → `shift_swap_requests` tablosu
  - **İzin Talebi** → `leave_requests` tablosu
  - **Gelen Talepler:** Swap teklifleri
- `/portal/chat` — Ekip sohbeti.
- `/portal/notifications` — Bildirimler.

**Kurallar:**
- Personel başka personelin vardiyasını göremez.
- Sadece `published` vardiyeler görünür — `draft` vardiyeler gizlidir.
- Shift düzenleme: müdür onayı olmadan değişiklik yapılamaz.

---

### Portal 2: Müdür Portalı — `/(app)/*`
**Rol:** `manager` veya `admin`
**Tasarım:** Dashboard odaklı, bilgi yoğun. Tablet/laptop öncelikli.

- `/(app)/dashboard` — **Canlı Operasyon Panosu:**
  - Bugün check-in yapan / beklenen / molada / geç kalan personel sayıları
  - Açık vardiyalar (check-in olmayan + rapor bildirimi)
  - Yaklaşan kural ihlalleri (11 saat dinlenme, 45 saat limit)
  - Şu anki aktif mola sayısı

- `/(app)/schedule` — **Vardiya Oluşturma Merkezi (en kritik sayfa):**

  **Akış (sırasıyla):**
  1. **Hafta seçimi** — hafta navigasyonu (önceki/sonraki)
  2. **Kapasite Matrisi (Demand Template):** Grid üstünde kompakt tablo. Satırlar = shift tanımları (departman varsa departman gruplu), sütunlar = 7 gün, hücreler = sayı input. "Pzt Sabah: 2, Pzt Akşam: 3" gibi. Önceki haftanın matrisi varsayılan olarak doldurulur. Hücre `onBlur`'da otomatik kaydedilir — departman yoksa `locations.demand_matrix`, departman varsa ilgili `departments.demand_matrix` güncellenir (bkz. §3.B).
  3. **Müsaitlik Toplama:** "Müsaitlik İste" butonu → o haftanın müsaitliğini girmemiş personele bildirim. Tablo hücrelerinde müsaitlik renk kodları görünür.
  4. **Otomatik Oluştur (OR-Tools):** Kapasite matrisini + müsaitliği + kural kısıtlarını + adalet puanını birleştirerek taslak üretir.
  5. **Manuel Düzeltme:** Her hücreye tıklayarak şablondan seç veya slider ile saat ayarla. Hücrelerde `atanan/gereken` sayacı canlı gösterilir.
  6. **Kural İhlali Önizlemesi:** Yayınlamadan önce otomatik kural tarama → ihlal modalı.
  7. **Otomatik Taslak + Tek Birincil Aksiyon (OPTI-024):** Hücre değişiklikleri 1.2 sn debounce ile otomatik taslak olarak kaydedilir (`/api/shifts` PATCH `sync_draft_week` — draft satırlar tam senkron, silinen hücre DB'den silinir, yayınlanmış satırlara dokunulmaz). "Taslak Kaydet" butonu yoktur. Üst barda tek birincil buton: hafta boşsa "Otomatik Oluştur", doluysa "Yayınla". İkincil aksiyonlar (Müsaitlik İste, Geçen Haftayı Kopyala, Personele Gönder, AI Özet, Excel, Geri Al/Yinele) "⋯ İşlemler" menüsündedir. Hafta durumu pasif çiple gösterilir: Boş hafta / Taslak / Yayınlandı / Yayınlanmamış değişiklik. Yayınlanmış haftada düzenlemeler otomatik kaydedilmez — "Yayınla"ya kadar lokal kalır.

  **Coverage Gap Göstergesi:**
  Grid'de her gün sütununun altında shift bazında sayaç: `(atanan)/(gereken)`. Eksikse kırmızı, tamsa yeşil, fazlaysa mavi.

  **Inline Fairness:** Her personel satırının sol sütununda: isim + bu haftaki birikimli puan + renk çubuğu (yeşil = en az yük, kırmızı = en yüksek yük). Vardiya eklenince anlık güncellenir.

  **Excel Export:** İki sekmeli .xlsx her zaman erişilebilir.

- `/(app)/personnel` — Personel yönetimi.
- `/(app)/fairness` — Adalet puanı yönetimi. `score_history` tablosundan kümülatif grafik.
- `/(app)/breaks` — Canlı mola takibi (backend tam akışa bağlı).
- `/(app)/requests` — **Onay Kutusu (Yeni):** Gelen shift_edit_requests + shift_swap_requests listesi. Müdür batch onay/red yapabilir.
- `/(app)/open-shifts` — Açık vardiyalar listesi + manuel ilan oluşturma.
- `/(app)/chat` — Mesajlaşma.
- `/(app)/settings` — Vardiya tanımları, zone tanımları, kural motor toggle'ları, müsaitlik hatırlatma zamanlaması.
- `/(app)/integrations` — ERP bağlantı yönetimi.

---

### Portal 3: Süpervizör / Patron Portalı — `/supervisor/*`
**Rol:** `supervisor` veya `admin`

- `/supervisor` — Ana panel: tüm şubelerin özet kartları ✅
- `/supervisor/schedule` — Şube bazlı vardiya görüntüleyici (read-only) ✅
- `/supervisor/personnel` — Organizasyon genelinde personel listesi ✅
- `/supervisor/reports` — **Çapraz şube raporları** ✅ (haftalık özet, şube bazlı KPI, uyumluluk sekmeleri)
- `/supervisor/chat` — Müdürlerle mesajlaşma ✅
- `/supervisor/settings` — Organizasyon geneli ayarlar ✅

---

## 7. Sistem Veri Modeli

Gerçek tip tanımları `web/lib/types.ts`, DB şeması `web/lib/db/schema.ts`.

**Mevcut tablolar (DB'de var):**
`organizations`, `locations`, `departments`, `users`, `personnel`, `shift_assignments`, `availability`, `notifications`, `leave_requests`, `messages`, `invite_tokens`, `score_history`

**Kritik alan eklemeleri:**
- `locations.demand_matrix` — JSON: `{ [shiftDefId]: { [day: 0-6]: count } }` — haftalık kapasite matrisi (departmansız lokasyonlar için)
- `departments.demand_matrix` — JSON: `{ [shiftDefId]: { [day: 0-6]: count } }` — departman bazlı kapasite matrisi; lokasyonda departman varsa schedule sayfası talebi buraya yazar. `/api/generate` bunu `department_demand_matrix: { [departmentId]: {...} }` olarak motora gönderir, motor `personnel.department_id` ile eşleştirip departman-scoped `exact_coverage` hard constraint uygular.
- `shift_assignments.status` — `'draft' | 'published'` (varsayılan `'published'` — mevcut kayıtlar için)
- `shift_assignments.published_at` — nullable unix timestamp, haftanın ilk yayın anı (yayın öncülüğü KPI'ı)
- `shift_assignments.check_in_at` — nullable timestamp
- `shift_assignments.check_out_at` — nullable timestamp

**Talep/operasyon tabloları (DB'de mevcut — uygulandı):**
- `shift_swap_requests` — `(id, org_id, requester_id, requester_name, target_id, target_name, requester_shift_id, target_shift_id, status: 'pending'|'peer_accepted'|'peer_rejected'|'manager_approved'|'manager_rejected'|'cancelled', note, created_at)` — durum geçişleri `lib/swapReducer.ts`'te tanımlı; PATCH body: `{ id, status }`
- `shift_edit_requests` — `(id, org_id, location_id, personnel_id, shift_id, requested_start, requested_end, reason, status: 'pending'|'approved'|'rejected', created_at)`
- `open_shifts` — `(id, org_id, location_id, date, start_time, end_time, note, hero_bonus_multiplier, status: 'open'|'claimed'|'cancelled', claimed_by, claimed_by_name, claimed_at, created_at)` — claim edilince kahramanın takvimine `shift_assignments` kaydı otomatik düşer
- Not: `/api/locations` PATCH `?id=` query parametresi alır (body'de değil); `/api/generate` hem `locationId` hem `location_id` kabul eder

**Örnek demand_matrix:**
```json
{
  "shift-def-1": { "0": 2, "1": 2, "2": 2, "3": 2, "4": 3, "5": 4, "6": 3 },
  "shift-def-2": { "0": 2, "1": 2, "2": 2, "3": 2, "4": 3, "5": 4, "6": 3 }
}
```

**Not:** Tablo adı `shifts` değil `shift_assignments`'tır.

---

## 8. Geliştirme Durumu & Öncelik Sırası

### Tamamlanan ✅
- [x] Proje iskeleti (Next.js + Drizzle + SQLite)
- [x] Auth sistemi (`optishift_session` cookie, JWT, `requireAuth`, rol tabanlı)
- [x] Personel portalı: dashboard, takvim, müsaitlik (3 renkli + saat aralığı), bildirimler, talepler UI, chat
- [x] Müdür portalı: dashboard, schedule (slider+OR-Tools), personnel, settings, fairness, breaks, open-shifts, chat, integrations, onboarding UI, billing UI
- [x] Supervisor portalı: login, ana panel, schedule (read-only), personel yönetimi, chat, settings
- [x] OR-Tools optimizasyon motoru — `/api/generate` üzerinden çağrılır, shift_definitions dinamik yükleme
- [x] ERP entegrasyon UI (SAP, Nebim, Logo)
- [x] Excel export — 2 sekmeli `.xlsx`
- [x] `messages` tablosu + chat API
- [x] Hafta bazlı shift persistency (`week_start`)
- [x] API güvenliği — `requireAuth` + org izolasyonu tüm endpoint'lerde
- [x] Unified login (`/login` → role bazlı redirect)
- [x] Manager branch restriction (API + Sidebar)
- [x] Schedule sayfası: yayınlandı göstergesi, vardiya tanımı yoksa hint, part-time saat limiti
- [x] **Fabrika Modülü (2026-06-17):**
  - `crews` tablosu + `/api/crews` (GET/POST/PATCH/DELETE) — Ekip yönetimi
  - `overtime_records` tablosu + `/api/overtime` (GET/POST/PATCH) — Fazla mesai onay akışı
  - `personnel.crew_id` + `personnel.ytd_overtime_hours` — Ekip ve YTD mesai takibi
  - `locations.rotation_template` JSON — Döngüsel rotasyon şablonu
  - OR-Tools motoru: ekip rotasyon kısıtı (hard/soft), YTD mesai üst sınırı (hard), adil mesai dağılımı (soft), mesai özeti çıktısı
  - Settings UI: "Ekipler" ve "Rotasyon" sekmeleri, Kurallar sekmesine mesai ayarları
  - `/api/locations` PATCH: `rotation_template` desteği

---

### Tier 1 — Değer Öldüren Eksiklikler (Bunlar olmadan ürün gerçekten yetersiz)

**T1-A: Kapasite Matrisi (Demand Template) + OR-Tools entegrasyonu**
- [ ] `locations.demand_matrix` alanı — schema.ts + migration (`npx drizzle-kit push`)
- [ ] Schedule sayfasına "Kapasite Planı" paneli: gün × vardiya bazlı sayı input
- [ ] `/api/locations` PATCH: `demand_matrix` alanı desteklenmeli (zaten destekleniyor, sadece frontend bağlantısı gerekli)
- [ ] OR-Tools motoru (`optishift_engine.py`): `demand_coverage` hard constraint — o gün o vardiyaya tam N kişi atanır
- [ ] `/api/generate` route: `demand_matrix` payload'a eklenmeli
- [ ] Grid'de coverage gap sayacı: her gün/shift kolonunda `(atanan)/(gereken)` badge

**T1-B: Shift Swap + Edit + Open Shifts Backend**
- [ ] `shift_swap_requests` tablosu: schema.ts + migration
- [ ] `shift_edit_requests` tablosu: schema.ts + migration
- [ ] `open_shifts` tablosu: schema.ts + migration
- [ ] `/api/swap-requests` route: POST (oluştur), PATCH (kabul/red/onay), GET (listele)
- [ ] `/api/shift-edit-requests` route: POST, PATCH, GET
- [ ] `/api/open-shifts` route: POST (ilan), PATCH (claim/cancel), GET
- [ ] `/(app)/requests` sayfası: gelen talepleri listele, batch onay/red UI
- [ ] `/portal/requests` sayfası: backend'e bağla (şu an sahte UI gösteriyor)
- [ ] Open shift claim edilince fairness score'a 1.5x kahraman bonusu uygula

**T1-C: Taslak → İnceleme → Yayınla Akışı**
- [ ] `shift_assignments.status` alanı (`draft` | `published`) — schema.ts + migration
- [ ] Mevcut `/api/shifts` POST: `status: 'draft'` ile kaydedebilmeli
- [ ] Schedule sayfası: "Taslak Kaydet" + "Personele Gönder" + "Yayınla" — üç ayrı buton
- [ ] "Personele Gönder": personele "incelemeniz için taslak gönderildi" bildirimi
- [ ] Personel portalı: sadece `published` vardiyeler gösterilir

---

### Tier 2 — Kullanım Kalitesini Belirleyenler

**T2-A: Canlı Operasyon Paneli (Live Ops)**
- [ ] `shift_assignments.check_in_at` + `check_out_at` — schema.ts + migration
- [ ] `/api/shifts` PATCH: check-in ve check-out timestamp yazma
- [ ] Personel portalı `/portal`: aktif vardiyada "Check-in" / "Check-out" butonu
- [ ] Müdür `/dashboard`: canlı durum satırı — geldi/bekleniyor/molada/geç
- [ ] 30 dk geç kalan için otomatik open shift oluşturma (cron veya API tetikleyici)

**T2-B: Schedule Sayfasında Inline Fairness**
- [ ] Her personel satırı sol sütununda: bu haftanın puan toplamı + renk çubuğu (anlık)
- [ ] OR-Tools taslağı gelince neden bu kişi bu vardiyaya atandı: "En düşük kümülatif puan — hak kazandı" tooltip

**T2-C: Müsaitlik Hatırlatma Otomasyonu**
- [ ] Settings'te: "Her [gün] [saat]'de müsaitlik girmeyenlere hatırlat" toggle + zaman seçici
- [ ] `/api/availability/remind` endpoint: henüz müsaitlik girmemiş personele notification oluşturur
- [ ] Cron veya schedule sayfasındaki manuel "Müsaitlik İste" butonu bu endpoint'i çağırır

**T2-D: Yayınlama Öncesi Kural İhlali Modalı**
- [ ] "Yayınla" butonuna tıklayınca client-side kural kontrol: 11 saat dinlenme + 45 saat + max_weekly_hours
- [ ] Tespit edilen ihlaller için onay modalı: "3 kural ihlali var, yine de yayınlamak istiyor musunuz?"
- [ ] İhlal özetinde personel ismi + ihlal türü gösterilir

---

### Tier 3 — Önemli, Sonraya Bırakılabilir

- [ ] Haftalık bütçe/maliyet takibi: personele saatlik ücret + schedule'da toplam maliyet paneli
- [ ] Geçen haftayı kopyala / şablon kaydet
- [x] `/supervisor/reports` sayfası: çapraz şube KPI raporları ✅ (canlıda çalışıyor)
- [ ] Fairness sayfasında gerçek kümülatif grafik (`score_history` verisinden)
- [ ] Onboarding wizard: 5 adımlı org kurulum akışı
- [ ] Billing: Stripe entegrasyonu + plan limiti
- [ ] Mobile PWA: manifest + service worker

---

### Bilinen Teknik Borçlar (çözüldü)
- cellMap key multi-dash ID split → `lastIndexOf("-")` düzeltildi
- Gece geçişi vardiyasında negatif puan → `+1440` düzeltmesi
- Portal auth race condition → `mounted` guard
- `/api/availability` güvenlik açığı → 403 ile izole
- Manager branch restriction → API + Sidebar

---

## 9. Kodlama Kuralları

İstisnasız uygulanır.

- **Dil:** Tüm UI metinleri Türkçe. Kod içi değişken/fonksiyon isimleri İngilizce.
- **Auth:** `localStorage` `optishift_portal_user` (employee), `optishift_manager_user` (manager/admin), `optishift_supervisor_user` (supervisor). Her portalda login yoksa `/login`'e redirect.
- **API:** Tüm API'ler `org_id` bazında izole çalışır. Farklı org'a erişim yasak.
- **Rol kontrolü:** Backend `user.role` mutlaka kontrol eder. Frontend güvenlik değil, gösterim kolaylığı içindir.
- **Shift saatleri:** Hardcoded "sabah/akşam" yok. Her zaman `HH:MM` formatında `start_time` / `end_time`. Shift tipleri müdür tanımlar.
- **Status:** Yeni shift'ler `status = 'draft'` ile kaydedilebilir; personel portalı sadece `published` görür.
- **Adalet puanı:** `prev_score` kümülatif toplam değil, ağırlıklı dönem ortalaması. Her ay eski puan %20 ağırlıkla taşınır.
- **Yeni tablo:** `schema.ts` → `types.ts` → `npx drizzle-kit push`.
- **Bileşenler:** `shadcn/ui`. Stil için `globals.css` CSS variable'ları. Inline Tailwind renk hardcode etme.
- **Demand matrix:** OR-Tools'a gönderilirken format: `{ [shiftDefId]: { [day: 0-6]: exactCount } }`. Motor `exact_coverage` constraint ile çalışır.

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
- **Müsaitlik toplama OPSİYONELDİR (2026-07-03):** `locations.rules.availability_collection_enabled` (varsayılan `true`, her yerde `!== false` ile okunur). Settings → Personel Talepleri sekmesinde "Müsaitlik Toplama" toggle'ı (2026-07-04 konfigürasyon konsolidasyonu ile Kurallar'dan taşındı). Kapalıyken müdür vardiyaları tek başına planlar: schedule sayfasındaki "X personel müsaitlik girmemiş" bandı, ⋯ menüdeki "Müsaitlik İste", popover uyarısı ve yayın öncesi "müsaitlik girilmemiş" ihlal maddesi gizlenir; personel portalında Müsaitlik nav linki kalkar ve `/portal/availability` bilgi kartı gösterir ("Bu işletmede vardiyaları müdürünüz planlıyor"); `/api/availability/remind` o lokasyon için `{ sent: 0, disabled: true }` döner. Motor değişmedi — eksik müsaitlik zaten "tam müsait" kabul edilir; girilmiş kırmızı/sarı günler kapalıyken de saygı görmeye devam eder.
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
- **Yayın Sonrası Değişiklik Telafisi (OPTI-023, 2026-07-03 rewrite):** Yayınlanmış (published) bir vardiyanın saati değişirse — bugün veya gelecekteki vardiyalar için — `score_adjustments` tablosuna `change_comp` olayı yazılır (`points = rules.change_compensation_points`, varsayılan 2) ve bildirim gider; kümülatif skor `recomputeLocationFairness()` ile deterministik olarak tazelenir. Predictability pay'in puan karşılığıdır; geçmiş hafta düzeltmeleri telafi tetiklemez.
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

**Resmi puan modeli (2026-07-03 rewrite — tek kaynak: `web/lib/fairness.ts`):**
```
yük (burden)  = zorluk(1-10) × saat × [hafta sonu ×1.2][gece ×1.3][sarı gün ×1.5][clopening ×1.2][kahraman ×1.5][zorunlu atama ×çarpan]
kümülatif     = Σ(i=0..pencere-1) (haftalık_yük[i] + adjustment[i]) × decay^i   (varsayılan decay 0.85, pencere 8 hafta — rules.fairness_decay_factor / fairness_window_weeks)
fairness_z    = (takım_ort − kişi_kümülatif) / stddev  →  fairnessLabel() Türkçe etiket
```
- Tüm çarpanlar ve `*_enabled` toggle'ları `locations.rules`'tan okunur; formülün çekirdeği `calcAssignmentBurden()`.
- **Tek yazar kuralı:** `personnel.prev_score` türetilmiş bir ÖNBELLEKTİR — asla doğrudan `+=` yazılmaz. Tek yazar `web/lib/scoring.ts`: `rescoreWeek()` (haftayı deterministik puanlar, score_history DELETE+INSERT — re-publish idempotent) ve `recomputeLocationFairness()` (kümülatif + z recompute).
- **Vardiyaya bağlı bonuslar çarpandır:** kahraman (open shift claim → o vardiyanın yükü ×hero_bonus_multiplier) ve kabul edilmiş zorunlu atama (×force_bonus_multiplier) yük formülünün içindedir; claim/kabul anında `rescoreWeek()` çağrılır.
- **Vardiyaya bağlı olmayan puanlar olaydır:** `score_adjustments` tablosu (type: `change_comp` | `manual`) — örn. yayın sonrası saat değişikliği telafisi. Kümülatif hesap adjustment'ları haftasına göre decay penceresine katar.
- **Motor (planlama-anı yaklaşımı):** OR-Tools aynı çarpanları kullanır ama int yuvarlar, clopening'i puana değil ayrı soft cezaya koyar, kahraman/zorunlu atamayı modellemez (bunlar plan sonrası olaylardır) — bilinçli farklar `optishift_engine.py` başındaki blokta belgelidir. Optimizasyon hedefi: part-time ağırlıklı toplam puanların (max − min) farkını minimize etmek.
- **Tercih Edilmeyen Gün Telafisi:** Sarı güne atama → yük ×`rules.preferred_not_multiplier` (varsayılan 1.5). Motor sarı günden kaçınır (soft penalty), mecbursa puanla telafi eder.
- **Sarı Gün Hakkı:** Haftada en fazla `rules.max_preferred_not_days` gün (varsayılan 1); portal UI + `/api/availability` POST (400) uygular.
- **Kümülatif Grafik:** Fairness sayfasında `score_history`'den trend; schedule sayfası canlı hücre puanını `cellBurden()` (aynı çekirdek) ile gösterir, "kesin puan yayında hesaplanır".

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
- `/(app)/settings` — 7 sekme (2026-07-04 konsolidasyonu): **Vardiyalar** (çalışma saatleri + vardiya tanımları) · **Kurallar** (planlama kısıtları + clopening'in tamamı + canlı operasyon + yayın akışı & KPI toggle + konum/hava + fazla mesai) · **Personel Talepleri** (müsaitlik toplama + sarı gün hakkı + otomatik/manuel hatırlatma + takas/değişiklik toggle'ları + izin politikası) · **Adalet Puanı** (sadece çarpan/bonus/gelişmiş) · **Departmanlar & Alanlar** (departman CRUD anında DB'ye + alan kotaları) · **Ekipler & Rotasyon** (birleşik) · **Hesap**. Kayıt modeli: departman/ekip işlemleri anında API; diğer her şey tek yapışkan "Kaydedilmemiş değişiklikler var — Kaydet/Vazgeç" barıyla toplu kaydedilir (rotasyon dahil), `beforeunload` uyarısı vardır.
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
- [x] **Kapasite Matrisi Sağlamlaştırma & Departman Ayrımı (2026-07-03):**
  - `diagnose_infeasibility()` (`engine/optishift_engine.py`): INFEASIBLE durumunda hangi gün/departmanda talebin mevcut personel sayısını aştığını Türkçe, somut bir mesajla raporluyor — genel "kısıtlamaları esnetin" mesajı yerine (örn. "Cumartesi — Hat-A: 10 kişi isteniyor ama bu departmanda sadece 5 müsait personel var")
  - `/api/generate`: lokasyonda departman satırları varsa artık `locations.demand_matrix` (departmanlar eklenmeden önceki eski/hayalet veri) motora hiç gönderilmiyor — talep sadece ilgili `departments.demand_matrix` üzerinden yönetiliyor (bkz. §3.B)
  - Kök sebep: departman sorgusu `getDB()` raw-SQL uyumluluk katmanı üzerinden çekiliyordu ve production'da sessizce hata verip boş dizi döndürüyordu, guard'ı etkisiz kılıyordu. `/api/departments`'ın kullandığı kanıtlanmış Drizzle sorgusuna geçildi; hata artık `console.error` ile loglanıyor. `personnel.department_id` varlığı ikinci bir güvenlik katmanı olarak eklendi.
  - FastAPI'nin ham `{"detail": "..."}` hata gövdesi artık ayrıştırılıp kullanıcıya temiz mesaj gösteriliyor (`callEngine` içinde)
  - Schedule sayfası: motor çağrılmadan önce aynı kapasite/personel çelişkisini tespit eden client-side ön-kontrol (`capacityWarnings`) + kırmızı uyarı bandı; "müsaitlik girilmemiş" banner'ı artık bunun engelleyici olmadığını açıkça belirtiyor
  - Kapasite Planı hücrelerinde "maks N kişi" ipucu — hücre başına değil, satır/departman başlığında bir kez gösteriliyor (görsel kalabalığı önlemek için); bir hücre değeri, aynı günün aynı departmandaki diğer vardiyalarına zaten girilmiş sayı düşülerek hesaplanan "kalan kapasite"yi aşarsa kırmızıya dönüyor
- [x] **"Müsaitlik Toplama" Toggle — Müdürün Tek Başına Planlama Modu (2026-07-03):** `rules.availability_collection_enabled` alanı + Settings toggle'ı; kapalıyken schedule sayfası müsaitlik uyarıları susturulur, portal Müsaitlik nav/sayfası kapatılır, remind endpoint'i inert olur (bkz. §3.C ilk madde). Motor ve `/api/generate` değişmedi.
- [x] **Adalet Motoru Rewrite — Faz 1: Tutarlılık Çekirdeği (2026-07-03):** Resmi model §3.H'de. Düzeltilen gizli buglar: (1) schedule + Excel'deki efsane formül (`saat×1.5+2`, base_points'siz) → `calcAssignmentBurden`; (2) publish'te kahraman çarpanı hiç işlemiyordu (`sa.id` seçilmiyordu, `os.date=Pazartesi` join'i) → `rescoreWeek` içinde kişi|gün|saat eşlemesi; (3) client taslakları `shift_id` göndermiyordu → publish puanlaması herkese base_points=5 uyguluyordu; (4) dört ad-hoc `prev_score` yazarı (kahraman ×0.8, telafi +1.6, zorunlu atama +12, personnel PATCH ham yazma) → tek yazar `lib/scoring.ts` + `score_adjustments` olay tablosu. Re-publish artık idempotent rescore (eskiden `alreadyScored` kalıcı engeldi). Vitest kuruldu (`npm test`, `lib/__tests__/fairness.test.ts`, 22 test).
- [x] **Adalet Motoru Rewrite — Faz 2: Şeffaflık UI (2026-07-04):** `GET /api/fairness/me` (personelin KENDİ puanı + son 8 hafta dökümü + adjustment listesi + `fairnessLabel` etiketi — başkalarının sayısı asla serialize edilmez; müsaitlik toplama kapalıysa sarı gün alanları gizli) ve `GET /api/score-adjustments?location_id=` (müdür görünümü). Portal ana sayfa puan kartı canlı API'ye bağlandı: takım konumu etiketi + tıklayınca açılan döküm (haftalık yük grafiği, çarpan sayaçları, telafi olayları). Fairness sayfası: satıra tıklayınca kişi bazlı kırılım (son 4 haftanın yük/saat/çarpan tablosu + puan olayları); stored `fairness_z_score` tercih edilir. Schedule drawer: kişi başı canlı çarpan chip'leri (Nhs / N🌙 / N!).
- [x] **God Mode Panel Sağlamlaştırma (2026-07-05):** `/admin` (şifre `.env.local` → `GOD_MODE_PASSWORD`, cookie `optishift_god_session`, 4 saat). Sekmeler: Genel Bakış (canlı metrik + SSE olay akışı + churn radarı), Organizasyonlar (+ detay: plan/askı/max_personnel/not, şube listesi, kullanıcılar), **Kullanıcılar** (platform geneli arama/filtre; impersonate, geçici şifre üretme, onay/red durumu — `/api/god/users` GET/PATCH, audit-loglu), **Duyurular** (`system_banners` yönetimi; `SystemBanner` bileşeni 3 portal layout'unda banner gösterir — önceden API vardı ama hiçbir portal okumuyordu), Audit Logu. Impersonate düzeltmesi: API artık login-şekilli `user` objesi döner, client doğru `optishift_*_user` localStorage anahtarını doldurur (eskiden cookie set edilip localStorage boş kaldığı için portal login'e geri sekiyordu).
- [x] **Konfigürasyon Konsolidasyonu (2026-07-04):** Tüm ayar yüzeyleri tek mantığa toplandı; sahte/kaydedilmeyen ayarlar gerçeğe bağlandı:
  - Settings "Bölgeler" sekmesindeki departman CRUD'u localStorage mock'undan (`optishift_settings_mock_*` — tamamen kaldırıldı) gerçek `/api/departments`'a bağlandı; DELETE artık `personnel.department_id` + `users.department_id` temizler; route'a `requireAuth` + lokasyon-org sahiplik doğrulaması eklendi. Sekme "Departmanlar & Alanlar" oldu (departman ≠ alan kotası ayrımı görselleştirildi).
  - Entegrasyonlar sayfası mock state'ten `organizations.connected_erp`'a bağlandı (tek kaynak). Yeni org-scoped `GET/PATCH /api/organizations` (PATCH: admin+supervisor; `/api/admin/organizations` PATCH admin-only olduğu için supervisor ERP kaydı sessizce başarısız oluyordu — düzeltildi, hata artık gösteriliyor). ERP kataloğu `lib/erp.ts`'te tek listede; alan eşleştirme `erp_mapped_fields`'a kaydediliyor. Manager rolü read-only, admin/supervisor yazar.
  - Otomatik müsaitlik hatırlatması artık gerçek: `rules.availability_reminder = {enabled, day, time, last_sent_week}` kalıcı. İki tetikleyici: (1) müdür dashboard yüklenişinde `/api/availability/remind` `{auto:true}` ile çağrılır (anlık, müdür o gün panele girerse), (2) `GET /api/cron/availability-remind` (2026-07-06 eklendi, `web/vercel.json` crons — günde bir kez, CRON_SECRET korumalı) tüm lokasyonları gezip aynı mantığı dener — müdür panele hiç girmese de hatırlatma gider. Paylaşılan iş mantığı `web/lib/availabilityReminders.ts`'te tek kaynak; vadesi geldiyse gelecek haftanın müsaitliğini girmemişlere haftada bir kez gönderir (last_sent_week ile idempotent).
  - Settings dirty-tracking bug'ı: fazla mesai ×4, `crew_same_shift_hard`, `preferred_not_enabled`, `change_compensation_enabled`, `leave_override_bonus_enabled` isDirty'ye dahil değildi → sadece bunlar değişince Kaydet pasif kalıyordu. Düzeltildi; rotasyon da aynı kayıt akışına alındı (`rotation_template` handleSave payload'ında).
  - Sekme yapısı yeniden düzenlendi (bkz. §6 `/(app)/settings`); sekme başına 6 ayrı Kaydet butonu yerine tek yapışkan kayıt barı + toast (alert kalktı) + beforeunload uyarısı.
  - Open-shifts formu kahraman bonusu varsayılanını hardcoded 1.5 yerine `rules.hero_bonus_multiplier`'dan okur.
  - `Location.rules` tipi bayat inline tipten `Partial<ScheduleRules> & Record<string, unknown>`'a genişletildi.
- [x] **Fazla Mesai Modülü Rewrite — 3 Faz (2026-07-05):**
  - **Faz 1 (sağlamlık):** `web/lib/overtime.ts` tek yazar modülü. `personnel.ytd_overtime_hours` artık türetilmiş önbellek — `recomputeYtdOvertime()` o yılın approved kayıtlarından deterministik hesaplar (`+=` kalktı; yıl devri otomatik sıfırlanır — eski kodda YTD hiç sıfırlanmıyordu ve 1 Ocak'ta motor herkesi 270 limitinde sanıyordu). `upsertPendingOvertime()` hafta başına tek kayıt kuralı: re-generate çift kayıt/çift YTD saymaz (eski kod approved varken ikinci kayıt açıyordu), karara bağlanmış kayıtlar ezilmez, fazladan pending kopyalar temizlenir. `deriveOvertimeForWeek()` yayın anında (publish route) yayınlanan saatlerden mesaiyi türetir — motor taslağı değil yayınlanan plan otoritedir (rescoreWeek felsefesi). `/api/generate` motor payload'ına taze YTD verir ve raw-SQL insert bloğu Drizzle upsert'e taşındı. Müdür onay/red kararı geri alınabilir (PATCH `status: 'pending'` + UI "Geri Al").
  - **Faz 2 (personel onayı — İş K. m.41):** `overtime_records`'a `employee_status` (pending|accepted|declined), `employee_responded_at`, `compensation_type` (paid = %50 zamlı ücret | time_off = 1s→1,5s serbest zaman), `comp_time_used_at` kolonları. `GET/PATCH /api/overtime/me` — personel KENDİ kayıtlarını görür, kabul/red eder, kabul ederken telafi türünü seçer; müdür karara bağladıktan sonra yanıt kilitlenir. Yayında mesaisi doğan personele bildirim gider; portal Talepler → Gelen sekmesinde onay kartları + serbest zaman bakiyesi bandı. Saatler re-publish'te değişirse eski personel onayı otomatik sıfırlanır. Müdür overtime sayfasında personel onay chip'leri + "İzin Kullandırıldı" işareti (comp_time bakiyesi türetilmiş: approved×time_off×kullanılmamış×1,5 — `getCompTimeBalanceHours`).
  - **Faz 3 (maliyet & bütçe):** `personnel.hourly_wage` alanı (+ personel düzenleme formu). Mesai maliyeti = saat × ücret × 1,5; overtime sayfası "Bu Ay Mesai Maliyeti" kartı + satır bazında ₺, aylık rapor (`/api/reports/monthly` + `/reports`) maliyet sütunu + Excel'e eklendi (rapor artık hardcoded 45 değil `rules.overtime_threshold_hours` kullanır). `rules.weekly_overtime_budget_hours` (0 = limitsiz, Settings → Kurallar → Fazla Mesai): yayın öncesi ihlal modalı toplam eşik-üstü saati bütçeyle karşılaştırır.

- [x] **Basitlik Paketi — 4 Faz (2026-07-05):** "Sıfır öğrenme eğrisi" vaadine dönüş:
  - **Faz A (yerinde kurulum):** Schedule'da `QuickSetup` bandı (components/schedule/QuickSetup.tsx) — vardiya şablonu/personel yokken 3 maddelik checklist: yerinde "Vardiya Tanımla" modalı (sektör preset'li, `/api/locations` PATCH) + yerinde hızlı personel ekleme (isim+telefon çoklu satır) + kapasite işareti. Kayıt sonrası `optishift_location_changed` event'i sayfayı tazeler. Settings `?tab=` derin link destekler; boş durum linkleri `/settings?tab=shifts`e iner.
  - **Faz B (Basit Mod):** `rules.simple_mode` — Sidebar basit modda 6 çekirdek öğe (Dashboard, Personel, Vardiya Planı, Onaylar, Mesajlaşma, Ayarlar) + katlanır "Gelişmiş" grubu (aktif sayfa oradaysa veya bekleyen mesai onayı varsa açık başlar). Settings basit modda 3 sekme (Vardiyalar, Personel Talepleri, Hesap) + "Gelişmiş ayarları göster" (oturumluk); kalıcı toggle Kurallar → Görünüm. Müdür Onaylar sayfasına 4. sekme: **Mesai** (pending overtime onay/red, personel onay chip'i; rozet toplamı dahil).
  - **Faz C (preset'ler):** `lib/presets.ts` TEK KAYNAK — sektör → vardiya şablonları + departman önerileri + simple_mode (kafe/perakende/otel/restoran basit, fabrika gelişmiş). Onboarding 5 adımdan 2+1'e indi: İşletme (sektör+şubeler) → Vardiyalar (preset dolu) → bitti; departman/kural adımları kaldırıldı (departman bilinçli olarak kurulmuyor — kapasite matrisi düz kalsın; kurallar preset varsayılanı).
  - **Faz D (dil+yönlendirme):** "Onay Kutusu" → "Onaylar" (sidebar+sayfa), Kapasite Planı başlığı "kaç kişi gerekli?" diliyle, dashboard'a "Sıradaki Adım" kartı (öncelik: personel yok → gelecek hafta yayınlanmamış → bekleyen izin → müsaitlik eksik).

- [x] **Fabrika Paketi 1-2-3 + Ege Metal Demo (2026-07-06):** Gerçek fabrika sorunları araştırması (Postalar Yönetmeliği, devamsızlık sarmalı, yetkinlik karması) üzerine üç paket:
  - **Paket 1 — Yasal Gece Koruması:** `personnel.night_restriction` ('pregnant'|'nursing'|'under18'|'medical') — motor gece vardiyasına atamaz (hard), personel formunda seçici, ihlal modalı maddesi. `rules.consecutive_night_weeks_enabled` (varsayılan KAPALI — kafe regresyonu önlenir): geçen haftanın YAYINLANMIŞ gece çalışanları `/api/generate`'te sorgulanıp motora `prev_week_night_ids` olarak gider, bu hafta gece yazılmaz (hard). Gece vardiyası >7,5s: vardiya editöründe kırmızı uyarı + yayın ihlali. Gece tespiti her katmanda aynı sezgi: `is_night` bayrağı YA DA başlangıç ≥22:00 YA DA gece yarısını aşma (`_is_night_shift` / `isNightCell`). **Düzeltilen bug:** `is_night` bayrağı motora hiç gönderilmiyordu — gece çarpanı motorda ilk kez işliyor.
  - **Paket 2 — Devamsızlık Reflexi:** `POST /api/open-shifts` `convert_assignment_id` modu — atama tek adımda açık vardiyaya döner (atama silinir, kişiye+ekibe bildirim, `no_show` ise sayaç artar). Dashboard no-show otomasyonu `rules.auto_open_shift_on_late` + `late_threshold_min` ayarlarına bağlandı (eskiden hardcoded 30dk + atama silinmediği için çift kayıt vardı); toggle kapalıyken manuel "Açığa Çıkar" butonu. `GET /api/open-shifts/candidates?id=` akıllı aday listesi: o gün boş + kırmızı olmayan + (geceyse) gece kısıtsız; 11s dinlenme/haftalık limit uyarı olarak; adalet puanı artan sıralı. Open-shifts sayfası "Uygun Adayları Göster" + "Ata" (PATCH `assigned_by_manager: true` → farklı bildirim dili).
  - **Paket 3 — Zorunlu Yetkinlik:** `ShiftDefinition.required_skills: [{skill, count}]` — o vardiyaya HERHANGİ atama yapılan her günde ≥N yetkinlikli kişi (hard; vardiya boşsa uygulanmaz — CP-SAT `only_enforce_if(staffed)`). Vardiya editöründe chip UI, kapasite ön-kontrolü + yayın ihlal taraması + motor diagnose mesajı.
  - **Ege Metal A.Ş. demo fabrikası PROD'da:** `web/scripts/seed_ege_metal.mjs` (idempotent, tekrar çalıştırılabilir) — org-ege-metal / Torbalı Fabrikası, 3 vardiya (Gece 22:00–05:30 = 7,5s yasal), 5 departman talep matrisli, 3 ekip ileri rotasyon (3 haftalık döngü), 48 personel (1 gebe, 1 çırak, 1 YTD-250, gece zorunlu ≥1 bakımcı, kıdemli işe giriş tarihleri). Girişler: `egemetal.admin` / `egemetal.mudur` / `egemetal.personel` (şifre 1234). Prod E2E doğrulandı: 223 atama, gebe/çırak gecede yok, her gecede bakımcı var.
  - **Devam turları (2026-07-06):** Denkleştirme dönemi (`rules.balancing_period_weeks`, İş K. m.63 — generate route geçmiş N-1 haftadan kişi bazlı kalan hak hesaplar, tek hafta tavanı 66s; yan bugfix: motor rules payload'ı artık hardcoded 45/11 değil). Vardiya devri notu (`shift_assignments.handover_note`, check-out modalı, `GET /api/shifts/handover`). Kapasite Planı hafta şablonları (`locations.demand_templates` — kaydet/uygula/sil). Puantaj CSV (`GET /api/reports/timesheet` — kişi-gün, giriş/çıkış, geç kalma, GELMEDİ durumu). **Her davranışın toggle'ı var** (kullanıcı kuralı): `night_legal_warning_enabled`, `handover_notes_enabled` dahil.

- [x] **Yıllık İzin Motoru (2026-07-06):** Kalan izin TÜRETİLMİŞ değerdir — tek kaynak `web/lib/leave.ts` (17 vitest): `entitledDaysForServiceYear` (İş K. m.53: 1-5 yıl 14g, 5+ 20g, 15+ 26g, 18 yaş altı min 20), `countLeaveDays` (m.56: hafta tatili — kişinin sabit izin günü, yoksa Pazar — izinden sayılmaz), `computeLeaveBalance` iki mod: SABİT (varsayılan; `annual_leave_days_total` − bu takvim yılı kullanımı) ve KIDEM (`rules.auto_leave_entitlement_enabled` toggle; hizmet yıldönümü başına hak, kullanılmayan otomatik devir — kümülatif). Elle düzeltme tek alan: `personnel.leave_adjustment_days`. `GET /api/leave-requests/balance` (personel kendini, müdür `?personnel_id=`); portal Talepler'de kalan izin bandı; müdür Onaylar'da bekleyen yıllık izinde "kalan X gün / bakiyeyi aşıyor!" rozeti (bilgilendirir, engellemez); personel kartında işe giriş tarihi + yıllık hak + düzeltme alanları (PATCH: `hire_date`, `annual_leave_days_total`, `leave_adjustment_days`). Prod E2E: P-EM-01 9 yıl kıdem → 150 gün ✓.
- [x] **Google ile Giriş (2026-07-06) — kod tamam, credential/migration bekliyor:** `/login` (admin+manager+supervisor tek sayfa) ve `/register`'a "Google ile devam et" eklendi; **personel portalı (`/portal/login`) bilinçli olarak dışarıda** (vardiya çalışanlarının çoğunda kurumsal/tutarlı Google hesabı olmayabilir). Manuel OAuth 2.0 authorization-code akışı (next-auth gibi ek framework yok, mevcut JWT/cookie modeliyle uyumlu): `web/lib/googleAuth.ts` (auth URL, code exchange, `jose` ile Google JWKS'e karşı id_token doğrulama, imzalı state/pending-profile token'ları) → `GET /api/auth/google/start` (state ile yönlendirme) → `GET /api/auth/google/callback` (google_id ile ara, yoksa doğrulanmış email'le eşleştirip hesabı bağlar, o da yoksa `/register?google_pending=...`'a yönlendirir) → mevcut hesapta `GET /api/auth/google/session` + `/auth/google/complete` köprü sayfası `handleLogin`'deki AYNI rol bazlı localStorage/yönlendirme mantığını tekrar kullanır; yeni hesapta `POST /api/auth/google/complete-registration` sadece org_name+username isteyip organizasyonu kurar. Şema: `users.password_hash` nullable, `users.auth_provider` (`password`|`google`), `users.google_id` (unique) eklendi — **prod'da `npx drizzle-kit push` çalıştırılmadan bu özellik canlıya çıkmaz**; ayrıca `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`NEXT_PUBLIC_APP_URL` env'leri gerekli (bkz. DEPLOYMENT.md "Google ile Giriş Kurulumu") — tanımlı değilse buton 503 döner, sistemin geri kalanını etkilemez.
- [x] **Lansman Denetimi & Düzeltmeleri (2026-07-19):** Tam site denetimi sonrası:
  - **Proxy allowlist onarımı:** `forgot-password`, `reset-password` PUBLIC_API_PATHS'e eklendi; `isPublicInviteRequest()` — `/api/invites` GET+PATCH (join akışı) ve `/api/invite` GET (setup oturum başlatıcı) public. Hepsi prod'da 401 dönüyordu (hardening pass regresyonu) — davet kabulü, ilk giriş kurulumu ve şifre sıfırlama tamamen kırıktı. `/api/auth/setup` bilinçli olarak public DEĞİL (invite GET'in kurduğu cookie ile çalışır); `/api/invites` POST (davet oluşturma) JWT arkasında kaldı.
  - **forgot-password güvenliği:** `resetUrl` oturumsuz yanıtta asla dönmez (dönerse hesap ele geçirme); yanıt her durumda tek tip `{ok:true}` (enumeration koruması). E-postasız kullanıcının yolu: yönetici geçici şifre üretir.
  - **Raw-SQL katmanı INSERT bug'ı:** `getDB().run()` her INSERT'e `RETURNING id` ekliyordu — id kolonu olmayan tablolarda (password_reset_tokens: PK=token) 42703 hatası. `RETURNING *` yapıldı. Bu desen yeni id'siz tablolarda tekrar edebilirdi.
  - **Yasal sayfalar:** `/gizlilik` (KVKK aydınlatma + gizlilik) ve `/kullanim-sartlari`, `components/LegalShell.tsx` ortak kabuk; landing+pricing footer linkleri; register'da onay satırı. İletişim adresi şimdilik sgndgdu@gmail.com — domain alınınca güncelle.
  - **Google girişi `FEATURES.googleAuth` bayrağına alındı** (kapalı): buton ham JSON 503'e çıkıyordu; credential + `NEXT_PUBLIC_APP_URL` kurulunca bayrağı aç.
  - **Prod env eklendi:** `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, VAPID çifti (push ilk kez aktif; aynı çift .env.local'de). Hâlâ eksik: `RESEND_API_KEY` (şifre sıfırlama e-postası gitmiyor — Resend hesabı gerekli), `ANTHROPIC_API_KEY` (AI özet 503).
  - Ölü "Kaynaklar" (`href="#"`) linkleri kaldırıldı.
- [x] **Basic Sürüm Feature Flag'leri (2026-07-19):** `web/lib/features.ts` TEK KAYNAK — yarım kalan modüller basic lansmanda kapalı: `integrations` (ERP senkron backend'i yok), `billing` (Lemon Squeezy yarım), `breaks` (canlı mola backend akışı eksik). Bayrak kapalıyken sidebar linki hiç gösterilmez (`NAV` girişindeki `feature` alanı), sayfaya doğrudan URL ile gelen `components/FeatureDisabled.tsx` kartını görür ("Bu özellik şu an kullanıma açık değil"). Geri açmak = bayrağı `true` yapmak; kod silinmedi. Yeni bir yarım özellik eklerken aynı deseni kullan: flag + NAV `feature` + sayfa başında erken dönüş.

---

### Tier 1 — Değer Öldüren Eksiklikler (Bunlar olmadan ürün gerçekten yetersiz)

**T1-A: Kapasite Matrisi (Demand Template) + OR-Tools entegrasyonu** ✅ Tamamlandı (bkz. §8 Tamamlanan — 2026-07-03 sağlamlaştırma dahil)
- [x] `locations.demand_matrix` alanı — schema.ts + migration (`npx drizzle-kit push`)
- [x] Schedule sayfasına "Kapasite Planı" paneli: gün × vardiya bazlı sayı input
- [x] `/api/locations` PATCH: `demand_matrix` alanı desteklenmeli (zaten destekleniyor, sadece frontend bağlantısı gerekli)
- [x] OR-Tools motoru (`optishift_engine.py`): `demand_coverage` hard constraint — o gün o vardiyaya tam N kişi atanır
- [x] `/api/generate` route: `demand_matrix` payload'a eklenmeli
- [x] Grid'de coverage gap sayacı: her gün/shift kolonunda `(atanan)/(gereken)` badge

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
- `shift_id: "custom"` sentineli (client'ta tanımlar geç yüklenince her atamaya yazılıyordu) → arşiv grid'i boş görünüyor, rescore tüm vardiyaları zorluk-5/gecesiz puanlıyordu. Üç katmanda çözüldü: `resolveShiftDef()` (lib/fairness.ts — id→saat fallback), `/api/shifts` sunucu tarafı çözümleme, arşiv SnapshotGrid saat fallback + "Özel" chip. Prod'da 83 satır onarıldı, 2 yayınlanmış hafta `/api/god/rescore` ile yeniden puanlandı (2026-07-05)
- cellMap key multi-dash ID split → `lastIndexOf("-")` düzeltildi
- Gece geçişi vardiyasında negatif puan → `+1440` düzeltmesi
- Portal auth race condition → `mounted` guard
- `/api/availability` güvenlik açığı → 403 ile izole
- Departmanlı lokasyonda eski `locations.demand_matrix` verisi motora "hayalet talep" olarak gidiyordu (departmanlar eklenmeden önceki artık veri) → departman satırı varsa flat matris artık `/api/generate`'den hiç gönderilmiyor (2026-07-03)
- `/api/generate`'deki departman sorgusu raw-SQL uyumluluk katmanında (`getDB()`) production'da sessizce hata verip boş dönüyordu → `/api/departments`'ın kullandığı Drizzle sorgusuna geçildi, hata artık loglanıyor (2026-07-03)
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
- **Adalet puanı:** `prev_score` türetilmiş bir ÖNBELLEKTİR — asla doğrudan `+=` yazılmaz. Tek yazar `web/lib/scoring.ts` (`rescoreWeek` / `recomputeLocationFairness`); formülün tek kaynağı `web/lib/fairness.ts`. Vardiya dışı puanlar `score_adjustments` olayı olarak yazılır (bkz. §3.H).
- **Fazla mesai:** `personnel.ytd_overtime_hours` da türetilmiş ÖNBELLEKTİR — tek yazar `web/lib/overtime.ts` (`recomputeYtdOvertime`: o yılın approved kayıtlarından, yıl devri otomatik). Hafta başına tek kayıt: `upsertPendingOvertime`; yayın anında `deriveOvertimeForWeek` otoritedir (yayınlanan saatler > motor taslağı); karara bağlanmış kayıtlar otomatik türetmeyle ezilmez.
- **Yeni tablo:** `schema.ts` → `types.ts` → `npx drizzle-kit push`.
- **Bileşenler:** `shadcn/ui`. Stil için `globals.css` CSS variable'ları. Inline Tailwind renk hardcode etme.
- **Demand matrix:** OR-Tools'a gönderilirken format: `{ [shiftDefId]: { [day: 0-6]: exactCount } }`. Motor `exact_coverage` constraint ile çalışır.

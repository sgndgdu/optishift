# Proje: OptiShift - Akıllı, Adil ve Entegre Vardiya Yönetimi (Mikro-SaaS)

## 1. Proje Özeti & Vizyonu
OptiShift; mağaza, restoran, cafe ve perakende sektöründeki işletmeler için geliştirilmiş, mobil öncelikli (mobile-first), hafif (lightweight) ve matematiksel optimizasyon destekli bir vardiya (shift) yönetim platformudur. Hantal kurumsal yazılımların aksine sıfır öğrenme eğrisi (zero-learning curve) sunar. 

**En Kritik İki Satış Vaadi (USP):**
1. **Adil Vardiya Puanı:** Çalışanlar arasında adil iş dağılımı sağlayarak personel sirkülasyonunu düşürmek.
2. **Kendi Kendine (Self-Service) Entegrasyon:** Kurumsal ERP ve İK sistemlerine (SAP, Logo vb.) üçüncü parti bir yazılımcıya ihtiyaç duymadan, dükkan müdürünün kendi kendine bağlanabilmesi.

---

## 2. Temel Teknolojik Mimari

### A. Optimizasyon Motoru (Core Engine)
- Maliyetleri, token sınırlarını ve halüsinasyon riskini sıfırlamak için takvim oluşturma sürecinde LLM kullanılmaz.
- Backend üzerinde **Python + Google OR-Tools** (Kısıtlamalı Matematiksel Optimizasyon) kütüphanesi koşar. Geleneksel algoritmalarla kurallar kontrol edilir, optimizasyon motoru ise milisaniyeler içinde en adil çözümü üretir.

### B. Entegrasyon Merkezinin Desteklediği Tüm Sistemler (No-Code Integration Hub):
  - **SAP ERP & SAP SuccessFactors (Enterprise Global):** Sistem, SAP'nin hem eski nesil (ECC 6.0, R/3) yapıları için RFC/BAPI bağlantılarını hem de modern bulut tabanlı (S/4HANA ve SuccessFactors) yapıları için REST API (OData) protokollerini destekleyecektir. SAP HR/HCM modülünden personel sicil kartları, unvanlar ve izinler çekilecek; üretilen vardiya puantajı doğrudan SAP sistemine geri basılacaktır.
  - **Nebim V3 (Perakende Sektör Devi):** Türkiye'deki büyük perakende zincirlerinin kullandığı Nebim V3'ün hazır REST API / Web Servis altyapısı üzerinden mağaza organizasyon ağacı ve çalışan listesi çift taraflı senkronize edilecektir.
  - **Logo Yazılım & Logo Netsis & Mikro ERP (KOBİ & Yerel Zincirler):** Genellikle On-Premise (lokal sunucu ve MSSQL) çalışan bu sistemler için güvenli veri tabanı tünelleri ve hazır n8n entegrasyon şablonları sunulacaktır.
  - **Luca & Orka (Muhasebe & Bordro Yazılımları):** Bulut tabanlı bu sistemler için API bağlantısının yanı sıra, dükkan müdürünün tek tıkla dosya yükleyebileceği alan eşleştirmeli (Smart Field Mapping) Excel/CSV transfer modu aktif olacaktır.

---

## 3. Detaylı Sistem Modülleri & İş Kuralları

### A. Personel Kategorizasyonu & Alan Yönetimi (Zonlama)
- **Bölgeler (Zones):** Mağaza müdürleri dinamik fiziksel alanlar tanımlayabilir (Örn: Kasa, Teras, Mutfak, Reyon).
- **Etiketler/Yetenekler (Skills):** Personel kartlarına birden fazla yetenek etiketlenebilir (Örn: #Kasa, #Barista).
- **Esnek Kontrol (Soft Constraint):** Takvimde sürükle-bırak yapılırken personelin o alana yeteneği yoksa sistem hafif bir ünlem uyarısı verir ama müdürün operasyonel esnekliğini engellemez.

### B. Shift Öncesi Müsaitlik Toplama
- Müdür tek tıkla personele "Haftalık Müsaitlik İsteği" gönderir.
- Personel mobil arayüzden günleri/saatleri 3 renkli boyar: 
  - **Yeşil:** Müsait
  - **Sarı:** Tercih Etmiyorum (Gerekirse gelebilirim)
  - **Kırmızı:** Kesinlikle Gelemem (Resmi İzin, Sınav, Okul vb.)
- Bu veriler Google OR-Tools motoruna doğrudan kısıt kuralı (constraint) olarak beslenir.

### C. Kural Motoru (Rule Engine - Aç/Kapat Toggle)
Müdürün vardiyayı oluşturmadan önce esnetebileceği veya katılaştırabileceği parametreler:
- **Haftalık Maksimum Saat Limiti:** Yasal sınır (Varsayılan: 45 saat). Aşılması durumunda fazla mesai uyarısı verilir.
- **Minimum Dinlenme Süresi:** İki vardiya arasında en az 11 saat olmalı (Gece kapanışa kalan personelin sabah açılışa yazılmasını kesinlikle engeller).
- **Günlük Alan Kotası:** "X alanında (Örn: Kasa) her gün en az N kişi bulunmalı" kuralı.
- **Bütçe/Mesai Limiti:** Haftalık toplam fazla mesai (overtime) bütçe sınırı.
- *Not:* Kurallar "Kritik" (Değiştirilemez) ve "Esnek" (Uyar ama izin ver) olarak ayrılır.

### D. Dinamik Mola (Break) Yönetimi
- **Mola Havuzu Mantığı:** Vardiya takvimine sabit mola saatleri yazılmaz. Çalışan işe gelip check-in yaptıktan sonra molaya çıkarken uygulamadan "Molaya Çık" butonuna basar ve süre saymaya başlar.
- **Mola Kotası:** Aynı alanda çalışan (örn: aynı anda iki kasiyer) personelin aynı anda molaya çıkması sistem tarafından otomatik engellenir ("Şu an Mehmet molada, onun dönmesini bekleyin" uyarısı). Müdür canlı panelden kimin aktif, kimin molada olduğunu görür.

### E. Adil Vardiya Puanı (Fairness Score) & Gamification
- Her vardiya tipinin zorluk puanı vardır:
  - Hafta içi sabah açılış: 3 puan
  - Hafta içi akşam kapatma (temizlik dahil): 5 puan
  - Cuma/Cumartesi yoğun saatler: 8 puan
  - Pazar akşam kapatma: 10 puan
  - Ekstra Zor Alan Bonusu (Örn: Teras yoğunluğu): +1 puan
- **Optimizasyon Hedefi:** Google OR-Tools, ay sonunda tüm personellerin toplam puanları arasındaki standart sapmayı minimumda tutarak adil dağıtım yapar.
- **Kriz Yönetimi (Rapor/Acil Durum):** Personel anlık gelememe bildirimi (rapor vb.) yaptığında shift "Açık Vardiya"ya düşer. Evinde otururken acil çağrıyı kabul edip dükkanı kurtaran personele 1.5x "Kahraman Bonusu" puanı verilir. Bu puan personelin ileride popüler günlerde izin kapmasını kolaylaştırır.

### F. Raporlama & Dışa Aktarma (Export)
- Oluşturulan vardiya tek tıkla profesyonel, formülleri hazır, iki sekmeden oluşan bir **Excel (.xlsx)** dosyası olarak indirilir.
  - **1. Sekme (Yönetici Özeti & KPI):** Bölge müdürü onayı için bütçe, yasal uyumluluk ve adil puan dağılım metriklerini barındırır.
  - **2. Sekme (Haftalık Vardiya Planı):** Personel isimleri, yetenekleri ve alan bazlı çalışma saatlerinin renkli matrisidir.

---

## 4. Sistem Veri Modeli Taslağı (JSON Mimarisi)

```json
{
  "store_metadata": {
    "store_id": "M-402",
    "store_name": "İzmir Merkez Mağazası",
    "connected_erp": "SAP_SuccessFactors",
    "erp_mapped_fields": {
      "employee_name": "Emp_Name",
      "employee_id": "Sicil_No"
    }
  },
  "personnel": [
    {
      "id": "P001",
      "name": "Ahmet Yılmaz",
      "skills": ["Kasa", "Reyon"],
      "monthly_fairness_score": 32,
      "availability": {
        "monday": "available",
        "tuesday": "preferred_not",
        "wednesday": "unavailable"
      }
    }
  ],
  "global_rules": {
    "max_weekly_hours": 45,
    "min_rest_hours": 11,
    "force_skills_match": false,
    "zone_quotas": {
      "Kasa": { "min_per_day": 2 }
    }
  }
}
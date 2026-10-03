# OptiShift Arayüz Kuralları

Renk, font ve küçük bileşenler (StatusPill, CountBadge, StatCard, PageHeader) Claude Design "OptiShift
Design System" kararlarından gelir. Bu belge onun üstüne **ekran düzeni ve yoğunluk** kurallarını ekler
(2026-10-03, kullanıcı: "amatör tasarım hataları, hiçbir sayfa kaçmasın"). Yeni ekran yazarken önce buraya bak.

## 1. Telefon önce
- Her ekran önce 390 px genişlikte tasarlanır, sonra masaüstüne genişler.
- Telefonda bir liste ekranında en az 7 kayıt görünür. Kişi, talep, ilan gibi tek bir kayıt 64 px'i geçmez.
- Dokunma alanı en az 40 px. Yatay kaydırma sadece tablo/plan ızgarasında.

## 2. Liste mi kart mı
- **Aynı türden kayıtlar** (kişiler, talepler, ilanlar, bildirimler, mesajlar, belgeler, kayıtlar)
  tek bir çerçeve içinde **satır listesi** olur: `components/ui/List` (`List`, `ListItem`).
  Her kayda ayrı kart, kart ızgarası YOK.
- **Kart** sadece birbirinden farklı bölümler için: özet kutuları, ayar grupları, tek başına duran bilgi.
- Satıra dokununca ayrıntı açılır: `components/ui/Sheet` (telefonda alttan, masaüstünde sağdan).
  Düzenleme, silme ve ikincil bilgiler satırda değil ayrıntıda durur.

## 3. Ölçüler
| Öğe | Ölçü |
|---|---|
| Sayfa başlığı | `PageHeader` (tek yer) |
| Bölüm başlığı | `text-base font-bold text-slate-900` |
| Satır başlığı | `text-sm font-semibold text-slate-900` |
| Yardımcı metin | `text-xs text-slate-500` |
| Avatar | listede 32 px, ayrıntı başlığında 40 px, gölgesiz, yuvarlak (`components/ui/Avatar`) |
| Çerçeve iç boşluğu | satır `px-4 py-3`, kart `p-4 sm:p-5` |
| Bölümler arası | `space-y-6` (`Page`) |

- `font-black` sadece sayfa başlığında. Büyük harfli, harf aralıklı küçük etiketler (UNVAN, E-POSTA)
  sadece tablo sütun başlığında; satırda ve ayrıntıda düz yazı.
- Kod yazısı (monospace) kullanıcıya gösterilmez. Kullanıcı adı gerekiyorsa normal yazı.

## 4. Bilgi
- Aynı bilgi bir ekranda iki kez yazılmaz (ör. rol etiketi + "Unvan: Personel").
- Satırda sadece karar verdiren bilgi: ad, unvan/departman, **en önemli tek durum** (bir StatusPill).
- Sayılar ve puanlar (Adalet Puanı vb.) listede gerekiyorsa sağda küçük, etiketsiz değil açıklamalı.

## 5. Eylemler
- Bir görünümde tek birincil düğme (`pageActionClass` ya da form gönderme).
- Yazısız ikon düğme yok; telefonda yazı + ikon. Zorunluysa `aria-label` ve `title`.
- Silme gibi geri alınamaz işlem satırda değil ayrıntıda, iki adımlı onayla.

## 6. Pencereler
- Yeni pencere `Sheet` ile: başlık + kapat, içerik, altta eylemler. Telefonda alttan açılır.
- Pencere içinde pencere yok.

## 7. Boş durum
- Tek cümle + tek eylem. Büyük ikon/illüstrasyon yok.

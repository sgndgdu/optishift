import type { LucideIcon } from "lucide-react";
import {
  Rocket, LayoutDashboard, CalendarClock, Users, ClipboardList, Megaphone,
  BarChart2, MessageSquare, Settings, Home, Clock, Inbox, UserCircle, UserCog,
} from "lucide-react";

/**
 * Kullanım kılavuzu (/kilavuz). Hesap türleri: Hesap sahibi / Sorumlu / Ekip üyesi (2026-10-05).
 * Anahtarlar eski bağlantılar (?role=) kırılmasın diye korunur: supervisor = hesap sahibi, manager = sorumlu, employee = ekip üyesi.
 */
export type RoleKey = "manager" | "employee" | "supervisor";

export type GuideSection = {
  id: string;
  title: string;
  icon: LucideIcon;
  paragraphs: string[];
  steps?: string[];
  tip?: string;
};

export type RoleGuide = {
  key: RoleKey;
  label: string;
  shortLabel: string;
  description: string;
  sections: GuideSection[];
};

export const ROLE_GUIDES: RoleGuide[] = [
  {
    key: "supervisor",
    label: "Hesap sahibi",
    shortLabel: "Hesap sahibi",
    description: "İşletmeyi açan, ekibi ve sorumluları ekleyen, ayarları belirleyen kişi.",
    sections: [
      {
        id: "sahip-baslarken",
        title: "Başlarken",
        icon: Rocket,
        paragraphs: [
          "Kayıt olduktan sonra işletme türünüzü seçersiniz (kafe, restoran, mağaza, fabrika gibi). İsterseniz mutfak, salon gibi bölümlerinizi de işaretlersiniz. Ardından türünüze uygun hazır vardiya saatleri gelir; değiştirebilir ya da olduğu gibi bırakabilirsiniz.",
          "Kurulum bitince Vardiya Planı açılır. Üstteki Hızlı Kurulum bölümü üç adımı sırayla gösterir: vardiyalar, ekip ve her vardiyaya kaç kişi gerektiği.",
        ],
        steps: [
          "Ekip sayfasından kişileri ekleyin (isim ve telefon yeter).",
          "Her kişiye giriş bağlantısını WhatsApp ile gönderin.",
          "Vardiya Planı'nda Planı Oluştur'a basın, kaç kişi gerektiğini girin.",
          "Planı kontrol edip yayınlayın; ekip telefonundan görür.",
        ],
      },
      {
        id: "sahip-ekip",
        title: "Ekip ve sorumlular",
        icon: Users,
        paragraphs: [
          "Ekip sayfasında herkes tek listede: en üstte siz, sonra sorumlular, sonra ekip. Bir kişiye dokununca kartı açılır; departmanı, çalışma saatleri ve izin bilgisi oradan değişir.",
          "Bölümleriniz (departmanlar) varsa her kişinin bir ana departmanı olmalı; departmanı olmayan kişi otomatik plana girmez. Birden çok bölümde çalışabilen kişiye kartından ek departman seçersiniz; otomatik plan bu kişiyi gerektiğinde o departmanlara da yazar. Listede kırmızı uyarı çıkar, \"Departmanlara dağıt\" ile hepsini tek ekranda atarsınız.",
          "Sorumlu ekle ile ekipten birine ya da yeni birine yetki verirsiniz. Neyi yönetecek (tüm işletme ya da tek bir departman) ve neleri yapabilecek (planı hazırlama, yayınlama, onaylar, ekip, plan ayarları, ücret) tek tek seçilir. Ekipten seçilen sorumlu vardiyada çalışmaya devam eder.",
        ],
      },
      {
        id: "sahip-plan",
        title: "Vardiya Planı",
        icon: CalendarClock,
        paragraphs: [
          "Planı Oluştur üç adımdan oluşur: kaç kişi gerektiğini girme, kontrol ve oluşturma. İlk seferde tablo öneriyle dolar; bir günü yazıp \"Boş günleri doldur\" ile tüm haftaya kopyalayabilirsiniz. Boş gün bırakırsanız o günlere herkes yazılır, sihirbaz bunu uyarır.",
          "Plan önce taslaktır; ekip görmez. Kontrol edip Yayınla'ya basınca herkese bildirim gider. Plan Kontrolü kartı eksik kişi, dinlenme süresi ve haftalık sınır gibi sorunları listeler; maddeye dokununca ilgili kutuya gider.",
          "Bir kutuya dokunarak elle vardiya ekler ya da değiştirirsiniz. Yayınlanmış bir vardiyaya dokununca \"Gelemiyor\" ile vardiyayı ilana çıkarıp yerine kişi bulabilirsiniz.",
        ],
      },
      {
        id: "sahip-onaylar",
        title: "Onaylar",
        icon: ClipboardList,
        paragraphs: [
          "İzin, vardiya değiştirme ve saat düzeltme talepleri burada toplanır. İzin kartı o günlerdeki vardiyaları gösterir: \"Onayla, ilana çevir\" vardiyayı ekibe duyurur, \"Onayla, sadece çıkar\" plandan siler.",
        ],
      },
      {
        id: "sahip-ayarlar",
        title: "Ayarlar",
        icon: Settings,
        paragraphs: [
          "Temel: işletme türü, departmanlar, çalışma saatleri ve vardiyalar. İşletme türünü sadece siz değiştirebilirsiniz; vardiyalarınız etkilenmez.",
          "Gelişmiş: haftalık çalışma sınırı, dinlenme, vardiya girişi, Adalet Puanı gibi kurallar. Çoğu işletme hiç değiştirmez.",
          "Özellikler: mesajlar, açık vardiyalar, fazla mesai takibi gibi isteğe bağlı özellikler. Kapalı özellik hiçbir ekranda görünmez. Sadece hesap sahibi açıp kapatır.",
        ],
      },
    ],
  },
  {
    key: "manager",
    label: "Sorumlu",
    shortLabel: "Sorumlu",
    description: "Planı ve ekibi hesap sahibi adına yöneten kişi.",
    sections: [
      {
        id: "sorumlu-baslarken",
        title: "Başlarken",
        icon: UserCog,
        paragraphs: [
          "Hesap sahibi size bir giriş bağlantısı gönderir; açıp şifrenizi belirlersiniz. Ne görebileceğiniz ve neler yapabileceğiniz size verilen yetkilere bağlıdır; yetkiniz olmayan sayfalar menüde görünmez.",
          "Bir departmanın sorumlusuysanız (örn. Salon sorumlusu) sadece o departmanın ekibini ve planını görürsünüz.",
        ],
      },
      {
        id: "sorumlu-ana",
        title: "Ana Sayfa",
        icon: LayoutDashboard,
        paragraphs: [
          "Ana Sayfa yapılacak işleri listeler: onay bekleyen talepler, hazırlanmamış ya da yayınlanmamış gelecek hafta, uygunluk girmeyenler, dolmamış açık vardiyalar. Her maddenin düğmesi sizi ilgili yere götürür.",
        ],
      },
      {
        id: "sorumlu-plan",
        title: "Vardiya Planı",
        icon: CalendarClock,
        paragraphs: [
          "Planı Oluştur ile haftanın planını hazırlarsınız. Yayınlama yetkiniz varsa planı siz yayınlarsınız; yoksa \"Onaya Gönder\" ile hesap sahibine ya da yetkili sorumluya gönderirsiniz.",
          "Departman sorumlusu sadece kendi departmanını planlar; diğer departmanların planı korunur.",
        ],
      },
      {
        id: "sorumlu-ekip",
        title: "Ekip ve onaylar",
        icon: Users,
        paragraphs: [
          "Ekip yetkiniz varsa kişi ekler, kartlarını düzenlersiniz. Onay yetkiniz varsa izin, vardiya değiştirme ve saat düzeltme taleplerini Onaylar'dan karara bağlarsınız.",
        ],
      },
      {
        id: "sorumlu-mesaj",
        title: "Mesajlar ve raporlar",
        icon: BarChart2,
        paragraphs: [
          "Mesajlar açıksa ekip sohbeti ve kişiye mesaj buradadır. Raporlar'da aylık çalışma saatleri, Adalet Puanı ve (açıksa) fazla mesai bulunur.",
        ],
      },
    ],
  },
  {
    key: "employee",
    label: "Ekip üyesi",
    shortLabel: "Ekip üyesi",
    description: "Vardiyalarınızı görmek, uygunluk girmek ve talep oluşturmak için.",
    sections: [
      {
        id: "ekip-baslarken",
        title: "Başlarken",
        icon: Rocket,
        paragraphs: [
          "İşyeriniz size bir giriş bağlantısı gönderir. Bağlantıyı açıp Google ile devam edersiniz ya da bir şifre belirlersiniz. Sonra telefonunuzdan giriş yaparsınız. Tarayıcının \"Ana Ekrana Ekle\" seçeneğiyle uygulamayı telefonunuzun ana ekranına ekleyebilirsiniz.",
        ],
      },
      {
        id: "ekip-ana",
        title: "Ana Sayfa",
        icon: Home,
        paragraphs: [
          "Ana Sayfa'da bugünkü vardiyanız, bu haftanın özeti ve son bildirimler görünür. Açık ilan varsa \"Açık Vardiyalar\" kısayolu çıkar.",
        ],
      },
      {
        id: "ekip-vardiyalar",
        title: "Vardiyalarım",
        icon: CalendarClock,
        paragraphs: [
          "Sadece yayınlanmış plan görünür; taslak plan size görünmez. Bir vardiyaya dokununca \"Gelemeyeceğim\", \"Biriyle değiştir\" ya da \"Saatte hata var\" seçeneklerini görürsün.",
        ],
      },
      {
        id: "ekip-uygunluk",
        title: "Uygunluk",
        icon: Clock,
        paragraphs: [
          "Başlangıçta bütün günler uygun olarak işaretlidir. Gelemeyeceğiniz günü \"Gelemem\", çalışmak istemediğiniz günü \"Tercih etmem\" olarak işaretleyip gönderirsiniz. \"Gelemem\" dediğiniz güne vardiya yazılmaz.",
        ],
      },
      {
        id: "ekip-talepler",
        title: "Talepler",
        icon: Inbox,
        paragraphs: [
          "İzin istemek, vardiyanıza gelemeyeceğinizi bildirmek, biriyle vardiya değiştirmek ya da saat hatası bildirmek için \"Yeni talep\"e dokunun. Gelemeyeceğiniz vardiya ekibe duyurulur. Biri alana kadar vardiya sizde kalır.",
          "Vardiya değiştirmede önce arkadaşınız kabul eder, sonra sorumlunuz onaylar. Kurallara uymayan bir vardiya değiştirme isteği (ör. dinlenme süresi yetmiyorsa) gönderilemez; nedeni ekranda yazar.",
        ],
      },
      {
        id: "ekip-acik",
        title: "Açık vardiyalar",
        icon: Megaphone,
        paragraphs: [
          "Boşalan bir vardiyayı alabilirsiniz. Vardiyayı alan kişi ek puan kazanır ve sonraki planlarda ona daha az vardiya verilir.",
        ],
      },
      {
        id: "ekip-mesaj",
        title: "Mesajlar ve hesabım",
        icon: MessageSquare,
        paragraphs: [
          "Mesajlar açıksa ekip sohbeti ve sorumlunuzla yazışma buradadır. Şifrenizi Hesabım sayfasından değiştirirsiniz. Gerçek bir acil durumda Ana Sayfa'nın en altındaki \"Acil durum bildir\" sorumlularınıza haber verir.",
        ],
      },
    ],
  },
];

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Adalet Puanı neyi ölçüyor?",
    answer:
      "Adalet Puanı, kişinin son haftalarda ne kadar ve ne kadar zor vardiyalarda çalıştığını ölçer. Hafta sonu ve çalışmak istemediğiniz günde çalışmak daha çok puan getirir. Puanı yüksek olana sonraki planlarda daha az vardiya verilir. Böylece zor vardiyalar hep aynı kişilere yazılmaz.",
  },
  {
    question: "Uygunluk girmek zorunlu mu?",
    answer:
      "Hayır. Sorumlunuz uygunluk toplamayı kapatabilir. Açıksa ve siz girmezseniz bütün günlerde uygun sayılırsınız. \"Gelemem\" dediğiniz güne ise vardiya yazılmaz.",
  },
  {
    question: "Vardiya değiştirme nasıl onaylanır?",
    answer:
      "Önce teklif ettiğiniz kişi kabul eder, sonra sorumlu onaylar. İkisi olmadan vardiya değişmez.",
  },
  {
    question: "Yayınlanmış bir vardiya sonradan değişebilir mi?",
    answer:
      "Evet, sorumlu gerektiğinde değiştirebilir. Değişiklik size bildirim olarak gelir ve Adalet Puanınıza birkaç puan eklenir.",
  },
  {
    question: "Bir vardiyaya gelemeyeceğimi anlarsam ne yapmalıyım?",
    answer:
      "Vardiyalarım'da vardiyaya dokunup \"Gelemeyeceğim\"i seçin. Vardiya ekibe duyurulur. Biri alınca vardiya sizden düşer ve size bildirim gelir.",
  },
  {
    question: "Departman eklediğimde neden kişiler plana girmiyor?",
    answer:
      "Departmanlı işletmede her kişinin bir departmanı olmalı. Ekip sayfasındaki uyarıdan \"Departmanlara dağıt\" ile herkesi tek ekranda atayın.",
  },
];

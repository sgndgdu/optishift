import type { LucideIcon } from "lucide-react";
import {
  Rocket, LayoutDashboard, CalendarClock, Users, ClipboardList, Megaphone,
  Star, Timer, BarChart2, MessageSquare, Settings, Home, Clock, Inbox,
  BellRing, UserCircle, ListChecks,
} from "lucide-react";

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
    key: "manager",
    label: "Müdür / Admin",
    shortLabel: "Müdür",
    description: "Vardiya oluşturma, personel yönetimi ve onaylarla ilgilenen kullanıcılar için.",
    sections: [
      {
        id: "mudur-baslarken",
        title: "Başlarken",
        icon: Rocket,
        paragraphs: [
          "Kayıt olduktan sonra kısa bir kurulum ekranı karşınıza çıkar. Önce sektörünüzü seçip en az bir şube adı girersiniz. İkinci adımda sektörünüze uygun hazır vardiya şablonları gelir (örneğin bir kafe için “Açılış” ve “Kapanış”); saatleri isterseniz değiştirebilir, isterseniz olduğu gibi bırakabilirsiniz.",
          "Departman eklemek zorunlu değildir. Tek şubeli, tek bölümlü bir işletmeyseniz bu adımı atlayabilirsiniz — kapasite planınız şube geneli için tek bir tablo olarak kalır. Birden fazla bölümünüz varsa (kasa, mutfak, teras gibi) bunları sonradan Ayarlar’dan da ekleyebilirsiniz.",
        ],
      },
      {
        id: "mudur-panel",
        title: "Panel",
        icon: LayoutDashboard,
        paragraphs: [
          "Panel, o günün canlı durumunu özetler: kaç kişinin gelmesi beklendiği, kaç kişinin check-in yaptığı, kaç kişinin molada olduğu ve kimin geç kaldığı.",
          "Planlanan saatten 30 dakika sonra hâlâ check-in yapmamış bir vardiya otomatik olarak “açık vardiya”ya düşer ve ekibinize haber gider. Bu davranışı istemiyorsanız Ayarlar’dan kapatıp işi elle yönetebilirsiniz.",
          "“Sıradaki Adım” kartı o an yapmanız gereken en öncelikli işi gösterir — personel eklenmemiş olabilir, gelecek haftanın planı yayınlanmamış olabilir ya da bekleyen bir izin talebiniz olabilir.",
        ],
      },
      {
        id: "mudur-vardiya-plani",
        title: "Vardiya Planı",
        icon: CalendarClock,
        paragraphs: [
          "Bu, işin kalbi olan sayfadır. Bir haftalık planı beş adımda oluşturursunuz:",
        ],
        steps: [
          "Kapasite Planı: Her gün, her vardiya için kaç kişiye ihtiyacınız olduğunu girin (“Pazartesi sabah: 2 kişi” gibi). Önceki haftanın rakamları öneri olarak otomatik gelir, siz sadece değişeni değiştirirsiniz.",
          "Müsaitlik toplama (opsiyonel): Personelinizden o haftanın müsaitliğini isterseniz tek tıkla “Müsaitlik İste” bildirimi gönderirsiniz. Bu adımı hiç kullanmak istemiyorsanız Ayarlar’dan tamamen kapatabilir, planlamayı kendiniz yaparsınız.",
          "Otomatik Oluştur: Girdiğiniz kapasite ihtiyacını, personelin müsaitliğini, yasal dinlenme kurallarını ve kimin son haftalarda daha çok/az çalıştığını (adalet puanı) birlikte gözeten bir taslak plan üretilir.",
          "Elle düzenleme: Herhangi bir hücreye tıklayıp değiştirebilirsiniz. Her hücrenin altında “kaç kişi atandı / kaç kişi gerekiyordu” sayacı canlı güncellenir — kırmızı eksik, yeşil tam, mavi fazla demektir.",
          "Yayınla: Hazır olduğunuzda “Yayınla”ya basarsınız. Sistem son bir kez kural ihlali tarar (11 saat dinlenmeyen biri var mı, haftalık limiti aşan biri var mı gibi) ve varsa size gösterir; siz yine de devam edip etmeyeceğinize karar verirsiniz. Yayınlanan plan o anda personelin telefonuna düşer.",
        ],
        tip: "İsterseniz yayınlamadan önce planı personele gönderip 48 saatlik bir inceleme süresi tanıyabilirsiniz. Bu adım tamamen isteğe bağlıdır, dilerseniz doğrudan yayınlayabilirsiniz.",
      },
      {
        id: "mudur-personel",
        title: "Personel & Hesaplar",
        icon: Users,
        paragraphs: [
          "Personel eklerken isim, telefon ve rol yeterlidir. Bir yönetici hesabı (müdür yardımcısı gibi) oluşturduğunuzda, o kişi siz ya da bir üst yönetici onaylayana kadar giriş yapamaz — bekleyen hesapları bu sayfadaki “Onay Bekleyen Hesaplar” bölümünde görüp onaylarsınız.",
          "Her personel kartında işe giriş tarihi, yıllık izin hakkı, saatlik ücret (fazla mesai hesaplaması için kullanılır) ve varsa gece vardiyası kısıtlaması (hamilelik, 18 yaş altı gibi durumlar için) bulunur.",
        ],
      },
      {
        id: "mudur-onaylar",
        title: "Onaylar",
        icon: ClipboardList,
        paragraphs: [
          "Personelden gelen tüm talepler dört sekmede toplanır: vardiya değişikliği talepleri, vardiya takası teklifleri, izin talepleri ve fazla mesai onayları.",
          "Talepleri tek tek ya da toplu şekilde onaylayabilir veya reddedebilirsiniz.",
        ],
      },
      {
        id: "mudur-acik-vardiyalar",
        title: "Açık Vardiyalar",
        icon: Megaphone,
        paragraphs: [
          "Bir personel gelemediğinde veya vardiyasını devredemediğinde, o vardiyayı “açık” ilan edebilirsiniz. Sistem o gün müsait ve uygun personeli sıralar (adalet puanı en düşük olan önce gelir); siz birini seçip atayabilir ya da personelin kendiliğinden üstlenmesini bekleyebilirsiniz.",
        ],
      },
      {
        id: "mudur-adalet-puani",
        title: "Adalet Puanı",
        icon: Star,
        paragraphs: [
          "Bu, OptiShift’in çekirdek fikridir: hafta sonu, gece ve tercih edilmeyen vardiyaların zamanla herkese dengeli dağılması için her vardiyanın bir “yükü” hesaplanır. Sürekli hafta sonu çalışan biri varsa sistem bunu fark eder ve bir sonraki planlamada dengelemeye çalışır.",
          "Bu sayfadan kimin ne kadar yüklü olduğunu ve son haftaların dökümünü görürsünüz. Personel de kendi puanını kendi hesabından görebilir, ama başkalarının puanını göremez.",
        ],
      },
      {
        id: "mudur-fazla-mesai",
        title: "Fazla Mesai",
        icon: Timer,
        paragraphs: [
          "Yayınlanan bir vardiya haftalık eşiği (örneğin 45 saat) aşarsa otomatik olarak fazla mesai kaydı oluşur. Siz onaylar ya da reddedersiniz; personel de kendi payına düşen fazla mesaiyi kabul edip ücretli mi yoksa serbest zaman olarak mı kullanmak istediğini kendisi seçer.",
          "Bu sayfada ayrıca aylık toplam fazla mesai maliyetini de görürsünüz (personelin saatlik ücretine göre hesaplanır).",
        ],
      },
      {
        id: "mudur-raporlar",
        title: "Raporlar",
        icon: BarChart2,
        paragraphs: [
          "Aylık özet raporlar ve puantaj (kimin ne zaman geldiği/gittiği, geç kalmalar, gelinmeyen günler) burada listelenir. Excel olarak dışa aktarabilirsiniz.",
        ],
      },
      {
        id: "mudur-mesajlasma",
        title: "Mesajlaşma",
        icon: MessageSquare,
        paragraphs: [
          "Ekibinizle doğrudan yazışabileceğiniz basit bir sohbet ekranıdır.",
        ],
      },
      {
        id: "mudur-ayarlar",
        title: "Ayarlar",
        icon: Settings,
        paragraphs: [
          "Ayarlar yedi bölüme ayrılır:",
        ],
        steps: [
          "Vardiyalar: çalışma saatleriniz ve vardiya tipleriniz. İstediğiniz kadar tanımlayabilirsiniz — “sabah/akşam” gibi sabit bir kalıp yoktur.",
          "Kurallar: haftalık azami çalışma saati, vardiyalar arası minimum dinlenme süresi, fazla mesai eşiği gibi kısıtlar.",
          "Personel Talepleri: müsaitlik toplamayı açma/kapama, hatırlatma zamanlaması, takas ve değişiklik izinleri.",
          "Adalet Puanı: ileri düzey çarpanlar. Çoğu işletme varsayılan ayarları hiç değiştirmeden kullanır.",
          "Departmanlar & Alanlar: birden fazla bölümünüz varsa (kasa, mutfak, teras gibi) burada tanımlarsınız.",
          "Ekipler & Rotasyon: vardiyalı çalışan üretim/fabrika işletmeleri için dönüşümlü ekip planı.",
          "Hesap: işletme bilgileriniz ve abonelik/fatura bilgileriniz.",
        ],
      },
    ],
  },
  {
    key: "employee",
    label: "Personel",
    shortLabel: "Personel",
    description: "Vardiyanızı görmek, müsaitlik girmek ve talep oluşturmak için.",
    sections: [
      {
        id: "personel-baslarken",
        title: "Başlarken",
        icon: Rocket,
        paragraphs: [
          "İşletmeniz size bir kullanıcı adı ve şifre tanımlar; bunlarla telefonunuzdan giriş yaparsınız. Uygulamayı tarayıcınızdan “Ana Ekrana Ekle” seçeneğiyle telefonunuza normal bir uygulama gibi de ekleyebilirsiniz.",
        ],
      },
      {
        id: "personel-ozet",
        title: "Özet (Ana Sayfa)",
        icon: Home,
        paragraphs: [
          "Sıradaki vardiyanızı, check-in/check-out butonunu, bu haftaki toplam çalışma saatinizi, adalet puanınızı ve son bildirimlerinizi burada görürsünüz.",
        ],
      },
      {
        id: "personel-vardiyalar",
        title: "Vardiyalar",
        icon: CalendarClock,
        paragraphs: [
          "Haftalık planınızı buradan görürsünüz. Sadece yayınlanmış (kesinleşmiş) vardiyalar görünür — müdürünüz henüz taslak aşamasındaki bir planı siz göremezsiniz, o yüzden telaşlanmanıza gerek yok.",
        ],
      },
      {
        id: "personel-musaitlik",
        title: "Müsaitlik",
        icon: Clock,
        paragraphs: [
          "İşletmeniz müsaitlik topluyorsa, haftalık takviminizi üç renkle işaretlersiniz:",
        ],
        steps: [
          "Yeşil — müsaitim.",
          "Sarı — tercih etmem ama gerekirse gelirim (isterseniz saat aralığı da belirtebilirsiniz, örn. “09:00–17:00 arası gelebilirim”).",
          "Kırmızı — kesinlikle gelemem (resmi izin, sınav vb.). Kırmızı işaretlediğiniz güne asla vardiya yazılmaz.",
        ],
      },
      {
        id: "personel-talepler",
        title: "Talepler",
        icon: Inbox,
        paragraphs: [
          "Bu sayfa dört bölümden oluşur:",
        ],
        steps: [
          "Vardiya Düzenleme: mevcut bir vardiyanızın saatinin değiştirilmesini istediğinizde kullanılır.",
          "Vardiya Takası: bir iş arkadaşınızla vardiya değiştirmek istediğinizde — önce karşı taraf teklifi kabul eder, ardından müdür onaylar.",
          "İzin: yıllık izin talebinizi, kalan izin gününüzle birlikte buradan oluşturursunuz.",
          "Gelen: size yapılan takas teklifleri ve onaylamanız/reddetmeniz gereken fazla mesai kayıtları burada görünür.",
        ],
      },
      {
        id: "personel-checkin",
        title: "Check-in / Check-out",
        icon: ListChecks,
        paragraphs: [
          "Vardiyanız başladığında ana sayfadaki karttan “Check-in” butonuna basarsınız, bittiğinde “Check-out”a. Müdürünüz kimin geldiğini, kimin molada olduğunu bu sayede anlık olarak görür.",
        ],
      },
      {
        id: "personel-sohbet",
        title: "Sohbet",
        icon: MessageSquare,
        paragraphs: [
          "Ekibinizle ve müdürünüzle doğrudan yazışabilirsiniz.",
        ],
      },
      {
        id: "personel-bildirimler",
        title: "Bildirimler",
        icon: BellRing,
        paragraphs: [
          "Yeni vardiya, talep onayı/reddi ve hatırlatma gibi bildirimleriniz burada listelenir.",
        ],
      },
      {
        id: "personel-hesabim",
        title: "Hesabım",
        icon: UserCircle,
        paragraphs: [
          "Profil bilgilerinizi görüp çıkış yapabileceğiniz sayfa. Adalet puanınızın son haftalara göre dökümünü de buradan takip edebilirsiniz — bu size neden bazı haftaların diğerlerinden daha yoğun geçtiğini gösterir.",
        ],
      },
    ],
  },
  {
    key: "supervisor",
    label: "Süpervizör / Patron",
    shortLabel: "Süpervizör",
    description: "Birden fazla şubeyi üst düzeyden takip eden kullanıcılar için.",
    sections: [
      {
        id: "supervisor-genel-bakis",
        title: "Genel Bakış",
        icon: LayoutDashboard,
        paragraphs: [
          "Bağlı olduğunuz tüm şubelerin özet kartlarını görürsünüz: kaç personel çalışıyor, o haftanın planı yayınlanmış mı, dikkat gerektiren bir uyarı var mı.",
        ],
      },
      {
        id: "supervisor-vardiya-plani",
        title: "Vardiya Planı",
        icon: CalendarClock,
        paragraphs: [
          "Herhangi bir şubenin planını görüntüleyebilirsiniz. Bu görünüm salt okunurdur — planı oluşturmak ve düzenlemek şube müdürünün işidir, siz sadece takip edersiniz.",
        ],
      },
      {
        id: "supervisor-personel",
        title: "Personel & Hesaplar",
        icon: Users,
        paragraphs: [
          "Organizasyon genelindeki tüm personel listesini buradan görürsünüz. Şube müdürlerinin oluşturduğu ama henüz onaylanmamış hesaplar varsa, onları da bu sayfadan onaylarsınız.",
        ],
      },
      {
        id: "supervisor-raporlar",
        title: "Raporlar",
        icon: BarChart2,
        paragraphs: [
          "Şubeler arası karşılaştırmalı raporlar burada: hangi şube planını geç yayınlıyor, hangi şubede kural ihlali daha sık gibi.",
        ],
      },
      {
        id: "supervisor-mesajlasma",
        title: "Mesajlaşma",
        icon: MessageSquare,
        paragraphs: [
          "Şube müdürleriyle doğrudan yazışabileceğiniz sohbet ekranı.",
        ],
      },
      {
        id: "supervisor-ayarlar",
        title: "Ayarlar",
        icon: Settings,
        paragraphs: [
          "Organizasyon genelinde geçerli olan ayarları buradan yönetirsiniz.",
        ],
      },
    ],
  },
];

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Adalet puanı tam olarak neyi ölçüyor?",
    answer:
      "Her vardiyanın zorluğunu (hafta sonu mu, gece mi, tercih edilmeyen bir gün mü) hesaba katan bir yük puanıdır. Kim son haftalarda daha çok yorucu vardiya almışsa, sistem bir sonraki planlamada onu gözetir ve dengelemeye çalışır. Amaç, sürekli aynı kişilerin hafta sonu ya da gece çalışmasını önlemektir.",
  },
  {
    question: "Müsaitlik girmek zorunlu mu?",
    answer:
      "Hayır. Müdürünüz isterse müsaitlik toplamayı tamamen kapatıp planı kendisi yapabilir. Açıksa, müsaitlik girmemeniz “tamamen müsaitim” olarak değerlendirilir; kırmızı işaretlediğiniz günlere ise kesinlikle vardiya yazılmaz.",
  },
  {
    question: "Vardiya takası nasıl onaylanır?",
    answer:
      "Önce takas teklif ettiğiniz kişi teklifi kabul eder, ardından müdür son onayı verir. Her iki onay da alınmadan takas geçerli olmaz.",
  },
  {
    question: "Fazla mesaiye itiraz edebilir miyim?",
    answer:
      "Fazla mesai kaydınızı kabul ederken ücretli mi yoksa serbest zaman olarak mı kullanmak istediğinizi siz seçersiniz. Kaydı reddederseniz müdürünüz durumu tekrar değerlendirir.",
  },
  {
    question: "Yayınlanmış bir vardiya sonradan değişebilir mi?",
    answer:
      "Evet, müdür gerektiğinde yayınlanmış bir vardiyayı değiştirebilir. Saatin değişmesi size bir bildirim olarak düşer ve adalet puanınıza bu beklenmedik değişiklik için küçük bir telafi eklenir.",
  },
  {
    question: "Bir vardiyaya gelemeyeceğimi anlarsam ne yapmalıyım?",
    answer:
      "Mümkünse önceden bir vardiya takası veya düzenleme talebi oluşturun. Son anda haber veremezseniz müdürünüz o vardiyayı “açık vardiya” ilan edip başka birine yönlendirebilir.",
  },
];

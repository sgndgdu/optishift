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
          "Giriş ekranında “Biyometrik ile Giriş Yap” seçeneğini görüyorsanız cihazınız Face ID/Touch ID/parmak izi destekliyor demektir. Önce kullanıcı adı-şifrenizle bir kez giriş yapıp bu cihazı etkinleştirdikten sonra bir daha şifre yazmadan girebilirsiniz.",
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
        id: "mudur-maliyet",
        title: "Canlı Maliyet Bütçesi",
        icon: Timer,
        paragraphs: [
          "Vardiya Planı sayfasının üst barında, personel kartlarına girdiğiniz saatlik ücrete göre hesaplanan “bu hafta planlanan işçilik maliyeti” çipini görürsünüz (örn. ₺172.520). Fazla mesai eşiğini aşan saatler otomatik ×1,5 ile hesaba katılır.",
          "Ayarlar → Kurallar → Fazla Mesai’den isteğe bağlı bir haftalık ₺ bütçe tavanı belirleyebilirsiniz. Plan bu tavanı aşarsa çip kırmızıya döner ve “Yayınla”ya basmadan önce bir uyarı daha görürsünüz — yine de yayınlamak size kalır.",
        ],
      },
      {
        id: "mudur-personel",
        title: "Personel & Hesaplar",
        icon: Users,
        paragraphs: [
          "Personel eklerken isim, telefon ve rol yeterlidir. Bir yönetici hesabı (müdür yardımcısı gibi) oluşturduğunuzda, o kişi siz ya da bir üst yönetici onaylayana kadar giriş yapamaz — bekleyen hesapları bu sayfadaki “Onay Bekleyen Hesaplar” bölümünde görüp onaylarsınız.",
          "Her personel kartında işe giriş tarihi, yıllık izin hakkı, saatlik ücret (fazla mesai ve maliyet hesaplaması için kullanılır) ve varsa gece vardiyası kısıtlaması (hamilelik, 18 yaş altı gibi durumlar için) bulunur. “Kıdemli Personel” kutucuğunu işaretlediğiniz kişiler, bir vardiyada en az bir kıdemli bulunmasını şart koştuğunuz kurallarda otomatik sayılır.",
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
          "Personel de kendi vardiyasını isteğe bağlı olarak “Herkese Aç (Pazar Yeri)” seçeneğiyle doğrudan bu listeye bırakabilir — belirli bir kişiye teklif etmek yerine, isteyen ilk kişi üstlenir ve size otomatik bildirim gider.",
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
          "Ay kapandığında “Dönemi Kilitle” butonuna basarsanız o ayın check-in/check-out kayıtları donar — geçmiş puantaj verisi kazara değişemez. Kilidi sadece admin veya süpervizör açabilir, müdür açamaz; bu, bordro hazırlığı sonrası veriyi korumak içindir.",
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
          "Kurallar: haftalık azami çalışma saati, vardiyalar arası minimum dinlenme süresi, fazla mesai eşiği ve haftalık işçilik maliyeti bütçesi gibi kısıtlar; “Sosyal Kurallar” bölümünden iki personelin hiçbir gün aynı vardiyaya birlikte yazılmamasını sağlayabilirsiniz (örn. anlaşmazlık yaşayan iki kişi); “QR ile Check-in” bölümünden şubenize asabileceğiniz bir QR kod üretebilir, isterseniz “GPS Doğrulamalı Check-in” ile personelin gerçekten şubede olup olmadığını da kontrol edebilirsiniz.",
          "Personel Talepleri: müsaitlik toplamayı açma/kapama, hatırlatma zamanlaması, takas ve değişiklik izinleri, izin politikası.",
          "Adalet Puanı: ileri düzey çarpanlar ve “Adalet Penceresi” — kümülatif puanın kaç haftalık geçmişi dikkate alacağı (varsayılan 8 hafta, isterseniz 90 güne/13 haftaya kadar uzatabilirsiniz). Çoğu işletme varsayılan ayarları hiç değiştirmeden kullanır.",
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
          "Telefonunuz Face ID/Touch ID/parmak izi destekliyorsa ana sayfadaki “Bu cihazda hızlı giriş” kartından bir kere etkinleştirdikten sonra, bir daha kullanıcı adı-şifre yazmadan biyometrik olarak giriş yapabilirsiniz.",
        ],
      },
      {
        id: "personel-ozet",
        title: "Özet (Ana Sayfa)",
        icon: Home,
        paragraphs: [
          "Sıradaki vardiyanızı, check-in/check-out butonunu, bu haftaki toplam çalışma saatinizi, adalet puanınızı ve son bildirimlerinizi burada görürsünüz.",
          "Gerçek bir acil durumda (kaza, sağlık sorunu vb.) sayfanın altındaki “Acil Durum Bildir” butonuyla şubenizdeki tüm yöneticilere anında bildirim gönderebilirsiniz. Bu buton sadece gerçek acil durumlar içindir, günlük mazeretler için kullanılmaz — onun için Talepler sayfasındaki izin/düzenleme akışı vardır.",
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
          "Vardiya Takası: bir iş arkadaşınızla vardiya değiştirmek istediğinizde — önce karşı taraf teklifi kabul eder, ardından müdür onaylar. Belirli birini seçmek istemiyorsanız “Herkese Aç (Pazar Yeri)” seçeneğiyle vardiyanızı tüm ekibe açık ilan olarak bırakabilirsiniz; isteyen ilk kişi üstlenir.",
          "İzin: yıllık izin dışında mazeret, hastalık/rapor, doğum, süt, evlilik ve ücretsiz izin türlerinden birini seçip talep oluşturursunuz; kalan yıllık izin gününüz üstte her zaman görünür.",
          "Gelen: size yapılan takas teklifleri ve onaylamanız/reddetmeniz gereken fazla mesai kayıtları burada görünür.",
        ],
      },
      {
        id: "personel-checkin",
        title: "Check-in / Check-out",
        icon: ListChecks,
        paragraphs: [
          "Vardiyanız başladığında ana sayfadaki karttan “Check-in” butonuna basarsınız, bittiğinde “Check-out”a. Müdürünüz kimin geldiğini, kimin molada olduğunu bu sayede anlık olarak görür.",
          "Şubenizde girişte bir QR kod asılıysa, telefon kameranızla okutmanız yeterli — vardiyanız varsa check-in otomatik yapılır, ayrıca uygulamayı açıp butona basmanıza gerek kalmaz. Bazı işletmelerde check-in sırasında konumunuz da şubeyle karşılaştırılır (GPS doğrulama); bu açıksa şubeden çok uzaktaysanız check-in reddedilir.",
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
  {
    question: "Vardiyamı belirli bir kişiye teklif etmeden bırakabilir miyim?",
    answer:
      "Evet. Talepler → Yeni Talep → Vardiya Takası akışında “Herkese Aç (Pazar Yeri)” seçeneğini kullanırsanız vardiyanız tüm ekibe açık bir ilan olarak düşer, isteyen ilk kişi üstlenir ve size bildirim gider.",
  },
  {
    question: "Biyometrik giriş güvenli mi, şifremin yerini mi alıyor?",
    answer:
      "Face ID/Touch ID/parmak izi bilgisi hiçbir zaman OptiShift sunucularına gitmez — sadece kendi cihazınızda kalır. Şifreniz silinmez, istediğiniz an yine kullanıcı adı-şifreyle de giriş yapabilirsiniz; biyometrik sadece ek bir hızlı giriş seçeneğidir.",
  },
];

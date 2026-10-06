// scripts/vid/publish.mjs üretir: telefon kayıtlarındaki adım başlıkları (t: saniye)
export const TOUR_CAPTIONS: Record<string, { t: number; text: string; n: number }[]> = {
  "approvals": [
    {
      "t": 0,
      "text": "Kurala uymayan isteği onaylamadan önce söyler",
      "n": 1
    },
    {
      "t": 9.3,
      "text": "İzinde ekibin durumu da yazar",
      "n": 2
    },
    {
      "t": 11.1,
      "text": "Tek dokunuşla onaylanır",
      "n": 3
    },
    {
      "t": 14.78,
      "text": "",
      "n": 0
    }
  ],
  "assistant": [
    {
      "t": 0,
      "text": "İşletmenizle ilgili her şeyi sorun",
      "n": 1
    },
    {
      "t": 6.28,
      "text": "Cevap planınızdan ve kayıtlarınızdan gelir",
      "n": 2
    },
    {
      "t": 10.45,
      "text": "",
      "n": 0
    }
  ],
  "cover": [
    {
      "t": 0,
      "text": "Biri gelemiyor mu? Vardiyasına dokunun",
      "n": 1
    },
    {
      "t": 4.68,
      "text": "En uygun yedekler gerekçesiyle sıralanır",
      "n": 2
    },
    {
      "t": 7.23,
      "text": "Tek tıkla atanır, kişiye bildirim gider",
      "n": 3
    },
    {
      "t": 10.22,
      "text": "",
      "n": 0
    }
  ],
  "mgr-autopilot": [
    {
      "t": 0,
      "text": "Gelecek haftanın planı kendiliğinden hazırlanır",
      "n": 1
    },
    {
      "t": 2.87,
      "text": "Hangi gün hazırlanacağını siz seçersiniz",
      "n": 2
    },
    {
      "t": 7.78,
      "text": "Siz sadece kontrol edip yayınlarsınız",
      "n": 3
    },
    {
      "t": 10.16,
      "text": "",
      "n": 0
    }
  ],
  "mgr-fairness": [
    {
      "t": 0,
      "text": "Kimin ne kadar zor vardiya aldığı görünür",
      "n": 1
    },
    {
      "t": 2.01,
      "text": "Yeni plan birikimi dengeler",
      "n": 2
    },
    {
      "t": 5.2,
      "text": "",
      "n": 0
    }
  ],
  "mgr-reports": [
    {
      "t": 0,
      "text": "Kim kaç saat çalıştı, hazır",
      "n": 1
    },
    {
      "t": 1.61,
      "text": "Puantaj ve Excel tek tıkla iner",
      "n": 2
    },
    {
      "t": 5.01,
      "text": "",
      "n": 0
    }
  ],
  "mgr-team": [
    {
      "t": 0,
      "text": "Ekibe kişi eklemek bir dakika",
      "n": 1
    },
    {
      "t": 3.99,
      "text": "Adı ve telefonu yeter",
      "n": 2
    },
    {
      "t": 11.35,
      "text": "Giriş bağlantısı WhatsApp ile gider",
      "n": 3
    },
    {
      "t": 15.63,
      "text": "",
      "n": 0
    }
  ],
  "phone": [
    {
      "t": 0,
      "text": "Plan yayınlanınca telefona bildirim gelir",
      "n": 1
    },
    {
      "t": 4.24,
      "text": "Vardiyalarını ve kiminle çalışacağını görür",
      "n": 2
    },
    {
      "t": 9.3,
      "text": "Gelemiyorsa tek dokunuşla haber verir",
      "n": 3
    },
    {
      "t": 12.89,
      "text": "",
      "n": 0
    }
  ],
  "plan": [
    {
      "t": 0,
      "text": "Ekip gelemeyeceği günleri telefondan girdi",
      "n": 1
    },
    {
      "t": 2.41,
      "text": "",
      "n": 0
    },
    {
      "t": 4.26,
      "text": "Kaç kişi gerektiği bir kez girilir",
      "n": 2
    },
    {
      "t": 6.99,
      "text": "Sorun varsa oluşturmadan önce söyler",
      "n": 3
    },
    {
      "t": 11.81,
      "text": "Plan saniyeler içinde hazır",
      "n": 4
    },
    {
      "t": 14.62,
      "text": "Yayınlandı, ekibe bildirim gitti",
      "n": 5
    },
    {
      "t": 18.2,
      "text": "",
      "n": 0
    }
  ],
  "team-availability": [
    {
      "t": 0,
      "text": "Ekip uygunluğunu telefondan girer",
      "n": 1
    },
    {
      "t": 2.4,
      "text": "Gelemeyeceği günü işaretler",
      "n": 2
    },
    {
      "t": 3.84,
      "text": "Tercih etmediği günü de",
      "n": 3
    },
    {
      "t": 5.42,
      "text": "Plan bu bilgilere göre kurulur",
      "n": 4
    },
    {
      "t": 8,
      "text": "",
      "n": 0
    }
  ],
  "team-chat": [
    {
      "t": 0,
      "text": "Ekip sohbeti uygulamanın içinde",
      "n": 1
    },
    {
      "t": 6.1,
      "text": "WhatsApp grubunda vardiya kovalamak yok",
      "n": 2
    },
    {
      "t": 7.9,
      "text": "",
      "n": 0
    }
  ],
  "team-leave": [
    {
      "t": 0,
      "text": "İzin isteği iki dokunuş",
      "n": 1
    },
    {
      "t": 3.94,
      "text": "Tarihi ve nedenini yazar",
      "n": 2
    },
    {
      "t": 9.52,
      "text": "Sorumluya anında düşer",
      "n": 3
    },
    {
      "t": 12.2,
      "text": "",
      "n": 0
    }
  ],
  "team-open": [
    {
      "t": 0,
      "text": "Boşta kalan vardiya ekibe duyurulur",
      "n": 1
    },
    {
      "t": 2.67,
      "text": "Uygun olan tek dokunuşla üstlenir",
      "n": 2
    },
    {
      "t": 7.53,
      "text": "Ek puanı adalet puanına yazılır",
      "n": 3
    },
    {
      "t": 8.93,
      "text": "",
      "n": 0
    }
  ],
  "team-swap": [
    {
      "t": 0,
      "text": "Vardiyasını arkadaşıyla değiştirmek ister",
      "n": 1
    },
    {
      "t": 7.05,
      "text": "Sadece kurallara uyan seçenekler çıkar",
      "n": 2
    },
    {
      "t": 13.44,
      "text": "Arkadaşı kabul edince sorumluya gider",
      "n": 3
    },
    {
      "t": 16.02,
      "text": "",
      "n": 0
    }
  ]
};

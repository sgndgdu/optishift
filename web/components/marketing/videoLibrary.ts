/**
 * Özellik videoları (/videolar): gerçek ekran kayıtları, scripts/vid/* ile vitrin işletmesinde çekilir.
 * desk: masaüstü kaydı var mı (yoksa her yerde telefon kaydı); dosyalar public/marketing/tour/<file>.mp4 ve <file>-m.mp4
 */
export type LibraryVideo = { file: string; title: string; text: string; desk: boolean };

export const LIBRARY: { group: string; intro: string; items: LibraryVideo[] }[] = [
  {
    group: "Planı yapan için",
    intro: "Sorumlunun ve işletme sahibinin ekranları.",
    items: [
      { file: "plan", desk: true, title: "Plan saniyeler içinde", text: "Ekibin uygunluğuna bakar, ihtiyacı karşılayan planı kurar. Kontrol edip tek tıkla yayınlarsınız." },
      { file: "cover", desk: true, title: "Biri gelemezse", text: "En uygun yedekleri gerekçesiyle sıralar. Tek tıkla atanır, kişiye bildirim gider." },
      { file: "approvals", desk: true, title: "Onaylar tek ekranda", text: "İzin ve vardiya değişikliği isteklerini kurallara göre kontrol eder." },
      { file: "assistant", desk: true, title: "İşletme Asistanı", text: "Sorunuzu yazın, cevabı planınızdan ve kayıtlarınızdan gelsin." },
      { file: "mgr-autopilot", desk: true, title: "Otomatik Pilot", text: "Gelecek haftanın planı seçtiğiniz gün kendiliğinden hazırlanır." },
      { file: "mgr-fairness", desk: true, title: "Adalet Puanı", text: "Zor vardiyaların kime düştüğü görünür, yeni plan birikimi dengeler." },
      { file: "mgr-team", desk: true, title: "Ekibe kişi ekleyin", text: "Adı ve telefonu yeter. Giriş bağlantısı WhatsApp ile gider." },
      { file: "mgr-reports", desk: true, title: "Raporlar ve puantaj", text: "Kim kaç saat çalıştı hazır. Puantaj ve Excel tek tıkla iner." },
    ],
  },
  {
    group: "Ekip için",
    intro: "Ekip üyeleri her şeyi telefonundan yapar.",
    items: [
      { file: "phone", desk: false, title: "Vardiyalar telefonda", text: "Yayınlanınca bildirim gelir. Kimle çalışacağı da yazar." },
      { file: "team-availability", desk: false, title: "Uygunluk girme", text: "Gelemeyeceği ve tercih etmediği günleri işaretler." },
      { file: "team-swap", desk: false, title: "Vardiya değiştirme", text: "Sadece kurallara uyan seçenekler çıkar, arkadaşı kabul edince sorumluya gider." },
      { file: "team-leave", desk: false, title: "İzin isteme", text: "Tarihi ve nedeni yazar, sorumluya anında düşer." },
      { file: "team-open", desk: false, title: "Açık vardiya üstlenme", text: "Boşta kalan vardiyayı uygun olan tek dokunuşla alır." },
      { file: "team-chat", desk: false, title: "Ekip sohbeti", text: "Vardiya konuşmaları uygulamanın içinde, WhatsApp grubunda kaybolmaz." },
    ],
  },
];

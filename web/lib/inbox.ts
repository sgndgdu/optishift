/**
 * Ana Sayfa "Bekleyen İşler" listesi — saf fonksiyon, test edilebilir.
 *
 * Müdür giriş yaptığında tablo yerine yapması gereken işleri görür: her madde
 * tek cümle + tek aksiyon. Girdiler sadece mevcut API'lerden türetilir
 * (dashboard/page.tsx toplar); yeni endpoint gerekmez. Liste boşsa ekran
 * "Her şey yolunda" der.
 *
 * Sektör seçilmişse (lib/templates) aynı aciliyetteki maddeler sektörün en büyük
 * derdine göre sıralanır ve başlıklar sektörün diliyle yazılır ("boş nöbet" gibi).
 */

import type { IndustryNudges } from "@/lib/templates/types";
import { localizeCopy, priorityIndex } from "@/lib/templates/nudges";

export type InboxSeverity = "critical" | "today" | "week";

export type InboxAction =
  | { label: string; href: string }
  | { label: string; kind: "remind-availability" | "expand" };

export type InboxItem = {
  id: string;
  severity: InboxSeverity;
  title: string;
  detail?: string;
  action: InboxAction;
};

export type NextWeekState = "none" | "draft" | "published";

export type InboxInput = {
  now: Date;
  personnelCount: number;
  /** Bugün vardiyası başlamış, eşik süre geçmiş ve hâlâ girişi olmayan (ilana otomatik çevrilmeyen) kişi sayısı. */
  lateCount: number;
  nextWeek: NextWeekState;
  /** false: yayın yetkisi yok (ör. departman şefi), plan yayınlanmaz, müdüre onaya gönderilir. Varsayılan true. */
  canPublish?: boolean;
  pendingApprovals: number;
  pendingAccounts: number;
  /** Hesabı açılmış ama davet bağlantısıyla şifresini hiç belirlememiş (uygulamaya hiç girmemiş) kişi sayısı. */
  notJoined?: number;
  /** Departman sorumlusu: hesap sahibi departmanın planını da oluşturdu (okunmamış bildirim) */
  deptPlan?: { title: string; detail: string; href?: string } | null;
  /** Gelecek hafta planını onaya gönderen departmanlar ("Salon (Ayşe Demir)"); taslak maddesi bunu söyler. */
  submittedDepts?: string[];
  /** Müdüre gelen okunmamış mesaj sayısı (Mesajlaşma modülü kapalıysa verilmez). */
  unreadMessages?: number;
  availability: { enabled: boolean; missing: number };
  /** Dolmamış ilanlar (vardiyası hâlâ sahibinde olan devir ilanları hariç). soon: bugün/yarın olan var mı,
   *  nearest: en yakının okunur etiketi ("6 Ekim Salı, 15:00"). */
  openShifts: { enabled: boolean; count: number; soon?: boolean; nearest?: string | null };
  overtime: { enabled: boolean; nearLimit: number };
  fatigue: { enabled: boolean; critical: number; warning: number };
  handover: { enabled: boolean; unread: number };
  tasks: { enabled: boolean; total: number; done: number };
  /** Belge ve Sertifika Takibi: süresi dolmuş / 30 gün içinde dolacak belge sayısı (kişi bazında tekil). */
  certifications?: { enabled: boolean; expired: number; expiring: number };
  /** Şubenin sektörü seçiliyse dil ve öncelik. */
  nudges?: IndustryNudges | null;
  /** false: şubede işletme türü seçilmemiş (belge kalkanı, sektör dili ve önerilen kurallar çalışmıyor). */
  industrySelected?: boolean;
  /** Otomatik pilot (lib/autopilotRules): drafted = gelecek haftanın taslağını otomatik pilot hazırladı;
   *  upcoming = henüz hazırlamadı ama bu hafta hazırlayacak (gün gelmedi, ihtiyaç tablosu dolu). */
  autopilot?: { drafted: boolean; upcoming: boolean; when: string }; // when: "Perşembe 08:00"
};

const ORDER: Record<InboxSeverity, number> = { critical: 0, today: 1, week: 2 };

/** Cuma, Cumartesi, Pazar: gelecek haftanın planı artık acil. */
export function isLateInWeek(now: Date): boolean {
  return [5, 6, 0].includes(now.getDay());
}

export function buildInbox(input: InboxInput): InboxItem[] {
  if (input.personnelCount === 0) {
    return [{
      id: "add-personnel",
      severity: "today",
      title: "Ekibinizi ekleyin",
      detail: "Plan yapabilmek için önce ekibi ekleyin, sadece isim yeterli.",
      action: { label: "Ekibi Ekle", href: "/personnel?add=1" },
    }];
  }

  const items: InboxItem[] = [];

  if (input.lateCount > 0) {
    items.push({
      id: "late",
      severity: "critical",
      title: `${input.lateCount} kişi vardiyasına gelmedi`,
      detail: "Vardiya başladı, giriş kaydı yok.",
      action: { label: "Gör", href: "#bugun" },
    });
  }

  const { fatigue } = input;
  if (fatigue.enabled && fatigue.critical + fatigue.warning > 0) {
    const parts = [
      fatigue.critical > 0 ? `${fatigue.critical} kritik` : "",
      fatigue.warning > 0 ? `${fatigue.warning} uyarı` : "",
    ].filter(Boolean).join(", ");
    items.push({
      id: "fatigue",
      severity: fatigue.critical > 0 ? "critical" : "week",
      title: `Yorgunluk uyarısı: ${parts}`,
      detail: "Üst üste gece çalışan, kapanıştan sonra açılışa yazılan ya da çok fazla mesai yapan kişiler var.",
      action: { label: "Kimler?", kind: "expand" },
    });
  }

  if (input.pendingApprovals > 0) {
    items.push({
      id: "approvals",
      severity: "today",
      title: `${input.pendingApprovals} talep onayınızı bekliyor`,
      action: { label: "İncele", href: "/requests" },
    });
  }

  if (input.pendingAccounts > 0) {
    items.push({
      id: "accounts",
      severity: "today",
      title: `${input.pendingAccounts} yeni hesap onay bekliyor`,
      action: { label: "İncele", href: "/personnel" },
    });
  }

  if (input.deptPlan) {
    items.push({
      id: "dept-plan",
      severity: "today",
      title: input.deptPlan.title,
      detail: input.deptPlan.detail,
      action: { label: "Planı Gör", href: input.deptPlan.href || "/schedule?week=next" },
    });
  }

  if ((input.notJoined ?? 0) > 0) {
    items.push({
      id: "not-joined",
      severity: "today",
      title: `${input.notJoined} kişi henüz uygulamaya girmedi`,
      detail: "Giriş bağlantılarını gönderin. Bağlantıyı almayan kişi vardiyalarını göremez.",
      action: { label: "Bağlantıları Gönder", href: "/personnel?notJoined=1" },
    });
  }

  if ((input.unreadMessages ?? 0) > 0) {
    items.push({
      id: "messages",
      severity: "today",
      title: `${input.unreadMessages} okunmamış mesaj`,
      action: { label: "Oku", href: "/chat" },
    });
  }

  if (input.handover.enabled && input.handover.unread > 0) {
    items.push({
      id: "handover",
      severity: "today",
      title: `${input.handover.unread} devir-teslim notu henüz teslim alınmadı`,
      action: { label: "Notlar", href: "/handovers" },
    });
  }

  const { tasks } = input;
  if (tasks.enabled && tasks.total > 0 && tasks.done < tasks.total) {
    items.push({
      id: "tasks",
      severity: "today",
      title: `Bugünkü görevlerin ${tasks.done}/${tasks.total} kadarı tamamlandı`,
      action: { label: "Gör", href: "/schedule?week=this" },
    });
  }

  if (input.openShifts.enabled && input.openShifts.count > 0) {
    items.push({
      id: "open-shifts",
      severity: input.openShifts.soon === false ? "week" : "today",
      title: `${input.openShifts.count} açık vardiya henüz dolmadı`,
      action: { label: "Plana bak", href: "/schedule?week=this" },
    });
  }

  if (input.nextWeek !== "published") {
    const urgent = isLateInWeek(input.now);
    const ap = input.autopilot;
    const pub = input.canPublish !== false;
    items.push(input.nextWeek === "none"
      ? (ap?.upcoming
        ? {
            id: "next-week",
            severity: "week",
            title: `Gelecek haftanın planı ${ap.when}'de otomatik hazırlanacak`,
            detail: pub ? "Siz kontrol edip yayınlarsınız. İsterseniz planı şimdi de oluşturabilirsiniz." : "Siz kontrol edip onaya gönderirsiniz. İsterseniz planı şimdi de oluşturabilirsiniz.",
            action: { label: "Planı Oluştur", href: "/schedule?week=next&wizard=1" },
          }
        : {
          id: "next-week",
          severity: urgent ? "critical" : "week",
          title: "Gelecek haftanın planı henüz hazır değil",
          detail: pub ? "Planı erken yayınlarsanız ekip de kendi haftasını önceden planlayabilir." : "Hazırlayıp onaya gönderin, sorumlu yayınlar.",
          action: { label: "Planı Oluştur", href: "/schedule?week=next&wizard=1" },
        })
      : ap?.drafted
      ? {
          id: "next-week",
          severity: urgent ? "critical" : "today",
          title: "Gelecek haftanın planı otomatik hazırlandı",
          detail: pub ? "Kontrol edin, uygunsa yayınlayın. Ekip yayınlanınca görür." : "Kontrol edin, uygunsa onaya gönderin. Sorumlu yayınlayınca ekip görür.",
          action: { label: pub ? "İncele ve Yayınla" : "İncele ve Onaya Gönder", href: "/schedule?week=next" },
        }
      : pub && (input.submittedDepts?.length ?? 0) > 0
      ? {
          id: "next-week",
          severity: urgent ? "critical" : "today",
          title: `Onaya gönderilen plan: ${input.submittedDepts!.join(", ")}`,
          detail: "Gelecek haftanın planını kontrol edin, uygunsa yayınlayın. Ekip yayınlanınca görür.",
          action: { label: "İncele ve Yayınla", href: "/schedule?week=next" },
        }
      : {
          id: "next-week",
          severity: urgent ? "critical" : "week",
          title: "Gelecek haftanın planı taslakta",
          detail: pub ? "Ekip yayınlanana kadar vardiyalarını göremez." : "Hazırsa onaya gönderin. Sorumlu yayınlayana kadar ekip göremez.",
          action: { label: pub ? "Gözden Geçir ve Yayınla" : "Gözden Geçir ve Onaya Gönder", href: "/schedule?week=next" },
        });

    if (input.availability.enabled && input.availability.missing > 0) {
      items.push({
        id: "availability",
        severity: "week",
        title: `${input.availability.missing} kişi gelecek hafta için uygunluk girmedi`,
        detail: "Uygunluk girmeyen kişiler otomatik planda bütün günlerde uygun sayılır.",
        action: { label: "Hatırlat", kind: "remind-availability" },
      });
    }
  }

  const cert = input.certifications;
  if (cert?.enabled && cert.expired > 0) {
    items.push({
      id: "certifications",
      severity: "critical",
      title: `${cert.expired} kişinin belgesinin süresi doldu`,
      detail: "Bu kişiler, belgeyi gerektiren görevlere otomatik planda yazılmaz.",
      action: { label: "Ekibe Git", href: "/personnel" },
    });
  } else if (cert?.enabled && cert.expiring > 0) {
    items.push({
      id: "certifications",
      severity: "week",
      title: `${cert.expiring} kişinin belgesi 30 gün içinde doluyor`,
      detail: "Yenilenmezse ilgili role atanamazlar.",
      action: { label: "Ekibe Git", href: "/personnel" },
    });
  }

  if (input.overtime.enabled && input.overtime.nearLimit > 0) {
    items.push({
      id: "overtime",
      severity: "week",
      title: `${input.overtime.nearLimit} kişi yıllık fazla mesai sınırına yaklaştı`,
      action: { label: "Gör", href: "/overtime#warnings" },
    });
  }

  if (input.industrySelected === false) {
    items.push({
      id: "industry",
      severity: "week",
      title: "İşletme türünüzü seçin",
      detail: "Görev listesi, belge kontrolü ve öneriler seçtiğiniz işletme türüne göre hazırlanır.",
      action: { label: "Seç", href: "/settings" },
    });
  }

  // Sektör dili: sayı içeren maddelerde başlık/açıklama sektöre özel kalıpla yazılır
  const counts: Record<string, number> = {
    late: input.lateCount, approvals: input.pendingApprovals, accounts: input.pendingAccounts,
    handover: input.handover.unread, "open-shifts": input.openShifts.count,
    availability: input.availability.missing, overtime: input.overtime.nearLimit,
  };
  const localized = input.nudges
    ? items.map(it =>
        // Sektör kalıbı "plan hazır değil" durumunu anlatır; taslak durumunun kendi metni korunur
        it.id === "next-week" && (input.nextWeek === "draft" || input.autopilot?.upcoming)
          ? it
          : { ...it, ...localizeCopy(input.nudges, it.id, counts[it.id] ?? 0, { title: it.title, detail: it.detail }) })
    : items;

  // Açık vardiyanın tarihi sektör metninin önüne yazılır (hangi gün boş, müdür bilsin)
  if (input.openShifts.nearest) {
    for (const it of localized) {
      if (it.id !== "open-shifts") continue;
      it.detail = `En yakını ${input.openShifts.nearest}.${it.detail ? ` ${it.detail}` : ""}`;
    }
  }

  // Önce aciliyet, aynı aciliyette sektör önceliği; eşitse ekleme sırası (sort kararlıdır)
  return localized.sort((a, b) =>
    ORDER[a.severity] - ORDER[b.severity] || priorityIndex(input.nudges, a.id) - priorityIndex(input.nudges, b.id));
}

/** Saate göre selamlama. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Günaydın";
  if (h >= 12 && h < 18) return "İyi günler";
  return "İyi akşamlar";
}

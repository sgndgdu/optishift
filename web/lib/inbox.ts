/**
 * Ana Sayfa "Bekleyen İşler" listesi — saf fonksiyon, test edilebilir.
 *
 * Müdür giriş yaptığında tablo yerine yapması gereken işleri görür: her madde
 * tek cümle + tek aksiyon. Girdiler sadece mevcut API'lerden türetilir
 * (dashboard/page.tsx toplar); yeni endpoint gerekmez. Liste boşsa ekran
 * "Her şey yolunda" der.
 */

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
  pendingApprovals: number;
  pendingAccounts: number;
  availability: { enabled: boolean; missing: number };
  openShifts: { enabled: boolean; count: number };
  overtime: { enabled: boolean; nearLimit: number };
  fatigue: { enabled: boolean; critical: number; warning: number };
  handover: { enabled: boolean; unread: number };
  tasks: { enabled: boolean; total: number; done: number };
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
      detail: "Plan yapabilmek için önce personel ekleyin, sadece isim yeterli.",
      action: { label: "Personel Ekle", href: "/personnel" },
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
      title: `Kaza Risk Radarı: ${parts}`,
      detail: "Üst üste gece, kapanıştan açılışa ya da yüksek mesai.",
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
      action: { label: "Gör", href: "/schedule" },
    });
  }

  if (input.openShifts.enabled && input.openShifts.count > 0) {
    items.push({
      id: "open-shifts",
      severity: "today",
      title: `${input.openShifts.count} açık vardiya henüz dolmadı`,
      action: { label: "Aday Bul", href: "/open-shifts" },
    });
  }

  if (input.nextWeek !== "published") {
    const urgent = isLateInWeek(input.now);
    items.push(input.nextWeek === "none"
      ? {
          id: "next-week",
          severity: urgent ? "critical" : "week",
          title: "Gelecek haftanın planı henüz hazır değil",
          detail: "Personel plan yapabilsin diye erken yayınlayın.",
          action: { label: "Planı Oluştur", href: "/schedule?week=next" },
        }
      : {
          id: "next-week",
          severity: urgent ? "critical" : "week",
          title: "Gelecek haftanın planı taslakta",
          detail: "Personel yayınlanana kadar vardiyalarını göremez.",
          action: { label: "Gözden Geçir ve Yayınla", href: "/schedule?week=next" },
        });

    if (input.availability.enabled && input.availability.missing > 0) {
      items.push({
        id: "availability",
        severity: "week",
        title: `${input.availability.missing} kişi gelecek hafta için uygunluk girmedi`,
        detail: "Girmeyenler otomatik planlamada tamamen uygun sayılır.",
        action: { label: "Hatırlat", kind: "remind-availability" },
      });
    }
  }

  if (input.overtime.enabled && input.overtime.nearLimit > 0) {
    items.push({
      id: "overtime",
      severity: "week",
      title: `${input.overtime.nearLimit} kişi yıllık fazla mesai sınırına yaklaştı`,
      action: { label: "Gör", href: "/overtime#warnings" },
    });
  }

  // Aynı öncelikte ekleme sırası korunur (Array.prototype.sort kararlıdır)
  return items.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** Saate göre selamlama. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Günaydın";
  if (h >= 12 && h < 18) return "İyi günler";
  return "İyi akşamlar";
}

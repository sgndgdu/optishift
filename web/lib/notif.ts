export function getNotifHref(notif: { type?: string; link?: string | null }): string | null {
  // Bildirimin kendi bağlantısı varsa o (örn. /requests)
  if (notif.link && notif.link.startsWith("/portal")) return notif.link;
  switch (notif.type) {
    case "schedule":      return "/portal/calendar";
    case "leave_approved":
    case "leave_rejected":
    case "trade_request": return "/portal/requests";
    case "open_shift":    return "/portal/open-shifts";
    case "availability":  return "/portal/availability";
    default:              return null;
  }
}

export function getNotifHref(notif: { type?: string }): string | null {
  switch (notif.type) {
    case "schedule":      return "/portal/calendar";
    case "leave_approved":
    case "leave_rejected":
    case "trade_request":
    case "open_shift":    return "/portal/requests";
    case "availability":  return "/portal/availability";
    default:              return null;
  }
}

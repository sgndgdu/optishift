import type { Availability, PersonnelStatus, EmploymentType, LeaveType } from "@/lib/types";

export const ZONE_COLORS: Record<string, { chip: string; dot: string }> = {
  Kasa:   { chip: "bg-indigo-100 text-indigo-700",  dot: "bg-indigo-400"  },
  Reyon:  { chip: "bg-green-100 text-green-700",    dot: "bg-green-400"   },
  Teras:  { chip: "bg-orange-100 text-orange-700",  dot: "bg-orange-400"  },
  Mutfak: { chip: "bg-pink-100 text-pink-700",      dot: "bg-pink-400"    },
};
export const ZONE_DEFAULT = { chip: "bg-slate-100 text-slate-700", dot: "bg-slate-400" };

export const STATUS_CFG: Record<PersonnelStatus, { label: string; cls: string }> = {
  active:   { label: "Aktif",  cls: "bg-green-100 text-green-700"   },
  on_leave: { label: "İzinde", cls: "bg-yellow-100 text-yellow-700" },
  inactive: { label: "Pasif",  cls: "bg-slate-100 text-slate-500"   },
};

export const EMP_LABELS: Record<EmploymentType, string> = {
  full_time: "Tam Zamanlı",
  part_time: "Yarı Zamanlı",
  intern:    "Stajyer",
};

export const AVAIL_CYCLE: Availability[] = ["available", "preferred_not", "unavailable"];

export const AVAIL_CELL: Record<Availability, { bg: string; icon: string }> = {
  available:     { bg: "bg-green-500 hover:bg-green-600",   icon: "✓" },
  preferred_not: { bg: "bg-yellow-400 hover:bg-yellow-500", icon: "~" },
  unavailable:   { bg: "bg-red-500 hover:bg-red-600",       icon: "✕" },
};

export const AVAIL_SHORT: Record<Availability, string> = {
  available:     "Müsait",
  preferred_not: "Tercihen",
  unavailable:   "İzinli",
};

export const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: "Yıllık İzin",
  sick:   "Hastalık İzni",
  excuse: "Mazeret İzni",
};

export const LEAVE_COLORS: Record<LeaveType, string> = {
  annual: "bg-indigo-100 text-indigo-700",
  sick:   "bg-red-100 text-red-600",
  excuse: "bg-yellow-100 text-yellow-700",
};

export const TITLE_SUGGESTIONS = [
  "Kasiyer", "Kasa Sorumlusu", "Barista", "Garson", "Reyon Görevlisi",
  "Mutfak Görevlisi", "Teras Görevlisi", "Mağaza Şefi", "Stajyer",
];

export const TABS: { id: "general" | "skills" | "availability" | "leave" | "performance"; label: string }[] = [
  { id: "general",      label: "Genel" },
  { id: "skills",       label: "Yetenekler" },
  { id: "availability", label: "Müsaitlik" },
  { id: "leave",        label: "İzin" },
  { id: "performance",  label: "Performans" },
];

export function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function calcLeaveEntitlement(hireDateStr: string): number {
  if (!hireDateStr) return 14;
  const years = (Date.now() - new Date(hireDateStr).getTime()) / (365.25 * 86400 * 1000);
  if (years < 1) return 0;
  if (years < 5) return 14;
  if (years < 15) return 20;
  return 26;
}

export function tenureStr(hireDateStr: string): string {
  if (!hireDateStr) return "";
  const ms = Date.now() - new Date(hireDateStr).getTime();
  const years = Math.floor(ms / (365.25 * 86400 * 1000));
  const months = Math.floor((ms % (365.25 * 86400 * 1000)) / (30.44 * 86400 * 1000));
  if (years === 0) return `${months} ay`;
  return months > 0 ? `${years} yıl ${months} ay` : `${years} yıl`;
}

export function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
}

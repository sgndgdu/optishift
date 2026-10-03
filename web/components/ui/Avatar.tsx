import { cn } from "@/lib/utils";

/** Kişi avatarı (DESIGN.md §3): listede sm (32 px), ayrıntı başlığında md (40 px). Gölgesiz, yuvarlak, baş harfler. */
export function Avatar({ name, size = "sm", tone = "neutral", className }: {
  name: string; size?: "sm" | "md"; tone?: "neutral" | "brand"; className?: string;
}) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toLocaleUpperCase("tr");
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none",
        size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm",
        tone === "brand" ? "bg-forest-100 text-forest-700" : "bg-slate-100 text-slate-600",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

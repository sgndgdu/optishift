import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// shadcn Badge, StatusPill ile aynı ölçü ve renk anlamına bağlı (components/ui/StatusPill)
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default:     "bg-forest-50 text-forest-700 border-forest-100",
        secondary:   "bg-slate-50 text-slate-600 border-slate-100",
        destructive: "bg-red-50 text-red-600 border-red-100",
        outline:     "bg-white text-slate-600 border-slate-200",
        success:     "bg-emerald-50 text-emerald-700 border-emerald-100",
        warning:     "bg-amber-50 text-amber-700 border-amber-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Giriş/kayıt/şifre sayfalarının ortak logosu: formun üstünde ortada (tek kaynak). Uygulamadaki renkli logo ile aynı. */
export function AuthLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center justify-center gap-2 mb-8 text-lg font-bold text-slate-900 hover:text-forest-600 transition-colors", className)}>
      <Logo size="sm" />
      {BRAND.name}
    </Link>
  );
}

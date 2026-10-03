import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

/** Giriş/kayıt/şifre sayfalarının ortak logosu: formun üstünde ortada (tek kaynak). */
export function AuthLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center justify-center gap-2 mb-8 text-lg font-bold text-slate-900 hover:text-forest-600 transition-colors", className)}>
      <LogoMark size="md" />
      OptiShift
    </Link>
  );
}

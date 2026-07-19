"use client";

import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

/** Kapalı özellik sayfalarının (lib/features.ts) URL ile doğrudan ziyaretinde gösterilir. */
export default function FeatureDisabled({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 min-h-[60vh]">
      <div className="max-w-md w-full bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center">
          <Lock size={20} className="text-slate-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-500 mb-6">
          Bu özellik şu an kullanıma açık değil. Yakında burada olacak.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft size={16} /> Dashboard&apos;a dön
        </Link>
      </div>
    </div>
  );
}

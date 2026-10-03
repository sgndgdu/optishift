"use client";

import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/PageHeader";

/** Kapalı özellik sayfalarının (lib/features.ts) URL ile doğrudan ziyaretinde gösterilir. */
export default function FeatureDisabled({ title }: { title: string }) {
  return (
    <Page width="narrow">
      <PageHeader title={title} />
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center">
          <Lock size={20} className="text-slate-400" />
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Bu özellik şu an kullanıma açık değil. Yakında burada olacak.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft size={16} /> Ana Sayfa&apos;ya dön
        </Link>
      </div>
    </Page>
  );
}

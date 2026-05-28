import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OptiShift – Vardiya Yönetimi",
  description: "Akıllı, Adil ve Entegre Vardiya Yönetimi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";
import SessionGuard from "@/components/SessionGuard";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Pazarlama/auth yüzeylerindeki başlıklar için — yoğun veri ekranlarında (dashboard,
// tablolar) okunabilirlik amacıyla bilinçli olarak kullanılmıyor, Inter kalıyor.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["500", "600", "700", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "OptiShift – Vardiya Yönetimi",
  description: "Akıllı, Adil ve Entegre Vardiya Yönetimi",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OptiShift",
  },
};

export const viewport: Viewport = {
  themeColor: "#14453D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${fraunces.variable} h-full`}>
      <head>
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        {children}
        <PWARegister />
        <SessionGuard />
      </body>
    </html>
  );
}

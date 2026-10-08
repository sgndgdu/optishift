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

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://web-nine-drab-19.vercel.app";
const DESCRIPTION = "Vardiya planını otomatik hazırlayan ve vardiyaları ekibe eşit dağıtan uygulama";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "OptiShift · Vardiya Yönetimi",
  description: DESCRIPTION,
  manifest: "/manifest.json",
  // Bağlantı paylaşılınca (WhatsApp, LinkedIn, X) görünen başlık ve görsel
  openGraph: {
    type: "website", locale: "tr_TR", siteName: "OptiShift",
    title: "OptiShift · Vardiya planınız saniyeler içinde hazır", description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "OptiShift vardiya planı" }],
  },
  twitter: { card: "summary_large_image", title: "OptiShift · Vardiya Yönetimi", description: DESCRIPTION, images: ["/og.png"] },
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

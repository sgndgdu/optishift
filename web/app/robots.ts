import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://web-nine-drab-19.vercel.app";

// Arama motorları sadece tanıtım sayfalarını tarar; panel, portal ve API kapalı
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/supervisor", "/portal", "/dashboard", "/schedule", "/personnel",
      "/settings", "/requests", "/reports", "/chat", "/onboarding", "/setup", "/self-signup", "/kiosk", "/reset-password", "/auth/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

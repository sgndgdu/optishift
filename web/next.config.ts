import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Neon serverless sürücüsü için gerekli: Node.js runtime kullan
  // (edge runtime WebSocket gerektirir; Node.js HTTP driverında gerekmez)
  serverExternalPackages: ["@neondatabase/serverless"],

  experimental: {
    // Vercel'de dynamic imports için gerekebilir
  },

  // Güvenlik başlıkları: başka sitenin çerçevesinde açılmasın (tıklama tuzağı), tür tahmini kapalı,
  // adres başka siteye tam gitmesin. Kamera (fotoğraftan kurulum) ve konum (giriş doğrulama) sadece bu sitede.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
      ],
    }];
  },
};

export default nextConfig;

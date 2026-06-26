import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Neon serverless sürücüsü için gerekli: Node.js runtime kullan
  // (edge runtime WebSocket gerektirir; Node.js HTTP driverında gerekmez)
  serverExternalPackages: ["@neondatabase/serverless"],

  experimental: {
    // Vercel'de dynamic imports için gerekebilir
  },
};

export default nextConfig;

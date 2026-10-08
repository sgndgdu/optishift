import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://web-nine-drab-19.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/ozellikler", "/pricing", "/kilavuz", "/register", "/login", "/gizlilik", "/kullanim-sartlari"]
    .map(p => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.6 }));
}

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Sayfa standardı koruması (components/ui/PageHeader): panel sayfaları başlığı elle
 * yazmaz, genişliği/dış dolguyu kendisi vermez, sayfa kartı tek köşe ölçüsünü kullanır.
 * Yeni bir sayfa bu kuralları bozarsa test kırılır.
 */
const ROOT = join(__dirname, "..", "..");
const PANEL_DIRS = ["app/(app)", "app/supervisor", "app/(portal)", "components"];
// Kendi tam ekran tasarımı olan akışlar ve başlık bileşenleri
const EXEMPT = [
  "app/(app)/onboarding/", "app/(portal)/portal/login/", "app/(portal)/layout.tsx",
  "components/ui/PageHeader.tsx", "components/LegalShell.tsx", "components/guide/", "components/Sidebar.tsx",
  "components/PublicHeader.tsx",
];

function files(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap(name => {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) return files(relative(ROOT, p));
    return p.endsWith(".tsx") ? [relative(ROOT, p)] : [];
  });
}

const all = PANEL_DIRS.flatMap(files).filter(f => !EXEMPT.some(e => f.startsWith(e)));
const pages = all.filter(f => f.endsWith("page.tsx"));

describe("sayfa standardı", () => {
  it("başlık sadece PageHeader ile çizilir (elle <h1> yok)", () => {
    const bad = all.filter(f => /<h1[\s>]/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(bad).toEqual([]);
  });

  it("sayfalar genişliği ve dış dolguyu kendisi vermez (layout + Page verir)", () => {
    const bad = pages.filter(f => /className="[^"]*\bp-4 md:p-8\b[^"]*\bmx-auto\b|className="[^"]*\bmx-auto\b[^"]*\bp-4 md:p-8\b|className="[^"]*\bmin-h-screen bg-slate-50\b/
      .test(readFileSync(join(ROOT, f), "utf8")));
    expect(bad).toEqual([]);
  });

  it("sayfa kartı rounded-2xl; rounded-3xl sadece açılır pencerede", () => {
    const bad = all.filter(f => readFileSync(join(ROOT, f), "utf8").split("\n").some(line =>
      /\bbg-white\b/.test(line) && /\brounded-3xl\b/.test(line) && !/shadow-2xl/.test(line)));
    expect(bad).toEqual([]);
  });
});

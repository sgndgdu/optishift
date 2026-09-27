import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { GLOSSARY } from "@/lib/copy";

// Müdür/amir paneli + personel portalı + ortak bileşenler. God Mode (app/admin)
// iç ekip içindir, API route'ları ayrıca taranmaz (hata mesajları elle düzeltildi).
const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["app/(app)", "app/(portal)", "app/supervisor", "app/kiosk", "components", "lib/templates"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(tsx|ts)$/.test(name) ? [p] : [];
  });
}

/**
 * Kullanıcıya görünen metinler: JSX metni + boşluk ya da Türkçe harf içeren string/template
 * parçaları. className, import yolu ve tek kelimelik anahtarlar (örn. "checkin") elenir.
 */
function visibleStrings(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "className") return;
    if (ts.isJsxText(node)) out.push(node.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (/\s|[ÇĞİÖŞÜçğıöşü]/.test(node.text)) out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.filter(s => /[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(s));
}

describe("arayüz sözlüğü", () => {
  const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));
  const corpus = files.map(f => ({ f: path.relative(ROOT, f), strings: visibleStrings(f, readFileSync(f, "utf8")) }));

  for (const { avoid, use } of GLOSSARY) {
    it(`"${avoid}" yerine "${use}" kullanılıyor`, () => {
      // Kelime başında eşleş (örn. "slot" → "slots" yakalanır ama "Translot" yakalanmaz)
      const re = new RegExp(`(^|[^A-Za-zÇĞİÖŞÜçğıöşü])${avoid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      const hits = corpus.flatMap(({ f, strings }) => strings.filter(s => re.test(s)).map(s => `${f}: ${s.trim().slice(0, 120)}`));
      expect(hits).toEqual([]);
    });
  }
});

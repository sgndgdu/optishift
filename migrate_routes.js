#!/usr/bin/env node
/**
 * OptiShift: better-sqlite3 → @neondatabase/serverless migration script
 *
 * Her API route dosyasında:
 *  1. `import Database from "better-sqlite3"` satırını kaldır
 *  2. `const DB_PATH = ...` satırını kaldır
 *  3. `const db = new Database(...)` → `const db = getDB()`
 *  4. `const db2 = new Database(...)` → `const db2 = getDB()`
 *  5. `db.close()` / `db2.close()` satırlarını kaldır
 *  6. `getDB` import'u ekle
 *  7. `db.prepare(...).[all|get|run](...)` çağrılarına `await` ekle
 *  8. messages/route.ts'teki `getDb()` helper'ını temizle
 */

const fs = require("fs");
const path = require("path");

const API_DIR = path.join(__dirname, "web/app/api");

// Tüm route.ts dosyalarını bul
function findRoutes(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRoutes(full));
    } else if (entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

// notifications.ts da dahil et
const EXTRA_FILES = [
  path.join(__dirname, "web/lib/notifications.ts"),
];

function migrate(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const originalContent = content;

  // 1. better-sqlite3 import kaldır
  content = content.replace(/^import Database from "better-sqlite3";\n/m, "");

  // 2. DB_PATH kaldır
  content = content.replace(
    /^const DB_PATH = path\.join\(process\.cwd\(\),\s*["']optishift\.db["']\);\n/m,
    ""
  );

  // 3. new Database(...) → getDB()
  // Pattern: const db = new Database(DB_PATH);
  content = content.replace(
    /const (db2?) = new Database\([^)]*\);/g,
    "const $1 = getDB();"
  );

  // 4. db.close() / db2.close() kaldır
  content = content.replace(/^\s*db\.close\(\);\n/gm, "");
  content = content.replace(/^\s*db2\.close\(\);\n/gm, "");

  // 5. messages/route.ts'teki özel getDb() helper'ını temizle
  // Bu fonksiyon CREATE TABLE yapar; artık gerek yok
  content = content.replace(
    /function getDb\(\) \{[\s\S]*?return db;\n\}\n\n/m,
    ""
  );
  // getDb() çağrısını db = getDB() olarak değiştir
  content = content.replace(/const db = getDb\(\);/g, "const db = getDB();");

  // 6. db.pragma(...) satırlarını kaldır (SQLite'a özel)
  content = content.replace(/^\s*db\.pragma\([^)]*\);\n/gm, "");
  // db.exec(...) blokları (CREATE TABLE IF NOT EXISTS) kaldır
  content = content.replace(/^\s*db\.exec\(`[\s\S]*?`\);\n/gm, "");

  // 7. await ekle: db.prepare(...).all/get/run(...)
  //    Hem tek satır hem çok satırlı pattern'ı yakala
  //    Pattern: (= )(db2?.prepare()) veya satır başında (  db2?.prepare())

  // Atama olduğunda: = db.prepare(...)
  content = content.replace(
    /(\s*=\s*)(db2?\.prepare\()/g,
    "$1await $2"
  );

  // Satır başında standalone: [whitespace]db.prepare(
  content = content.replace(
    /^(\s+)(db2?\.prepare\()/gm,
    "$1await $2"
  );

  // 8. import { getDB } from "@/lib/db/client" ekle (eğer yoksa ve DB kullanılıyorsa)
  if (
    content.includes("getDB()") &&
    !content.includes('from "@/lib/db/client"')
  ) {
    // İlk import satırından önce veya sonra ekle
    const firstImportIndex = content.indexOf("import ");
    if (firstImportIndex !== -1) {
      content =
        content.slice(0, firstImportIndex) +
        'import { getDB } from "@/lib/db/client";\n' +
        content.slice(firstImportIndex);
    }
  }

  // 9. notifications.ts için: import path kaldır (artık gerekmiyorsa)
  // Sadece notifications.ts'te path artık kullanılmıyor
  if (filePath.includes("notifications.ts")) {
    if (!content.includes("path.") || content.match(/path\./g)?.length === 0) {
      content = content.replace(/^import path from "path";\n/m, "");
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`  [UPDATED] ${path.relative(__dirname, filePath)}`);
  } else {
    console.log(`  [SKIP]    ${path.relative(__dirname, filePath)}`);
  }
}

const routes = findRoutes(API_DIR);
const allFiles = [...routes, ...EXTRA_FILES];

console.log(`\nMigrating ${allFiles.length} files...\n`);
for (const file of allFiles) {
  try {
    migrate(file);
  } catch (err) {
    console.error(`  [ERROR]   ${path.relative(__dirname, file)}: ${err.message}`);
  }
}
console.log("\nDone.\n");

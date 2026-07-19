/**
 * Raw SQL uyumluluk katmanı.
 * better-sqlite3'ün senkron .prepare().all/get/run() API'sini
 * async Neon HTTP sürücüsünün üzerine koyar.
 *
 * Değişiklikler:
 *  - ? yer tutucuları → $1, $2, … (PostgreSQL sözdizimi)
 *  - INSERT OR IGNORE → INSERT … ON CONFLICT DO NOTHING
 *  - INSERT … RETURNING id: .run() otomatik ekler; lastInsertRowid döner
 */

import { neon } from "@neondatabase/serverless";

// Neon HTTP sürücüsü — her istek için yeni bağlantıya gerek yok
let _sql: ReturnType<typeof neon> | null = null;
function getSql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

/** SQLite ? → PostgreSQL $1, $2, … dönüşümü */
function toPg(query: string): string {
  let n = 0;
  return query
    .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
    .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO")
    .replace(/\?/g, () => `$${++n}`);
}

class AsyncStatement {
  private pgSql: string;

  constructor(sql: string) {
    this.pgSql = toPg(sql);
  }

  /** Tüm satırları döndür (SELECT için) */
  async all(...params: unknown[]): Promise<unknown[]> {
    const flat = params.flat() as unknown[];
    const result = await getSql()(this.pgSql, flat);
    return result as unknown[];
  }

  /** Tek satır döndür, yoksa undefined */
  async get(...params: unknown[]): Promise<unknown | undefined> {
    const flat = params.flat() as unknown[];
    const result = (await getSql()(this.pgSql, flat)) as unknown[];
    return result[0];
  }

  /**
   * Değişiklik sorgusu çalıştır (INSERT / UPDATE / DELETE).
   * INSERT sorgularına otomatik RETURNING * ekler; id kolonu varsa lastInsertRowid döner.
   * (RETURNING id kullanılamaz: password_reset_tokens gibi id kolonu olmayan
   * tablolarda 42703 "column id does not exist" ile INSERT'i patlatıyordu.)
   */
  async run(...params: unknown[]): Promise<{ lastInsertRowid?: number; changes: number }> {
    const flat = params.flat() as unknown[];
    let query = this.pgSql;

    const isInsert = /^\s*INSERT\s+/i.test(query);
    if (isInsert && !/RETURNING/i.test(query)) {
      query = query.trimEnd().replace(/;?\s*$/, "") + " RETURNING *";
    }

    const result = (await getSql()(query, flat)) as Array<{ id?: number }>;
    return {
      lastInsertRowid: result[0]?.id,
      changes: result.length,
    };
  }
}

/** better-sqlite3 Database nesnesini taklit eden nesne */
function createCompatDB() {
  return {
    prepare: (sql: string) => new AsyncStatement(sql),
    // Gerçek bağlantı yoktur; noop
    close: () => undefined,
  };
}

/**
 * Route dosyalarında `new Database(DB_PATH)` yerine kullanılır:
 *
 * ```ts
 * const db = getDB();
 * const rows = await db.prepare("SELECT …").all(param1, param2);
 * const row  = await db.prepare("SELECT …").get(param1);
 * const res  = await db.prepare("INSERT …").run(param1, param2);
 * // db.close() gerekmez
 * ```
 */
export function getDB() {
  return createCompatDB();
}

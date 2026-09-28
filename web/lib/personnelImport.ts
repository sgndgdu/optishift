/**
 * Excel/CSV ile toplu personel aktarımı: çözümleme ve doğrulama (saf; hem istemci önizlemesi
 * hem sunucu aynı kuralı kullanır). Sütunlar: İsim (zorunlu), Departman, Yetenek, Telefon,
 * E-posta (isteğe bağlı). Başlık satırı Türkçe/İngilizce eş anlamlılarla tanınır; başlık
 * yoksa sütun sırası bu kabul edilir.
 */

export const IMPORT_COLUMNS = ["İsim", "Departman", "Yetenek", "Telefon", "E-posta"] as const;
export const MAX_IMPORT_ROWS = 500;

export interface ImportRow {
  line: number;       // dosyadaki satır (1'den, başlık dahil)
  name: string;
  department: string;
  skills: string[];
  phone: string;
  email: string;
}

export type RowStatus = "ok" | "skip";
export interface CheckedRow extends ImportRow {
  status: RowStatus;
  /** atlanma nedeni ya da uyarı */
  notes: string[];
  departmentId: string | null;
}

type Field = "name" | "department" | "skills" | "phone" | "email";
const HEADER_ALIASES: Record<Field, string[]> = {
  name: ["isim", "ad soyad", "adsoyad", "ad", "ad-soyad", "personel", "name", "full name"],
  department: ["departman", "bölüm", "bolum", "birim", "department"],
  skills: ["yetenek", "yetenekler", "rol", "roller", "beceri", "beceriler", "skill", "skills", "role"],
  phone: ["telefon", "tel", "gsm", "cep", "cep telefonu", "phone", "mobile"],
  email: ["e-posta", "eposta", "email", "e-mail", "mail"],
};

const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[*()]/g, "").replace(/\s+/g, " ").trim();

/** CSV/TSV metnini hücrelere böler; ; , ya da sekme ayırıcısını ilk satırdan tahmin eder, tırnakları anlar. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = clean.split("\n", 1)[0] ?? "";
  const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0 };
  for (const ch of first) if (ch in counts) counts[ch]++;
  const sep = counts["\t"] > 0 ? "\t" : counts[";"] >= counts[","] && counts[";"] > 0 ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ""));
}

/** Hücre tablosunu satırlara çevirir (başlık tanıma + sütun eşleme). */
export function rowsFromTable(table: string[][]): ImportRow[] {
  if (!table.length) return [];
  const header = table[0].map(norm);
  const colOf: Partial<Record<Field, number>> = {};
  (Object.keys(HEADER_ALIASES) as Field[]).forEach(f => {
    const idx = header.findIndex(h => HEADER_ALIASES[f].includes(h));
    if (idx >= 0) colOf[f] = idx;
  });
  const hasHeader = colOf.name !== undefined;
  const order: Field[] = ["name", "department", "skills", "phone", "email"];
  const col = (f: Field) => (hasHeader ? colOf[f] : order.indexOf(f));
  const body = hasHeader ? table.slice(1) : table;
  const start = hasHeader ? 2 : 1;
  return body.map((r, i) => {
    const get = (f: Field) => { const c = col(f); return c === undefined || c < 0 ? "" : String(r[c] ?? "").trim(); };
    return {
      line: start + i,
      name: get("name").replace(/\s+/g, " "),
      department: get("department"),
      skills: [...new Set(get("skills").split(/[,;/|]/).map(s => s.trim()).filter(Boolean))],
      phone: get("phone").replace(/[^\d+]/g, ""),
      email: get("email").toLowerCase(),
    };
  }).filter(r => r.name || r.phone || r.email || r.department || r.skills.length);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Satırları doğrular. Atlanır: isimsiz, geçersiz e-posta, dosyada tekrar, şubede aynı isim+telefonla kayıtlı.
 * Uyarı: departman şubede yok (createDepartments değilse departmansız eklenir).
 */
export function checkRows(
  rows: ImportRow[],
  ctx: { departments: { id: string; name: string }[]; existing: { name: string; phone: string | null }[]; createDepartments?: boolean },
): CheckedRow[] {
  const deptByName = new Map(ctx.departments.map(d => [norm(d.name), d.id]));
  const existingKeys = new Set(ctx.existing.map(e => `${norm(e.name)}|${(e.phone ?? "").replace(/[^\d]/g, "").slice(-10)}`));
  const seen = new Set<string>();
  return rows.slice(0, MAX_IMPORT_ROWS).map(r => {
    const notes: string[] = [];
    let status: RowStatus = "ok";
    const key = `${norm(r.name)}|${r.phone.replace(/[^\d]/g, "").slice(-10)}`;
    if (r.name.length < 2) { status = "skip"; notes.push("İsim yok"); }
    else if (r.email && !EMAIL_RE.test(r.email)) { status = "skip"; notes.push("E-posta geçersiz"); }
    else if (seen.has(key)) { status = "skip"; notes.push("Dosyada tekrar ediyor"); }
    else if (existingKeys.has(key)) { status = "skip"; notes.push("Bu şubede zaten kayıtlı"); }
    seen.add(key);
    let departmentId: string | null = null;
    if (r.department) {
      departmentId = deptByName.get(norm(r.department)) ?? null;
      if (!departmentId && !ctx.createDepartments) notes.push(`"${r.department}" departmanı şubede yok, departmansız eklenir`);
    }
    if (r.phone && r.phone.replace(/[^\d]/g, "").length < 10) notes.push("Telefon kısa görünüyor");
    return { ...r, status, notes, departmentId };
  });
}

/** Dosyada geçen ama şubede olmayan departman adları (tekil, ilk yazıldığı biçimde). */
export function unknownDepartments(rows: ImportRow[], departments: { name: string }[]): string[] {
  const known = new Set(departments.map(d => norm(d.name)));
  const out = new Map<string, string>();
  for (const r of rows) if (r.department && !known.has(norm(r.department)) && !out.has(norm(r.department))) out.set(norm(r.department), r.department);
  return [...out.values()];
}

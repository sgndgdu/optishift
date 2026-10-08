/* eslint-disable @typescript-eslint/no-explicit-any */
// İşletmeler arası kimlik kontrolü (proxy): istekte (adres ya da JSON gövde) geçen her şube ve departman kimliği
// oturumdaki işletmeye ait olmalı. Uç noktaların çoğu kayıtları auth.org_id ile yazar ama şube kimliğini gövdeden alır;
// başka işletmenin şube kimliği yazılırsa kayıt o şubenin listelerinde görünüyordu (tam test 2026-10-08).
// Tek yerde, bütün uçlar için. İşletmenin şube/departman listesi kısa süre bellekte tutulur, bilinmeyen kimlikte
// liste bir kez tazelenir (yeni açılan şube hemen tanınır).
import { getDB } from "./db/client";

const LOCATION_KEYS = new Set(["location_id", "locationId", "primary_location_id", "location_ids", "assigned_location_ids",
  "managed_location_ids", "scope_location_ids", "target_location_id", "shift_location_id"]);
const DEPARTMENT_KEYS = new Set(["department_id", "department_ids", "extra_department_ids", "assigned_department_ids",
  "only_department_id", "only_department_ids", "parent_id"]);

type Scope = { locations: Set<string>; departments: Set<string>; at: number };
const cache = new Map<string, Scope>();
const TTL_MS = 60_000;

async function loadScope(orgId: string): Promise<Scope> {
  const db = getDB();
  const locs = await db.prepare(`SELECT id FROM locations WHERE org_id = ?`).all(orgId) as { id: string }[];
  const depts = await db.prepare(
    `SELECT d.id FROM departments d JOIN locations l ON l.id = d.location_id WHERE l.org_id = ?`
  ).all(orgId) as { id: string }[];
  const s = { locations: new Set(locs.map(r => String(r.id))), departments: new Set(depts.map(r => String(r.id))), at: Date.now() };
  cache.set(orgId, s);
  return s;
}

function push(out: Set<string>, v: unknown) {
  if (typeof v === "string" && v.trim() && v !== "undefined" && v !== "null") out.add(v.trim());
  else if (typeof v === "number") out.add(String(v));
  else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" || typeof x === "number") push(out, x);
}

/** Gövdedeki kimlikleri toplar (iç içe nesne ve dizilerde 3 kata kadar; resim gibi büyük alanlara girmez). */
export function collectScopedIds(body: unknown, locs: Set<string>, depts: Set<string>, depth = 0) {
  if (!body || typeof body !== "object" || depth > 3) return;
  if (Array.isArray(body)) { for (const x of body.slice(0, 500)) collectScopedIds(x, locs, depts, depth + 1); return; }
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (LOCATION_KEYS.has(k)) push(locs, v);
    else if (DEPARTMENT_KEYS.has(k)) push(depts, v);
    else if (k === "branch_department_ids" && v && typeof v === "object" && !Array.isArray(v)) {
      // { şube: departman }
      for (const [loc, dept] of Object.entries(v as Record<string, unknown>)) { push(locs, loc); push(depts, dept); }
    } else if (v && typeof v === "object") collectScopedIds(v, locs, depts, depth + 1);
  }
}

/** İstek başka işletmenin şube/departman kimliğini taşıyorsa true. */
export async function foreignScopeIds(orgId: string, locs: Set<string>, depts: Set<string>): Promise<boolean> {
  if (!locs.size && !depts.size) return false;
  let s = cache.get(orgId);
  if (!s || Date.now() - s.at > TTL_MS) s = await loadScope(orgId);
  const missing = () => [...locs].some(id => !s!.locations.has(id)) || [...depts].some(id => !s!.departments.has(id));
  if (!missing()) return false;
  s = await loadScope(orgId); // yeni açılmış şube/departman olabilir
  return missing();
}

export async function requestHasForeignScope(req: Request, orgId: string): Promise<boolean> {
  const locs = new Set<string>(), depts = new Set<string>();
  const url = new URL(req.url);
  for (const [k, v] of url.searchParams) {
    if (LOCATION_KEYS.has(k)) push(locs, v);
    else if (DEPARTMENT_KEYS.has(k)) push(depts, v);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && (req.headers.get("content-type") ?? "").includes("application/json")) {
    try { collectScopedIds(await req.clone().json(), locs, depts); } catch { /* gövde JSON değil */ }
  }
  try {
    return await foreignScopeIds(orgId, locs, depts);
  } catch (e) {
    console.error("orgScope:", e);
    return false; // veritabanı hatasında isteği durdurma; uçların kendi kontrolleri sürer
  }
}

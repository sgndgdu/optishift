/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Şubenin kendi görevleri (rules.custom_roles). POST: kişi kartındaki "+ Yeni görev".
 * DELETE: Ayarlar › Görevler. Kurallar burada birleştirilir (PATCH /api/locations rules'u tümden yazar).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth";
import { canManageLocation } from "@/lib/access";
import { branchRoles, customRoles, normalizeRoleLabel } from "@/lib/roles";

async function load(db: any, auth: any, locationId: string) {
  if (!locationId || !(await canManageLocation(db, auth, locationId))) return null;
  const row = await db.prepare("SELECT rules, shift_definitions FROM locations WHERE id = ? AND org_id = ?").get(locationId, auth.org_id) as any;
  if (!row) return null;
  let rules: Record<string, unknown> = {};
  try { rules = typeof row.rules === "string" ? JSON.parse(row.rules || "{}") : (row.rules ?? {}); } catch { rules = {}; }
  let defs: any[] = [];
  try { defs = typeof row.shift_definitions === "string" ? JSON.parse(row.shift_definitions || "[]") : (row.shift_definitions ?? []); } catch { defs = []; }
  return { rules, defs };
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const label = normalizeRoleLabel(String(body.label ?? ""));
  if (label.length < 2) return NextResponse.json({ error: "Görev adı en az 2 harf olmalı" }, { status: 400 });
  const db = getDB();
  const cur = await load(db, auth, String(body.location_id ?? ""));
  if (!cur) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  const existing = branchRoles(cur.rules).all;
  const same = existing.find(r => r.toLocaleLowerCase("tr") === label.toLocaleLowerCase("tr"));
  if (same) return NextResponse.json({ label: same, roles: branchRoles(cur.rules) });
  const rules = { ...cur.rules, custom_roles: [...customRoles(cur.rules), label] };
  await db.prepare("UPDATE locations SET rules = ? WHERE id = ?").run(JSON.stringify(rules), body.location_id);
  return NextResponse.json({ label, roles: branchRoles(rules) });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("location_id") ?? "";
  const label = searchParams.get("label") ?? "";
  const db = getDB();
  const cur = await load(db, auth, locationId);
  if (!cur) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  // Vardiya tanımı bu görevi zorunlu tutuyorsa önce oradan kaldırılmalı (yoksa vardiya açılamaz hale gelir)
  const usedBy = cur.defs.filter(d => Array.isArray(d.required_skills) && d.required_skills.some((rs: any) => rs?.skill === label)).map(d => d.name);
  if (usedBy.length) {
    return NextResponse.json({ error: `"${label}" şu vardiyalarda zorunlu görev: ${usedBy.join(", ")}. Önce oradan kaldırın.` }, { status: 409 });
  }
  const rules = { ...cur.rules, custom_roles: customRoles(cur.rules).filter(r => r !== label) };
  await db.prepare("UPDATE locations SET rules = ? WHERE id = ?").run(JSON.stringify(rules), locationId);
  // Görev listeden kalkınca kişilerde yetim kalmasın
  const people = await db.prepare("SELECT id, roles FROM personnel WHERE assigned_location_ids LIKE ?").all(`%"${locationId}"%`) as any[];
  for (const p of people) {
    let roles: string[] = [];
    try { roles = JSON.parse(p.roles || "[]"); } catch { roles = []; }
    if (roles.includes(label)) {
      await db.prepare("UPDATE personnel SET roles = ? WHERE id = ?").run(JSON.stringify(roles.filter(r => r !== label)), p.id);
    }
  }
  return NextResponse.json({ roles: branchRoles(rules) });
}

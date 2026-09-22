/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveNextShiftDefId } from "@/lib/handover";

async function handoverLogEnabled(db: ReturnType<typeof getDB>, locationId: string): Promise<boolean> {
  const loc = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(locationId) as any;
  if (!loc?.rules) return false;
  try { return JSON.parse(loc.rules)?.handover_log_enabled === true; } catch { return false; }
}

// GET — müdür paneli: şubenin devir-teslim kayıtları (?status=unread|read ile filtrelenebilir)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get("location_id");
  const status = searchParams.get("status"); // "unread" | "read" | null (hepsi)
  if (!location_id) return NextResponse.json({ error: "location_id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const loc = await db.prepare(`SELECT id FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id);
    if (!loc) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });

    let where = "h.location_id = $1 AND h.org_id = $2";
    const args: any[] = [location_id, auth.org_id];
    if (status === "unread") where += " AND h.read_by_personnel_id IS NULL";
    else if (status === "read") where += " AND h.read_by_personnel_id IS NOT NULL";

    // Not: bu sorgu PostgreSQL $n yer tutucusunu doğrudan kullanıyor (getDB()'nin
    // ?→$n dönüşümünü değil) çünkü koşullu WHERE parçası önceden derleniyor.
    const rows = await db.prepare(`
      SELECT h.*, author.name AS author_name, reader.name AS reader_name, d.name AS department_name
      FROM shift_handovers h
      JOIN personnel author ON author.id = h.author_personnel_id
      LEFT JOIN personnel reader ON reader.id = h.read_by_personnel_id
      LEFT JOIN departments d ON d.id = h.department_id
      WHERE ${where}
      ORDER BY h.created_at DESC
      LIMIT 200
    `).all(...args) as any[];

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — check-out sırasında not bırak. Hedef vardiya tanımı otomatik (sıradaki) belirlenir.
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.personnel_id) return NextResponse.json({ error: "Bu işlem personel hesabı gerektirir" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { shift_id, note } = body;
  if (!shift_id) return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (!trimmed) return NextResponse.json({ error: "Not boş olamaz" }, { status: 400 });

  const db = getDB();
  try {
    const shift = await db.prepare(`SELECT * FROM shift_assignments WHERE id = ?`).get(shift_id) as any;
    if (!shift) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });
    if (auth.role === "employee" && shift.personnel_id !== auth.personnel_id) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    if (!(await handoverLogEnabled(db, shift.location_id))) {
      return NextResponse.json({ error: "Devir-teslim defteri bu şubede kapalı" }, { status: 422 });
    }

    const locRow = await db.prepare(`SELECT shift_definitions FROM locations WHERE id = ?`).get(shift.location_id) as any;
    let shiftDefs: { id: string; start: string }[] = [];
    try { shiftDefs = JSON.parse(locRow?.shift_definitions || "[]"); } catch { /* boş kalsın */ }
    const targetShiftDefId = resolveNextShiftDefId(shift.shift_id, shiftDefs);
    if (!targetShiftDefId) {
      return NextResponse.json({ error: "Şubede tanımlı vardiya bulunamadı, hedef belirlenemedi" }, { status: 422 });
    }

    const author = await db.prepare(`SELECT department_id FROM personnel WHERE id = ?`).get(shift.personnel_id) as any;

    const now = Math.floor(Date.now() / 1000);
    const result = await db.prepare(`
      INSERT INTO shift_handovers (org_id, location_id, department_id, author_personnel_id, target_shift_def_id, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(auth.org_id, shift.location_id, author?.department_id ?? null, shift.personnel_id, targetShiftDefId, trimmed.slice(0, 500), now);

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

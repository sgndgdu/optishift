import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { scopedLocationIds } from "@/lib/access";

// GET /api/messages/contacts: kullanıcının yazabileceği şube grupları ve kişiler (kullanıcı hesaplarından).
// Personel kaydı olmayan müdür/patron da listede çıkar. Kapsam: lib/access scopedLocationIds.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const db = getDB();
  try {
    const scope = await scopedLocationIds(db, auth);
    const locs = await db.prepare("SELECT id, name FROM locations WHERE org_id = ? ORDER BY name").all(auth.org_id) as { id: string; name: string }[];
    const visible = scope === null ? locs : locs.filter(l => scope.includes(l.id));
    const locName = new Map(locs.map(l => [l.id, l.name]));
    const users = await db.prepare(`
      SELECT id, name, role, display_title, location_id FROM users
      WHERE org_id = ? AND id != ? AND COALESCE(approval_status, 'active') = 'active'
      ORDER BY name
    `).all(auth.org_id, auth.id) as { id: string; name: string; role: string; display_title: string | null; location_id: string | null }[];
    const roleLabel: Record<string, string> = { admin: "İşletme Sahibi", supervisor: "Bölge Müdürü", manager: "Müdür", employee: "Personel" };
    const people = users
      // Kapsamdaki şubelerin kişileri + patron (her zaman ulaşılabilir) + bölge müdürleri
      .filter(u => u.role === "admin" || u.role === "supervisor" || scope === null || (u.location_id && scope.includes(u.location_id)))
      .map(u => ({
        id: u.id, name: u.name, role: u.role,
        label: (u.role === "admin" || u.role === "supervisor" ? roleLabel[u.role] : u.display_title || roleLabel[u.role]) || "Personel",
        location: u.location_id ? locName.get(u.location_id) ?? null : null,
      }))
      // Yöneticiler önce
      .sort((a, b) => Number(a.role === "employee") - Number(b.role === "employee"));
    return NextResponse.json({
      groups: visible.map(l => ({ id: `loc-${l.id}`, name: l.name })),
      people,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { chatLocationIds } from "@/lib/access";

// GET /api/messages/contacts: kullanıcının yazabileceği şube grupları ve kişiler (kullanıcı hesaplarından).
// Personel kaydı olmayan müdür/patron da listede çıkar. Kapsam: lib/access scopedLocationIds.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const db = getDB();
  try {
    const scope = await chatLocationIds(db, auth);
    const locs = await db.prepare("SELECT id, name FROM locations WHERE org_id = ? ORDER BY name").all(auth.org_id) as { id: string; name: string }[];
    const visible = scope === null ? locs : locs.filter(l => scope.includes(l.id));
    const locName = new Map(locs.map(l => [l.id, l.name]));
    const users = await db.prepare(`
      SELECT u.id, u.name, u.role, u.display_title, u.location_id, p.assigned_location_ids FROM users u
      LEFT JOIN personnel p ON p.id = u.personnel_id
      WHERE u.org_id = ? AND u.id != ? AND COALESCE(u.approval_status, 'active') = 'active'
      ORDER BY u.name
    `).all(auth.org_id, auth.id) as { id: string; name: string; role: string; display_title: string | null; location_id: string | null; assigned_location_ids?: unknown }[];
    // Kişinin çalıştığı diğer şubeler: iki şubede çalışan ekip üyesi ikinci şubenin sorumlusunda da görünür
    const worksIn = (u: { location_id: string | null; assigned_location_ids?: unknown }) => {
      let extra: string[] = [];
      try { const a = Array.isArray(u.assigned_location_ids) ? u.assigned_location_ids : JSON.parse(String(u.assigned_location_ids ?? "[]")); extra = Array.isArray(a) ? a.map(String) : []; } catch { extra = []; }
      return [u.location_id, ...extra].filter(Boolean) as string[];
    };
    // Bana yazmış herkes listede olsun (okunmamış mesaj sayılıp kişi listede olmadığı için açılamıyordu)
    const partners = new Set((await db.prepare(
      `SELECT DISTINCT from_user_id AS sender_id FROM messages WHERE to_user_id = ? AND org_id = ?`
    ).all(auth.id, auth.org_id) as { sender_id: string }[]).map(r => String(r.sender_id)));
    const roleLabel: Record<string, string> = { admin: "Hesap sahibi", supervisor: "Bölge sorumlusu", manager: "Sorumlu", employee: "Ekip üyesi" };
    const people = users
      // Kapsamdaki şubelerin kişileri + patron (her zaman ulaşılabilir) + bölge müdürleri
      .filter(u => u.role === "admin" || u.role === "supervisor" || scope === null || partners.has(u.id) || worksIn(u).some(l => scope.includes(l)))
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

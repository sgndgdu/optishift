import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth";

// GET /api/auth/google/session
// Google callback zaten oturum cookie'sini set etti; bu endpoint /api/auth/login
// ile AYNI şekilli JSON'u döner ki /auth/google/complete köprü sayfası mevcut
// handleLogin yönlendirme mantığını (rol bazlı localStorage + router.push) tekrar kullanabilsin.
export async function GET(req: NextRequest) {
  const auth = getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, auth.id)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    personnel_id: user.personnel_id ?? null,
    username: user.username,
    email: user.email,
    role: user.role,
    org_id: user.org_id,
    location_id: user.location_id ?? null,
    department_id: user.department_id ?? null,
    name: user.name,
    is_temp_password: !!user.is_temp_password,
  });
}

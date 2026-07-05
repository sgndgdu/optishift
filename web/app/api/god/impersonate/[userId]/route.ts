/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db/client";
import { signToken } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    const user = (await db.prepare(`SELECT * FROM users WHERE id = $1`).get(userId)) as any;
    if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

    // Normal oturum token'ı oluştur (bu kullanıcı adına)
    const token = await signToken({
      id: user.id,
      org_id: user.org_id,
      role: user.role,
      location_id: user.location_id ?? null,
      personnel_id: user.personnel_id ?? null,
      name: user.name,
    });

    // Audit log
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
    await db.prepare(
      `INSERT INTO admin_audit_log (action, target_org_id, target_user_id, payload, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`
    ).run(
      `impersonate`,
      user.org_id,
      user.id,
      JSON.stringify({ user_name: user.name, user_role: user.role }),
      ip,
      now
    );

    // Hangi sayfaya yönlendirileceğini rol bazlı belirle
    let redirect = "/dashboard";
    if (user.role === "employee") redirect = "/portal";
    else if (user.role === "supervisor") redirect = "/supervisor";

    // Client, portal localStorage anahtarını doldurabilsin diye login yanıtıyla
    // aynı şekilde user objesi de döndürülür
    const userData = {
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
    };

    // Oturum cookie'si ile impersonation cookie'si birlikte set
    const res = NextResponse.json({ ok: true, redirect, user: userData });
    res.cookies.set("optishift_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 2, // 2 saat
      path: "/",
    });
    res.cookies.set("optishift_impersonation", JSON.stringify({
      org_name: null, // Caller dolduracak
      user_name: user.name,
      user_id: user.id,
      org_id: user.org_id,
      started_at: now,
    }), {
      httpOnly: false, // Client-side okunabilmeli (banner için)
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 2,
      path: "/",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

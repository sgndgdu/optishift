/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth, signToken, setCookie } from "@/lib/auth";


function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// GET /api/invite?token=xxx — validate token, start session (no auth required)
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const inv = await db.prepare("SELECT * FROM invite_tokens WHERE token = ?").get(token) as any;
    if (!inv) {
      return NextResponse.json({ error: "Geçersiz davet linki" }, { status: 404 });
    }
    const now = Math.floor(Date.now() / 1000);
    if (inv.expires_at < now) {
      return NextResponse.json({ error: "Bu davet linkinin süresi dolmuş (7 gün)" }, { status: 410 });
    }
    if (inv.used_at) {
      return NextResponse.json({ error: "Bu davet linki daha önce kullanılmış" }, { status: 410 });
    }
    if (!inv.user_id) {
      return NextResponse.json({ error: "Bağlı kullanıcı bulunamadı" }, { status: 404 });
    }

    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(inv.user_id) as any;
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    await db.prepare("UPDATE invite_tokens SET used_at = ? WHERE token = ?").run(now, token);

    const sessionToken = await signToken({
      id: user.id, org_id: user.org_id, role: user.role,
      location_id: user.location_id ?? null,
      personnel_id: user.personnel_id ?? null,
      name: user.name,
    });
    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id, username: user.username, name: user.name,
        role: user.role, org_id: user.org_id,
        location_id: user.location_id ?? null,
        department_id: user.department_id ?? null,
        is_temp_password: !!user.is_temp_password,
      },
    });
    setCookie(res, sessionToken);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/invite — generate invite token for existing user_id (auth required)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ error: "user_id zorunlu" }, { status: 400 });

    const user = await db.prepare("SELECT * FROM users WHERE id = ? AND org_id = ?").get(user_id, auth.org_id) as any;
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    const token = generateToken();
    const now = Math.floor(Date.now() / 1000);
    const id = `IT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await db.prepare(`
      INSERT INTO invite_tokens (id, token, user_id, org_id, location_id, role, invited_name, created_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, token, user_id, auth.org_id, user.location_id ?? null, user.role, user.name, auth.id, now + 7 * 24 * 3600, now);
    return NextResponse.json({ success: true, token });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

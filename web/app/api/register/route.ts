/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signToken, setCookie } from "@/lib/auth";


export async function POST(req: NextRequest) {
  const db = getDB();

  try {
    const { org_name, owner_name, username, email, password } = await req.json();

    if (!org_name?.trim() || !owner_name?.trim() || !username?.trim() || !password) {
      return NextResponse.json({ error: "Tüm alanlar zorunlu" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (cleanUsername.length < 3) {
      return NextResponse.json({ error: "Kullanıcı adı en az 3 karakter olmalı" }, { status: 400 });
    }

    const existingUsername = await db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
    if (existingUsername) {
      return NextResponse.json({ error: "Bu kullanıcı adı zaten alınmış" }, { status: 409 });
    }

    if (email?.trim()) {
      const existingEmail = await db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
      if (existingEmail) {
        return NextResponse.json({ error: "Bu e-posta adresi zaten kayıtlı" }, { status: 409 });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const orgId = `ORG-${Date.now()}`;
    const userId = `U-${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, ?)`).run(orgId, org_name.trim());
    await db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, org_id, name, created_at)
      VALUES (?, ?, ?, ?, 'admin', ?, ?, ?)
    `).run(userId, cleanUsername, email?.trim()?.toLowerCase() || null, passwordHash, orgId, owner_name.trim(), now);

    const token = await signToken({
      id: userId,
      org_id: orgId,
      role: "admin",
      location_id: null,
      personnel_id: null,
      name: owner_name.trim(),
    });

    const res = NextResponse.json({
      success: true,
      user: {
        id: userId,
        personnel_id: null,
        username: cleanUsername,
        email: email?.trim()?.toLowerCase() || null,
        role: "admin",
        org_id: orgId,
        location_id: null,
        department_id: null,
        name: owner_name.trim(),
      },
    });
    setCookie(res, token);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: "Kayıt hatası: " + err.message }, { status: 500 });
  }
}

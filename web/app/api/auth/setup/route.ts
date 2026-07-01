/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth, signToken, setCookie } from "@/lib/auth";


// POST /api/auth/setup — ilk girişte şifre belirleme + bilgi doldurma
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { name, phone, new_password } = await req.json();

    if (!new_password || new_password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı" }, { status: 400 });
    }

    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(auth.id) as any;
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    const updates: any = { password_hash: passwordHash, is_temp_password: false };
    if (name?.trim()) updates.name = name.trim();
    if (phone?.trim()) updates.phone = phone.trim();

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    const vals = [...Object.values(updates), auth.id];
    await db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...vals);

    // Personnel kaydı varsa isim/telefon güncelle
    if (user.personnel_id) {
      const pUpdates: string[] = [];
      const pVals: any[] = [];
      if (name?.trim()) { pUpdates.push("name = ?"); pVals.push(name.trim()); }
      if (phone?.trim()) { pUpdates.push("phone = ?"); pVals.push(phone.trim()); }
      if (pUpdates.length > 0) {
        pVals.push(user.personnel_id);
        await db.prepare(`UPDATE personnel SET ${pUpdates.join(", ")} WHERE id = ?`).run(...pVals);
      }
    }

    const updatedUser = await db.prepare("SELECT * FROM users WHERE id = ?").get(auth.id) as any;

    const userData = {
      id: updatedUser.id,
      personnel_id: updatedUser.personnel_id ?? null,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      org_id: updatedUser.org_id,
      location_id: updatedUser.location_id ?? null,
      department_id: updatedUser.department_id ?? null,
      name: updatedUser.name,
      is_temp_password: false,
    };

    const token = await signToken({
      id: updatedUser.id,
      org_id: updatedUser.org_id,
      role: updatedUser.role,
      location_id: updatedUser.location_id ?? null,
      personnel_id: updatedUser.personnel_id ?? null,
      name: updatedUser.name,
    });

    const res = NextResponse.json({ success: true, user: userData });
    setCookie(res, token);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

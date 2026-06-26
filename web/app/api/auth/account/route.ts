import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { verifyToken, signToken, setCookie, SESSION_COOKIE } from "@/lib/auth";



export async function GET(req: NextRequest) {
  const db = getDB();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const auth = await verifyToken(token);
  if (!auth) return NextResponse.json({ error: "Geçersiz oturum" }, { status: 401 });

  const user = await db.prepare("SELECT id, name, email, username, role FROM users WHERE id = ?").get(auth.id) as any;
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, username: user.username, role: user.role });
}

export async function PATCH(req: NextRequest) {
  const db = getDB();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const auth = await verifyToken(token);
  if (!auth) return NextResponse.json({ error: "Geçersiz oturum" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const { name, email, username, currentPassword, newPassword, confirmPassword } = body;

  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(auth.id) as any;
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

  // Profil bilgisi değişikliğinde şifre onayı gerekli
  const isProfileChange = name !== undefined || email !== undefined || username !== undefined;
  if (isProfileChange && !newPassword) {
    if (!confirmPassword) return NextResponse.json({ error: "Şifre onayı gerekli" }, { status: 400 });
    const valid = await bcrypt.compare(confirmPassword, user.password_hash);
    if (!valid) return NextResponse.json({ error: "Şifre yanlış" }, { status: 400 });
  }

  // Şifre değişikliği varsa mevcut şifreyi doğrula
  if (newPassword) {
    if (!currentPassword) return NextResponse.json({ error: "Mevcut şifre gerekli" }, { status: 400 });
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return NextResponse.json({ error: "Mevcut şifre yanlış" }, { status: 400 });
    if (newPassword.length < 6) return NextResponse.json({ error: "Yeni şifre en az 6 karakter olmalı" }, { status: 400 });
  }

  // Email ve kullanıcı adı benzersizlik kontrolü
  if (email && email !== user.email) {
    const exists = await db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, auth.id);
    if (exists) return NextResponse.json({ error: "Bu e-posta zaten kullanımda" }, { status: 409 });
  }
  if (username && username !== user.username) {
    const exists = await db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, auth.id);
    if (exists) return NextResponse.json({ error: "Bu kullanıcı adı zaten kullanımda" }, { status: 409 });
  }

  const updatedName = name?.trim() || user.name;
  const updatedEmail = email?.trim() || user.email;
  const updatedUsername = username?.trim() || user.username;

  if (newPassword) {
    const hash = await bcrypt.hash(newPassword, 10);
    await db.prepare("UPDATE users SET name = ?, email = ?, username = ?, password_hash = ? WHERE id = ?")
      .run(updatedName, updatedEmail, updatedUsername, hash, auth.id);
  } else {
    await db.prepare("UPDATE users SET name = ?, email = ?, username = ? WHERE id = ?")
      .run(updatedName, updatedEmail, updatedUsername, auth.id);
  }

  // JWT'yi yeni isimle yenile
  const newToken = await signToken({ ...auth, name: updatedName });
  const res = NextResponse.json({ ok: true, name: updatedName, email: updatedEmail, username: updatedUsername });
  setCookie(res, newToken);
  return res;
}

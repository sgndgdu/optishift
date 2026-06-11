import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

// POST — departmana şef ata (yeni kullanıcı oluştur veya güncelle)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { department_id, location_id, org_id, name, email } = body;

  if (!department_id || !location_id || !org_id || !name?.trim() || !email?.trim())
    return NextResponse.json({ error: "Tüm alanlar zorunlu" }, { status: 400 });

  // E-posta zaten var mı?
  const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  // Rastgele 6 haneli temp şifre
  const temp_password = Math.random().toString(36).slice(-6).toUpperCase();
  const password_hash = await bcrypt.hash(temp_password, 10);

  if (existing) {
    // Var olan kullanıcıyı bu departmana manager olarak ata
    await db.update(users).set({
      role: "manager",
      department_id,
      location_id,
      org_id,
      password_hash,
    }).where(eq(users.id, existing.id));

    return NextResponse.json({ user_id: existing.id, temp_password, updated: true });
  }

  // Yeni manager kullanıcısı oluştur
  const id = `U-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const username = email.toLowerCase().trim().split("@")[0].replace(/[^a-z0-9._-]/g, ".") + `.${Date.now()}`;
  await db.insert(users).values({
    id,
    username,
    email: email.toLowerCase().trim(),
    password_hash,
    role: "manager",
    org_id,
    location_id,
    department_id,
    name: name.trim(),
  });

  return NextResponse.json({ user_id: id, temp_password, updated: false });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken, setCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username?.trim() || !password) {
      return NextResponse.json({ error: "Kullanıcı adı ve şifre zorunlu" }, { status: 400 });
    }

    const normalized = username.trim().toLowerCase();
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, normalized))
      .limit(1);

    if (!user) {
      [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalized))
        .limit(1);
    }

    if (!user) {
      return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
    }

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
    };

    const token = await signToken({
      id: user.id,
      org_id: user.org_id,
      role: user.role,
      location_id: user.location_id ?? null,
      personnel_id: user.personnel_id ?? null,
      name: user.name,
    });

    const res = NextResponse.json(userData);
    setCookie(res, token);
    return res;
  } catch (err: any) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

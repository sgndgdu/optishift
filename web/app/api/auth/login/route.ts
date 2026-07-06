/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken, setCookie } from "@/lib/auth";
import { logPlatformEvent } from "@/lib/platform-logger";
import { getDB } from "@/lib/db/client";
import { checkRateLimit, resetRateLimit, getClientIp } from "@/lib/rate-limit";

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username?.trim() || !password) {
      return NextResponse.json({ error: "Kullanıcı adı ve şifre zorunlu" }, { status: 400 });
    }

    const normalized = username.trim().toLowerCase();
    const clientIp = getClientIp(req);
    const ipKey = `login:ip:${clientIp}`;
    const userKey = `login:user:${normalized}`;

    const ipCheck = checkRateLimit(ipKey, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
    const userCheck = checkRateLimit(userKey, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
    if (!ipCheck.allowed || !userCheck.allowed) {
      const retryAfter = Math.max(ipCheck.retryAfterSec, userCheck.retryAfterSec);
      return NextResponse.json(
        {
          error: `Çok fazla başarısız deneme. Lütfen ${Math.ceil(retryAfter / 60)} dakika sonra tekrar deneyin.`,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

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

    // Onay bekleyen hesaplar giriş yapamaz
    if (user.approval_status === "pending") {
      return NextResponse.json({ error: "Hesabınız henüz onaylanmadı. Lütfen yöneticinizle iletişime geçin." }, { status: 403 });
    }
    if (user.approval_status === "rejected") {
      return NextResponse.json({ error: "Hesabınız reddedildi. Lütfen yöneticinizle iletişime geçin." }, { status: 403 });
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
      is_temp_password: !!(user.is_temp_password),
    };

    const token = await signToken({
      id: user.id,
      org_id: user.org_id,
      role: user.role,
      location_id: user.location_id ?? null,
      personnel_id: user.personnel_id ?? null,
      name: user.name,
    });

    resetRateLimit(ipKey);
    resetRateLimit(userKey);

    const res = NextResponse.json(userData);
    setCookie(res, token);

    // Platform event log + last_login_at güncelle (fire-and-forget)
    const rawDb = getDB();
    const now = Math.floor(Date.now() / 1000);
    rawDb.prepare(`UPDATE users SET last_login_at = $1 WHERE id = $2`).run(now, user.id).catch(() => {});
    // Org adını bulmak için ek sorgu
    rawDb.prepare(`SELECT name FROM organizations WHERE id = $1`).get(user.org_id)
      .then((org: any) => {
        logPlatformEvent("login", user.org_id, org?.name ?? null, {
          user_id: user.id,
          user_name: user.name,
          role: user.role,
        });
      })
      .catch(() => {});

    return res;
  } catch (err: any) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

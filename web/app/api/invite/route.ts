/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth, signToken, setCookie, parseManagedLocations } from "@/lib/auth";
import { isBranchManager, parseAccess } from "@/lib/userAccess";
import { inDepartmentScope, managerOutsideBranch } from "@/lib/access";


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
    if (!inv.user_id) {
      return NextResponse.json({ error: "Bağlı kullanıcı bulunamadı" }, { status: 404 });
    }

    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(inv.user_id) as any;
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }
    // İşten çıkan (pasife alınan) kişinin eski davet bağlantısı da çalışmaz
    if (user.approval_status === "disabled" || user.approval_status === "rejected") {
      return NextResponse.json({ error: "Hesabınız kapatıldı. Lütfen yöneticinizle iletişime geçin." }, { status: 403 });
    }
    // Bağlantı, kişi şifresini belirleyene kadar (7 gün içinde) tekrar açılabilir: açıp kapatınca ölmez.
    // Şifre belirlenince (POST /api/auth/setup) o ana kadarki davetler kapanır (used_at). Yöneticinin sonradan
    // ürettiği yeni bağlantı ise şifre yenileme gibi çalışır.
    if (inv.used_at && !user.is_temp_password) {
      return NextResponse.json({ error: "Bu hesap zaten kurulmuş. Kullanıcı adınız ve şifrenizle giriş yapın." }, { status: 410 });
    }

    const sessionToken = await signToken({
      id: user.id, org_id: user.org_id, role: user.role,
      location_id: user.location_id ?? null,
      personnel_id: user.personnel_id ?? null,
      name: user.name,
      managed_location_ids: parseManagedLocations(user.managed_location_ids),
      access: parseAccess(user.permissions),
    });
    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id, username: user.username, name: user.name,
        role: user.role, org_id: user.org_id,
        location_id: user.location_id ?? null,
        department_id: user.department_id ?? null,
        access: parseAccess(user.permissions),
        is_temp_password: !!user.is_temp_password,
        // Kayıtlı telefon kurulum ekranında dolu gelsin (kişinin kendi numarası; token sahibine gösterilir)
        phone: user.phone || (user.personnel_id
          ? ((await db.prepare("SELECT phone FROM personnel WHERE id = ?").get(user.personnel_id)) as any)?.phone || null
          : null),
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
    // Giriş bağlantısı hesaba şifresiz girer: sadece kişinin üstündeki yönetici, kendi kapsamındaki kişi için üretir.
    // Patron herkes için (kendisi hariç); şube müdürü kendi şubesinin çalışanları ve şefleri; şef kendi departmanı.
    const RANK: Record<string, number> = { employee: 0, manager: 1, supervisor: 2, admin: 3 };
    const targetIsChef = user.role === "manager" && !!parseAccess(user.permissions)?.department_id;
    const branchMgrForChef = isBranchManager(auth) && targetIsChef && user.location_id === auth.location_id;
    const allowed = user.id !== auth.id && (
      auth.role === "admin" ||
      branchMgrForChef ||
      ((RANK[user.role] ?? 0) < (RANK[auth.role] ?? 0)
        && !managerOutsideBranch(auth, user.location_id)
        && (await inDepartmentScope(db, auth, user.personnel_id)))
    );
    if (!allowed) {
      return NextResponse.json({ error: "Bu kişi için giriş bağlantısı oluşturamazsınız" }, { status: 403 });
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

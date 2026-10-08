/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPlan, limitMessage } from "@/lib/plans";
import { generateTempPassword, generateUsername } from "@/lib/accountCreation";
import { defaultWeeklyHours } from "@/lib/legal";
import { parseBranchRotation } from "@/lib/branchRotation";
import crypto from "crypto";
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { departmentScope, hasPerm, permError } from "@/lib/userAccess";
import { chefDepartmentIds, departmentInScope, managerOutsideBranch, inDepartmentScope } from "@/lib/access";


// Rol hiyerarşisi: bir rol kendisinin ve altındakilerin rollerini atayabilir
const ROLE_RANK: Record<string, number> = { employee: 0, manager: 1, supervisor: 2, admin: 3 };
function canAssignRole(assignerRole: string, targetRole: string): boolean {
  return (ROLE_RANK[assignerRole] ?? 0) >= (ROLE_RANK[targetRole] ?? 0);
}

// GET: Departman veya lokasyona göre personeli getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const department_id = searchParams.get("department_id");
  const location_id = searchParams.get("location_id");
  const id = searchParams.get("id");

  const db = getDB();
  try {
    const baseSelect = `
      SELECT p.*, u.username, u.id as user_id, u.is_temp_password
      FROM personnel p
      LEFT JOIN users u ON u.personnel_id = p.id
    `;
    let rows;
    if (id) {
      // Tek kişi: personel sadece kendini, yönetici işletmesindeki kişiyi
      if (auth.role === "employee" && auth.personnel_id !== id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`${baseSelect} WHERE p.id = ? AND p.org_id = ?`).all(id, auth.org_id);
    } else if (department_id) {
      // Departmanın bu org'a ait olduğunu doğrula
      const dept = await db.prepare(`
        SELECT d.id FROM departments d
        JOIN locations l ON d.location_id = l.id
        WHERE d.id = ? AND l.org_id = ?
      `).get(department_id, auth.org_id);
      if (!dept) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`${baseSelect} WHERE p.department_id = ? AND p.org_id = ? ORDER BY p.name ASC`).all(department_id, auth.org_id);
    } else if (location_id) {
      // Lokasyonun bu org'a ait olduğunu doğrula
      const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`${baseSelect} WHERE p.assigned_location_ids LIKE ? AND p.org_id = ? ORDER BY p.name ASC`).all(`%"${location_id}"%`, auth.org_id);
    } else {
      // org_id token'dan gelir — query param'a güvenilmez
      rows = await db.prepare(`${baseSelect} WHERE p.org_id = ? ORDER BY p.name ASC`).all(auth.org_id);
    }

    const parsed = (rows as any[]).map((p) => {
      const { kiosk_pin, ...rest } = p;
      const roles = JSON.parse(p.roles || "[]");
      return {
        ...rest,
        // Görevler kaldırıldı (2026-10-05): ayrı unvan yok, ekranlar departmanı gösterir
        title: null,
        kiosk_pin_set: !!kiosk_pin, // ham bcrypt hash client'a asla dönmez
        assigned_location_ids: JSON.parse(p.assigned_location_ids || "[]"),
        assigned_department_ids: JSON.parse(p.assigned_department_ids || "[]"),
        roles,
        role_levels: JSON.parse(p.role_levels || "{}"),
        preferred_shift_ids: JSON.parse(p.preferred_shift_ids || "[]"),
        preferred_days: JSON.parse(p.preferred_days || "[]"),
        preferred_roles: JSON.parse(p.preferred_roles || "[]"),
      };
    });
    // Bölge müdürü işletme geneli listede sadece atandığı şubelerin personelini görür
    const scoped = auth.role === "supervisor" && auth.managed_location_ids?.length
      ? parsed.filter((p: any) => auth.managed_location_ids!.some(l => p.primary_location_id === l || p.assigned_location_ids.includes(l)))
      : parsed;
    // Departman şefi (lib/userAccess) sadece kendi departmanının ve alt departmanlarının ekibini görür
    const chefFamily = auth.role !== "employee" ? await chefDepartmentIds(db, auth) : null;
    const visible = chefFamily ? scoped.filter((p: any) => chefFamily.includes(p.department_id)) : scoped;
    // Personel arkadaşlarının sadece adını ve unvanını görür (ücret, telefon, not, puan gibi alanlar yöneticiler için)
    if (auth.role === "employee") {
      return NextResponse.json(visible.map((p: any) => p.id === auth.personnel_id ? p : {
        id: p.id, name: p.name, title: p.title ?? null, user_id: p.user_id ?? null,
        user_access_level: p.user_access_level, department_id: p.department_id ?? null, status: p.status,
      }));
    }
    return NextResponse.json(visible);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni personel ekle
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Sadece manager ve üstü personel ekleyebilir
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { location_id, name, email, phone, employment_type, role, temp_password } = body;
    // Ayrı unvan alanı yok: kişinin altında ilk görevi (rolü) yazar
    const roles: string[] = Array.isArray(body.roles) ? body.roles.filter((r: unknown) => typeof r === "string" && r.trim()) : [];
    const title = roles[0] ?? (typeof body.title === "string" && body.title.trim() ? body.title.trim() : null);

    if (!location_id || !name) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    // Atanan rol, atayan kişinin rolünü aşamaz
    const requestedRole = role ?? "employee";
    if (!canAssignRole(auth.role, requestedRole)) {
      return NextResponse.json({ error: `${auth.role} rolü, ${requestedRole} rolü atayamaz` }, { status: 403 });
    }

    // Manager sadece kendi şubesine personel ekleyebilir
    if (managerOutsideBranch(auth, location_id)) {
      return NextResponse.json({ error: "Sadece kendi şubenize personel ekleyebilirsiniz" }, { status: 403 });
    }

    // location_id'nin bu org'a ait olduğunu doğrula
    const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
    if (!loc) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Paket sınırı (lib/plans): aktif personel sayısı
    const org = await db.prepare("SELECT plan FROM organizations WHERE id = ?").get(auth.org_id) as any;
    const maxPersonnel = getPlan(org?.plan).maxPersonnel;
    if (maxPersonnel !== null) {
      const personnelCount = ((await db.prepare("SELECT COUNT(*) as cnt FROM personnel WHERE org_id = ? AND status != 'inactive'").get(auth.org_id)) as any).cnt;
      if (personnelCount >= maxPersonnel) {
        return NextResponse.json(
          { error: limitMessage("personnel"), upgrade: true },
          { status: 402 }
        );
      }
    }

    if (email?.trim()) {
      const existingUser = await db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
      if (existingUser) {
        return NextResponse.json({ error: "Bu e-posta zaten kayıtlı" }, { status: 409 });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const userId = `U-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const password = temp_password || generateTempPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const employeeId = `EMP-${Math.floor(Math.random() * 90000) + 10000}`;
    const username = await generateUsername(db, name);
    // Diğer hesap açma yollarıyla aynı: müdürün açtığı hesap onaya düşer, şifre geçicidir, davet bağlantısı üretilir
    const approvalStatus = "active"; // sorumlunun eklediği hesap direkt aktif (onay sadece kendi kendine kayıtta)

    await db.prepare(`
      INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0, 0, 14, ?, '{}', '[]', '[]', '[]', ?, ?)
    `).run(personnelId, auth.org_id, location_id, JSON.stringify([location_id]), role ?? "employee", name, employeeId, email?.toLowerCase() || null, phone ?? "", title, employment_type ?? "full_time", defaultWeeklyHours(employment_type), JSON.stringify(roles), now, now);

    await db.prepare(`
      INSERT INTO users (id, personnel_id, username, email, password_hash, role, org_id, location_id, name, is_temp_password, approval_status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true, ?, ?, ?)
    `).run(userId, personnelId, username, email?.toLowerCase() || null, passwordHash, role ?? "employee", auth.org_id, location_id, name, approvalStatus, auth.id, now);
    // Departman şefinin eklediği kişi şefin kapsamındaki seçilen departmana (yoksa şefin departmanına) girer
    const chefDept = departmentInScope(await chefDepartmentIds(db, auth), body.department_id);
    if (departmentScope(auth) && chefDept) {
      await db.prepare("UPDATE personnel SET department_id = ?, assigned_department_ids = ? WHERE id = ?").run(chefDept, JSON.stringify([chefDept]), personnelId);
      await db.prepare("UPDATE users SET department_id = ? WHERE id = ?").run(chefDept, userId);
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    await db.prepare(`
      INSERT INTO invite_tokens (id, token, user_id, org_id, location_id, role, invited_name, created_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`IT-${Date.now()}-${Math.floor(Math.random() * 100000)}`, inviteToken, userId, auth.org_id, location_id, role ?? "employee", name, auth.id, now + 7 * 24 * 3600, now);

    return NextResponse.json({ success: true, personnel_id: personnelId, username, temp_password: password, invite_token: inviteToken });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Personel bilgilerini güncelle
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Personelin bu org'a ait olduğunu doğrula
    const existing = await db.prepare("SELECT id, primary_location_id, user_access_level, department_id FROM personnel WHERE id = ? AND org_id = ?").get(id, auth.org_id) as any;
    if (!existing) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Manager sadece kendi şubesindeki personeli düzenleyebilir
    if (managerOutsideBranch(auth, existing.primary_location_id)) {
      return NextResponse.json({ error: "Sadece kendi şubenizin personelini düzenleyebilirsiniz" }, { status: 403 });
    }
    // Departman şefi sadece kendi departmanındakini düzenler ve başka departmana taşıyamaz
    if (!(await inDepartmentScope(db, auth, id))) {
      return NextResponse.json({ error: "Sadece kendi departmanınızın personelini düzenleyebilirsiniz" }, { status: 403 });
    }

    const body = await req.json();
    // Rol değişikliği tek yerden: PATCH /api/users make_manager / make_employee (şube, departman ve yetkiyle birlikte)
    if (body.user_access_level !== undefined && body.user_access_level !== existing.user_access_level) {
      return NextResponse.json({ error: "Rol değişikliği Ekip › Sorumlular kartından yapılır" }, { status: 400 });
    }
    const chefFamily = await chefDepartmentIds(db, auth);
    if (chefFamily && body.department_id !== undefined && !chefFamily.includes(body.department_id)) {
      return NextResponse.json({ error: "Kişiyi başka departmana sadece şube sorumlusu taşıyabilir" }, { status: 403 });
    }
    // Not: prev_score body'den kabul edilmez — türetilmiş önbellektir, tek yazarı
    // lib/scoring.ts recompute'udur. Elle düzeltme için score_adjustments (type: manual).
    const { name, phone, employment_type, max_weekly_hours, min_weekly_hours, user_access_level, roles, weekly_off_day, night_restriction } = body;
    // Ayrı unvan alanı yok: görevler değişince unvan ilk görev olur (görev yoksa eski unvan kalır)
    const title = Array.isArray(roles) && typeof roles[0] === "string" ? roles[0] : body.title;
    // Ücret "Ücretler ve maliyet" yetkisine bağlı (lib/userAccess); yetki yoksa gönderilen değer yok sayılır.
    // Pasife alma "Ekip" yetkisiyle (proxy bu uç noktayı zaten "Ekip"e bağlar).
    const hourly_wage = hasPerm(auth, "budget") ? body.hourly_wage : undefined;
    const status = !hasPerm(auth, "team") && body.status === "inactive" ? undefined : body.status;

    // Atanan rol, atayan kişinin rolünü aşamaz
    if (user_access_level && !canAssignRole(auth.role, user_access_level)) {
      return NextResponse.json({ error: `${auth.role} rolü, ${user_access_level} rolü atayamaz` }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE personnel SET name=COALESCE(?,name), phone=COALESCE(?,phone), title=COALESCE(?,title),
      employment_type=COALESCE(?,employment_type), status=COALESCE(?,status),
      max_weekly_hours=COALESCE(?,max_weekly_hours), min_weekly_hours=COALESCE(?,min_weekly_hours),
      user_access_level=COALESCE(?,user_access_level),
      roles=COALESCE(?,roles),
      updated_at=? WHERE id=?
    `).run(name, phone, title, employment_type, status, max_weekly_hours, min_weekly_hours ?? null,
      user_access_level,
      roles !== undefined ? JSON.stringify(roles) : null, now, id);

    // İşten çıkan (pasife alınan) kişi giriş yapamaz; tekrar aktif edilince hesabı açılır
    if (status === "inactive") {
      await db.prepare("UPDATE users SET approval_status = 'disabled' WHERE personnel_id = ?").run(id);
    } else if (status === "active") {
      await db.prepare("UPDATE users SET approval_status = 'active' WHERE personnel_id = ? AND approval_status = 'disabled'").run(id);
    }

    // hourly_wage: undefined → dokunma, null → temizle, sayı → ata
    if (hourly_wage !== undefined) {
      await db.prepare("UPDATE personnel SET hourly_wage=? WHERE id=?").run(
        hourly_wage === null ? null : Number(hourly_wage), id
      );
    }

    // department_id: undefined → dokunma, null → departmansız, string → kişinin şubesindeki departman
    if (body.department_id !== undefined) {
      const deptId = body.department_id === null || body.department_id === "" ? null : String(body.department_id);
      if (deptId) {
        const dept = await db.prepare("SELECT id FROM departments WHERE id = ? AND location_id = ?").get(deptId, existing.primary_location_id);
        if (!dept) return NextResponse.json({ error: "Departman bu şubede bulunamadı" }, { status: 400 });
      }
      // Diğer şubelerdeki departmanlar (paylaşılan personel) ve bu şubedeki ek departmanlar korunur;
      // sadece ana departman değişir (yeni ana departman ek listeden düşer)
      const curD = await db.prepare("SELECT assigned_department_ids FROM personnel WHERE id = ?").get(id) as any;
      let prevIds: string[] = [];
      try { prevIds = JSON.parse(curD?.assigned_department_ids || "[]"); } catch { prevIds = []; }
      const otherBranch = prevIds.length
        ? (await db.prepare(`SELECT id FROM departments WHERE id IN (${prevIds.map(() => "?").join(",")}) AND location_id <> ?`).all(...prevIds, existing.primary_location_id) as { id: string }[]).map(d => d.id)
        : [];
      const sameBranchExtras = deptId ? prevIds.filter(x => !otherBranch.includes(x) && x !== deptId && x !== existing.department_id) : [];
      await db.prepare("UPDATE personnel SET department_id=?, assigned_department_ids=? WHERE id=?")
        .run(deptId, JSON.stringify([...new Set([...(deptId ? [deptId] : []), ...sameBranchExtras, ...otherBranch])]), id);
    }

    // Bu şubede yardım edebileceği ek departmanlar (kullanıcı kararı 2026-10-05): kişi planda bunların
    // ihtiyacına da yazılabilir, her vardiyası tek departmana sayılır (shift_assignments.department_id).
    if (Array.isArray(body.extra_department_ids)) {
      const cur = await db.prepare("SELECT department_id, assigned_department_ids FROM personnel WHERE id = ?").get(id) as any;
      if (!cur?.department_id) return NextResponse.json({ error: "Önce ana departmanı seçin" }, { status: 400 });
      const want = [...new Set<string>(body.extra_department_ids.map(String))].filter(x => x !== cur.department_id);
      if (want.length) {
        const ok = await db.prepare(`SELECT id FROM departments WHERE id IN (${want.map(() => "?").join(",")}) AND location_id = ?`).all(...want, existing.primary_location_id) as { id: string }[];
        if (ok.length !== want.length) return NextResponse.json({ error: "Departman bu şubede bulunamadı" }, { status: 400 });
      }
      let prev: string[] = [];
      try { prev = JSON.parse(cur.assigned_department_ids || "[]"); } catch { prev = []; }
      const otherBranch = prev.length
        ? (await db.prepare(`SELECT id FROM departments WHERE id IN (${prev.map(() => "?").join(",")}) AND location_id <> ?`).all(...prev, existing.primary_location_id) as { id: string }[]).map(d => d.id)
        : [];
      await db.prepare("UPDATE personnel SET assigned_department_ids = ? WHERE id = ?")
        .run(JSON.stringify([...new Set([cur.department_id, ...want, ...otherBranch])]), id);
    }

    // Şubeler arası (kullanıcı kararı 2026-10-04): çalıştığı şubeler + planlı şube rotasyonu.
    // İşletme sahibi her zaman; yönetici "Başka şubeden personel" yetkisiyle (bölge müdürü kendi şubeleri, aşağıda).
    if (body.assigned_location_ids !== undefined || body.branch_rotation !== undefined || body.branch_department_ids !== undefined) {
      const allowed = hasPerm(auth, "cross_branch") && !departmentScope(auth);
      if (!allowed) return NextResponse.json({ error: permError("cross_branch") }, { status: 403 });
      const orgLocs = (await db.prepare("SELECT id FROM locations WHERE org_id = ?").all(auth.org_id) as { id: string }[]).map(l => l.id);
      const cur = await db.prepare("SELECT assigned_location_ids FROM personnel WHERE id = ?").get(id) as any;
      let assigned: string[] = (() => { try { return JSON.parse(cur?.assigned_location_ids || "[]"); } catch { return []; } })();
      if (body.assigned_location_ids !== undefined) {
        const want = Array.isArray(body.assigned_location_ids) ? [...new Set<string>(body.assigned_location_ids.map(String))] : [];
        if (want.some(l => !orgLocs.includes(l))) return NextResponse.json({ error: "Geçersiz şube" }, { status: 400 });
        // Bölge müdürü sadece kendi şubelerini ekleyip çıkarabilir
        if (auth.role === "supervisor" && auth.managed_location_ids?.length) {
          const changed = [...want.filter(l => !assigned.includes(l)), ...assigned.filter(l => !want.includes(l))];
          if (changed.some(l => !auth.managed_location_ids!.includes(l))) return NextResponse.json({ error: "Sadece sorumlu olduğunuz şubeleri değiştirebilirsiniz" }, { status: 403 });
        }
        if (!want.includes(existing.primary_location_id)) want.unshift(existing.primary_location_id);
        assigned = want;
        await db.prepare("UPDATE personnel SET assigned_location_ids = ? WHERE id = ?").run(JSON.stringify(assigned), id);
      }
      // Diğer şubelerdeki departman ({şubeId: departmanId}): assigned_department_ids = ana departman + bunlar
      if (body.branch_department_ids && typeof body.branch_department_ids === "object") {
        const cur2 = await db.prepare("SELECT department_id, assigned_department_ids FROM personnel WHERE id = ?").get(id) as any;
        const extra: string[] = [];
        for (const [loc, dept] of Object.entries(body.branch_department_ids as Record<string, unknown>)) {
          if (!dept || typeof dept !== "string" || !assigned.includes(loc) || loc === existing.primary_location_id) continue;
          const ok = await db.prepare("SELECT id FROM departments WHERE id = ? AND location_id = ?").get(dept, loc);
          if (!ok) return NextResponse.json({ error: "Departman o şubede bulunamadı" }, { status: 400 });
          extra.push(dept);
        }
        // Ana şubedeki ek departmanlar korunur
        let prev2: string[] = [];
        try { prev2 = JSON.parse(cur2?.assigned_department_ids || "[]"); } catch { prev2 = []; }
        const homeExtras = prev2.length
          ? (await db.prepare(`SELECT id FROM departments WHERE id IN (${prev2.map(() => "?").join(",")}) AND location_id = ?`).all(...prev2, existing.primary_location_id) as { id: string }[]).map(d => d.id)
          : [];
        const all = [...new Set([...(cur2?.department_id ? [cur2.department_id] : []), ...homeExtras, ...extra])];
        await db.prepare("UPDATE personnel SET assigned_department_ids = ? WHERE id = ?").run(JSON.stringify(all), id);
      }
      if (body.branch_rotation !== undefined) {
        const rot = body.branch_rotation === null ? null : parseBranchRotation(body.branch_rotation);
        if (body.branch_rotation !== null && !rot) return NextResponse.json({ error: "Şubeler arasında sırayla çalışma için en az iki şube ve geçerli bir sıklık seçin" }, { status: 400 });
        if (rot && rot.order.some(l => !assigned.includes(l))) return NextResponse.json({ error: "Sıradaki şubeler kişinin çalıştığı şubeler arasında olmalı" }, { status: 400 });
        await db.prepare("UPDATE personnel SET branch_rotation = ? WHERE id = ?").run(rot ? JSON.stringify(rot) : null, id);
      }
    }

    // weekly_off_day: undefined → dokunma, null → temizle, 0-6 → gün ata
    if (weekly_off_day !== undefined) {
      await db.prepare("UPDATE personnel SET weekly_off_day=? WHERE id=?").run(
        weekly_off_day === null ? null : Number(weekly_off_day), id
      );
    }


    // Yıllık izin alanları: sabit yıllık hak + elle düzeltme günü (kalan izin türetilir, doğrudan yazılmaz)
    if (body.annual_leave_days_total !== undefined) {
      await db.prepare("UPDATE personnel SET annual_leave_days_total=? WHERE id=?").run(Math.max(0, Number(body.annual_leave_days_total) || 0), id);
    }
    if (body.leave_adjustment_days !== undefined) {
      await db.prepare("UPDATE personnel SET leave_adjustment_days=? WHERE id=?").run(Number(body.leave_adjustment_days) || 0, id);
    }
    if (body.hire_date !== undefined) {
      const hd = typeof body.hire_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.hire_date) ? body.hire_date : null;
      await db.prepare("UPDATE personnel SET hire_date=? WHERE id=?").run(hd, id);
    }

    // night_restriction: undefined → dokunma, null/"" → kaldır, geçerli neden → ata
    if (night_restriction !== undefined) {
      const validReasons = ["pregnant", "nursing", "under18", "medical"];
      const value = validReasons.includes(night_restriction) ? night_restriction : null;
      await db.prepare("UPDATE personnel SET night_restriction=? WHERE id=?").run(value, id);
    }

    // role_levels: "Kıdemli Personel Kuralı" (rules.ensure_senior_per_shift) bu alandaki
    // herhangi bir değer "primary" ise kişiyi kıdemli sayar (bkz. /api/generate)
    if (body.role_levels !== undefined) {
      await db.prepare("UPDATE personnel SET role_levels=? WHERE id=?").run(
        JSON.stringify(body.role_levels ?? {}), id
      );
    }

    if (name) await db.prepare("UPDATE users SET name=? WHERE personnel_id=?").run(name, id);
    if (user_access_level) await db.prepare("UPDATE users SET role=? WHERE personnel_id=?").run(user_access_level, id);

    // Terfi/rol değişikliği bildirimi — eski rol farklıysa kişiye bildir
    if (user_access_level && user_access_level !== existing.user_access_level) {
      const ROLE_LABELS: Record<string, string> = { employee: "Ekip üyesi", manager: "Sorumlu", supervisor: "Sorumlu", admin: "Hesap sahibi" };
      const newLabel = ROLE_LABELS[user_access_level] ?? user_access_level;
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'alert', 'Sistem Rolünüz Güncellendi', ?, '/portal', false, ?)
      `).run(
        id,
        `Hesap türünüz "${newLabel}" olarak güncellendi. Yeni yetkileriniz için çıkış yapıp tekrar giriş yapın.`,
        now
      );
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Personeli devre dışı bırak
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    // Personelin bu org'a ait olduğunu doğrula; müdür sadece kendi şubesindekini
    const existing = await db.prepare("SELECT id, primary_location_id FROM personnel WHERE id = ? AND org_id = ?").get(id, auth.org_id) as any;
    if (!existing || (auth.role === "manager" && existing.primary_location_id !== auth.location_id)) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }
    if (!(await inDepartmentScope(db, auth, id))) {
      return NextResponse.json({ error: "Sadece kendi departmanınızın personelini silebilirsiniz" }, { status: 403 });
    }
    // Pasife alma (silme) "Ekip" yetkisine bağlı (lib/userAccess; proxy de keser)
    if (!hasPerm(auth, "team")) return NextResponse.json({ error: permError("team") }, { status: 403 });

    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE personnel SET status='inactive', updated_at=? WHERE id=?").run(now, id);
    // İşten çıkan kişi giriş yapamaz (tekrar aktif edilince açılır)
    await db.prepare("UPDATE users SET approval_status = 'disabled' WHERE personnel_id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultWeeklyHours } from "@/lib/legal";
import { getPlan, limitMessage } from "@/lib/plans";
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { hasLocationPermission, managerOutsideBranch } from "@/lib/access";
import { generateTempPassword, generateUsername } from "@/lib/accountCreation";
import { normalizeAccess, parseAccess, departmentScope, isBranchManager } from "@/lib/userAccess";

// GET /api/users — org kullanıcılarını listele (admin/supervisor)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("approval_status"); // "pending" | null=tümü

    let query = "SELECT id, name, username, email, phone, role, display_title, location_id, department_id, personnel_id, is_temp_password, approval_status, created_by, approved_by, approved_at, created_at, managed_location_ids, permissions FROM users WHERE org_id = ?";
    const params: any[] = [auth.org_id];

    if (status) {
      query += " AND approval_status = ?";
      params.push(status);
    }

    // Manager sadece kendisini ve KENDİ ŞUBESİNİN personel hesaplarını görür (başka şubelerin
    // çalışanları ve e-postaları listelenmez). Birden çok şubeye atanmış personel de dahil.
    if (auth.role === "manager") {
      // Şube müdürü kendi şubesinin diğer yöneticilerini (departman şefleri) de görür
      const mgrClause = isBranchManager(auth) ? ` OR (role = 'manager' AND location_id = ?)` : "";
      query += ` AND (id = ? OR (role = 'employee' AND (location_id = ? OR personnel_id IN (
        SELECT id FROM personnel WHERE org_id = ? AND (primary_location_id = ? OR assigned_location_ids LIKE ?))))${mgrClause})`;
      params.push(auth.id, auth.location_id, auth.org_id, auth.location_id, `%"${auth.location_id}"%`);
      if (mgrClause) params.push(auth.location_id);
    }

    query += " ORDER BY created_at DESC";
    let userList = await db.prepare(query).all(...params) as any[];
    // Bölge müdürü: kendisi + atandığı şubelerin hesapları (patron hesapları hariç)
    if (auth.role === "supervisor" && auth.managed_location_ids?.length) {
      userList = userList.filter(u => u.id === auth.id || (u.role !== "admin" && u.location_id && auth.managed_location_ids!.includes(u.location_id)));
    }
    return NextResponse.json(userList);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/users — yeni hesap oluştur + temp şifre üret
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    const { email, phone, role, display_title, location_id, department_id, location_ids, department_ids, title, employment_type, max_weekly_hours, existing_personnel_id } = body;
    let { name } = body;

    // Var olan personele giriş hesabı açma (hızlı eklenen, hesabı olmayan personel).
    // Personel kaydı yeniden oluşturulmaz; ad ve şube personel kaydından gelir.
    let existing: any = null;
    if (existing_personnel_id) {
      if (role && role !== "employee") return NextResponse.json({ error: "Var olan personele sadece personel hesabı açılabilir" }, { status: 400 });
      existing = await db.prepare(`SELECT id, name, phone, email, primary_location_id, assigned_location_ids, department_id FROM personnel WHERE id = ? AND org_id = ?`)
        .get(existing_personnel_id, auth.org_id);
      if (!existing) return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });
      const taken = await db.prepare(`SELECT id FROM users WHERE personnel_id = ?`).get(existing.id);
      if (taken) return NextResponse.json({ error: "Bu kişinin zaten bir hesabı var" }, { status: 409 });
      if (departmentScope(auth) && existing.department_id !== departmentScope(auth)) {
        return NextResponse.json({ error: "Sadece kendi departmanınızdaki kişiye hesap açabilirsiniz" }, { status: 403 });
      }
      name = name?.trim() ? name : existing.name;
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: "Ad soyad zorunlu" }, { status: 400 });
    }

    // Rol yetki kontrolü: kimse kendi rolünden yüksek rol atayamaz
    const RANK: Record<string, number> = { employee: 0, manager: 1, supervisor: 2, admin: 3 };
    const targetRank = RANK[role ?? "employee"] ?? 0;
    const callerRank = RANK[auth.role] ?? 0;
    // Şube müdürü kendi şubesine departman şefi ekleyebilir (aynı rütbe, ama sadece departman kapsamlı)
    const branchMgrAddsChef = isBranchManager(auth) && role === "manager" && !!parseAccess(normalizeAccess(body.access))?.department_id;
    if (targetRank >= callerRank && !branchMgrAddsChef) {
      return NextResponse.json({ error: "Kendi rolünüzden yüksek rol atayamazsınız" }, { status: 403 });
    }

    const isEmployee = !role || role === "employee";
    // Bölge müdürü: sadece patron ekler; şubeye bağlı değildir, sorumlu olduğu şubeler seçilir
    const isSupervisor = role === "supervisor";
    let managedIds: string[] = [];
    if (isSupervisor) {
      if (auth.role !== "admin") return NextResponse.json({ error: "Birden çok şubeli yöneticiyi sadece işletme sahibi ekler" }, { status: 403 });
      const want = Array.isArray(body.managed_location_ids) ? body.managed_location_ids.map(String) : [];
      if (!want.length) return NextResponse.json({ error: "Yönetici için en az bir şube seçin" }, { status: 400 });
      const ok = await db.prepare(`SELECT id FROM locations WHERE org_id = ? AND id IN (${want.map(() => "?").join(",")})`).all(auth.org_id, ...want) as { id: string }[];
      if (ok.length !== want.length) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 400 });
      managedIds = want;
    }

    // Personel için çoklu şube/departman desteği
    const effLocIds: string[] = existing
      ? [existing.primary_location_id].filter(Boolean)
      : Array.isArray(location_ids) && location_ids.length
      ? location_ids
      : (location_id ? [location_id] : []);
    const chefDept = departmentScope(auth);
    const effDeptIds: string[] = chefDept && !existing
      ? [chefDept]
      : existing
      ? [existing.department_id].filter(Boolean)
      : Array.isArray(department_ids) && department_ids.length
      ? department_ids
      : (department_id ? [department_id] : []);

    if (isEmployee && !existing) {
      if (!effLocIds.length) return NextResponse.json({ error: "Personel için en az bir şube seçmelisiniz" }, { status: 400 });
      // Departman seçimi sadece seçili şube(ler)de gerçekten departman tanımlıysa zorunlu —
      // departmansız (Basit Mod) şubelerde department_id null kalır.
      if (!effDeptIds.length) {
        const placeholders = effLocIds.map(() => "?").join(",");
        const existingDepts = await db.prepare(
          `SELECT id FROM departments WHERE location_id IN (${placeholders}) LIMIT 1`
        ).all(effLocIds);
        if (existingDepts.length) {
          return NextResponse.json({ error: "Personel için en az bir departman seçmelisiniz" }, { status: 400 });
        }
      }
    }

    // Birincil şube
    const primaryLocId = isSupervisor ? null : (effLocIds[0] ?? location_id ?? auth.location_id);

    // Manager sadece kendi şubesine ekleyebilir (var olan personel için: o şubeye atanmış olmalı)
    const inManagersBranch = existing
      ? existing.primary_location_id === auth.location_id || String(existing.assigned_location_ids ?? "").includes(`"${auth.location_id}"`)
      : primaryLocId === auth.location_id;
    if (auth.role === "manager" && auth.location_id && !inManagersBranch) {
      return NextResponse.json({ error: "Sadece kendi şubenize hesap oluşturabilirsiniz" }, { status: 403 });
    }
    // Bölge yöneticisi sadece sorumlu olduğu şubelere hesap açar
    if (auth.role === "supervisor" && !isSupervisor && (!primaryLocId || managerOutsideBranch(auth, primaryLocId))) {
      return NextResponse.json({ error: "Sadece sorumlu olduğunuz şubelere hesap oluşturabilirsiniz" }, { status: 403 });
    }

    // Yöneticinin ne yapabileceği (lib/userAccess); departman şefinin departmanı şubeye ait olmalı
    const permissions = isEmployee ? null : normalizeAccess(body.access);
    const accessDept = parseAccess(permissions)?.department_id;
    if (accessDept) {
      const dept = await db.prepare("SELECT id FROM departments WHERE id = ? AND location_id = ?").get(accessDept, primaryLocId);
      if (!dept) return NextResponse.json({ error: "Departman bu şubede bulunamadı" }, { status: 400 });
    }

    const tempPassword = generateTempPassword();
    const username = await generateUsername(db, name);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const now = Math.floor(Date.now() / 1000);
    const userId = `U-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Yöneticinin eklediği hesap da direkt aktif (kullanıcı kararı 2026-10-03); onay sadece
    // kendi kendine kayıt bağlantısıyla gelenlerde (/api/self-signup) kalır
    const approvalStatus = "active";

    // Personnel kaydı da oluştur (employee rolü için)
    let personnelId: string | null = existing?.id ?? null;
    if (isEmployee && !existing) {
      const newRoles: string[] = Array.isArray(body.roles) ? body.roles.filter((r: unknown) => typeof r === "string" && r.trim()) : [];
      const employeeId = `EMP-${Math.floor(10000 + Math.random() * 90000)}`;
      personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await db.prepare(`
        INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, department_id, assigned_department_ids, user_access_level, name, employee_id, phone, email, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0, 0, 14, ?, '{}', '[]', '[]', '[]', ?, ?)
      `).run(
        personnelId, auth.org_id,
        primaryLocId ?? "",
        JSON.stringify(effLocIds),
        effDeptIds[0] ?? null,
        JSON.stringify(effDeptIds),
        name.trim(), employeeId, phone?.trim() ?? "", email?.trim()?.toLowerCase() ?? null,
        // Ayrı unvan alanı yok: ilk görev (rol) unvan olarak görünür
        newRoles[0] ?? (title?.trim() || null),
        employment_type ?? "full_time",
        max_weekly_hours ? Number(max_weekly_hours) : defaultWeeklyHours(employment_type),
        JSON.stringify(newRoles),
        now, now
      );
    }

    try {
      await db.prepare(`
        INSERT INTO users (id, personnel_id, username, email, phone, password_hash, role, display_title, org_id, location_id, department_id, name, is_temp_password, approval_status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, ?, ?, ?)
      `).run(userId, personnelId, username, (email ?? existing?.email)?.trim()?.toLowerCase() || null, (phone ?? existing?.phone)?.trim() || null, passwordHash, role ?? "employee", display_title ?? null, auth.org_id, primaryLocId ?? null, effDeptIds[0] ?? department_id ?? null, name.trim(), approvalStatus, auth.id, now);
    } catch (userInsertErr) {
      // users INSERT başarısız olduysa orphan personnel kaydını temizle (var olan personele dokunulmaz)
      if (personnelId && !existing) {
        await db.prepare("DELETE FROM personnel WHERE id = ?").run(personnelId).catch(() => undefined);
      }
      throw userInsertErr;
    }

    if (isSupervisor) {
      await db.prepare("UPDATE users SET managed_location_ids = ? WHERE id = ?").run(JSON.stringify(managedIds), userId);
    }
    if (permissions) {
      await db.prepare("UPDATE users SET permissions = ? WHERE id = ?").run(permissions, userId);
    }

    // Departman müdürü ise departments tablosunu güncelle
    const primaryDeptId = effDeptIds[0] ?? department_id;
    if (primaryDeptId && (display_title === "Departman Müdürü" || role === "manager")) {
      await db.prepare("UPDATE departments SET manager_id = ? WHERE id = ?").run(userId, primaryDeptId);
    }

    // Otomatik davet token'ı oluştur
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteId = `IT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await db.prepare(`
      INSERT INTO invite_tokens (id, token, user_id, org_id, location_id, role, invited_name, created_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(inviteId, inviteToken, userId, auth.org_id, primaryLocId ?? null, role ?? "employee", name.trim(), auth.id, now + 7 * 24 * 3600, now);
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        username,
        name: name.trim(),
        role: role ?? "employee",
        display_title: display_title ?? null,
        approval_status: approvalStatus,
      },
      credentials: {
        username,
        temp_password: tempPassword,
      },
      inviteToken,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/users?id=xxx — onayla / reddet / güncelle
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

  const db = getDB();
  try {
    const target = await db.prepare("SELECT * FROM users WHERE id = ? AND org_id = ?").get(id, auth.org_id) as any;
    if (!target) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    const body = await req.json();
    const now = Math.floor(Date.now() / 1000);

    // Patron dışındakiler: sadece kendi hesabı ya da kapsamındaki, kendinden alt roldeki hesaplar
    const RANK: Record<string, number> = { employee: 0, manager: 1, supervisor: 2, admin: 3 };
    // Şube müdürü kendi şubesindeki departman şeflerini yönetir (yetki, unvan, çalışana döndürme)
    const targetIsChef = target.role === "manager" && !!parseAccess(target.permissions)?.department_id;
    const managesChef = isBranchManager(auth) && targetIsChef && target.location_id === auth.location_id;
    if (auth.role !== "admin" && target.id !== auth.id && !managesChef) {
      if ((RANK[target.role] ?? 0) >= (RANK[auth.role] ?? 0) || managerOutsideBranch(auth, target.location_id)) {
        return NextResponse.json({ error: "Bu hesabı değiştirme yetkiniz yok" }, { status: 403 });
      }
    }
    if (managesChef && (body.scope_location_ids !== undefined || body.managed_location_ids !== undefined || body.approval_status !== undefined)) {
      return NextResponse.json({ error: "Bu değişikliği işletme sahibi yapar" }, { status: 403 });
    }
    // Rol değişikliğini sadece patron, bölge yöneticisi ve şube müdürü yapar (departman şefi yapamaz)
    const canChangeRoles = auth.role === "admin" || auth.role === "supervisor" || isBranchManager(auth);
    if ((body.make_manager !== undefined || body.make_employee !== undefined || body.access !== undefined) && !canChangeRoles) {
      return NextResponse.json({ error: "Yetki değişikliğini şube müdürü ya da işletme sahibi yapar" }, { status: 403 });
    }

    // Yönetici vardiyaya da girsin mi (kişinin kartındaki "Vardiya planına dahil"). Çalışan kaydı yoksa
    // ilk açılışta oluşturulur; kapatınca kayıt kalır, sadece plana girmez (personnel.schedulable).
    if (body.schedulable !== undefined) {
      if (!canChangeRoles) return NextResponse.json({ error: "Bu değişikliği şube müdürü ya da işletme sahibi yapar" }, { status: 403 });
      if (target.role !== "manager" && target.role !== "admin") {
        return NextResponse.json({ error: "Bu ayar yöneticiler içindir" }, { status: 400 });
      }
      const on = body.schedulable === true;
      if (target.personnel_id) {
        await db.prepare("UPDATE personnel SET schedulable = ?, status = 'active', updated_at = ? WHERE id = ? AND org_id = ?").run(on, now, target.personnel_id, auth.org_id);
      } else if (on) {
        const locId = target.location_id;
        if (!locId || managerOutsideBranch(auth, locId)) return NextResponse.json({ error: "Önce kişinin şubesi seçilmeli" }, { status: 400 });
        const org = await db.prepare("SELECT plan FROM organizations WHERE id = ?").get(auth.org_id) as any;
        const maxPersonnel = getPlan(org?.plan).maxPersonnel;
        if (maxPersonnel !== null) {
          const cnt = ((await db.prepare("SELECT COUNT(*) as cnt FROM personnel WHERE org_id = ? AND status != 'inactive'").get(auth.org_id)) as any).cnt;
          if (cnt >= maxPersonnel) return NextResponse.json({ error: limitMessage("personnel"), upgrade: true }, { status: 402 });
        }
        const personnelId = `P-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        await db.prepare(`
          INSERT INTO personnel (id, org_id, primary_location_id, assigned_location_ids, department_id, user_access_level, name, employee_id, email, phone, title, employment_type, status, max_weekly_hours, prev_score, hero_count, no_show_count, late_count, annual_leave_days_total, roles, role_levels, preferred_shift_ids, preferred_days, preferred_roles, schedulable, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'full_time', 'active', ?, 0, 0, 0, 0, 14, '[]', '{}', '[]', '[]', '[]', true, ?, ?)
        `).run(personnelId, auth.org_id, locId, JSON.stringify([locId]), target.department_id ?? null, target.role, target.name, `EMP-${Math.floor(Math.random() * 90000) + 10000}`,
          target.email ?? null, target.phone ?? "", defaultWeeklyHours("full_time"), now, now);
        await db.prepare("UPDATE users SET personnel_id = ? WHERE id = ?").run(personnelId, id);
      }
      return NextResponse.json({ success: true });
    }

    // Ekipten birini yönetici / departman şefi yap: hesap ve geçmiş korunur (personel kaydı kalır)
    if (body.make_manager !== undefined) {
      if (target.role !== "employee" || !target.personnel_id) {
        return NextResponse.json({ error: "Sadece ekipteki bir çalışan yönetici yapılabilir" }, { status: 400 });
      }
      const p = await db.prepare("SELECT primary_location_id, department_id FROM personnel WHERE id = ? AND org_id = ?").get(target.personnel_id, auth.org_id) as any;
      const locId = p?.primary_location_id ?? target.location_id;
      if (!locId || managerOutsideBranch(auth, locId)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      const mm = body.make_manager ?? {};
      const deptId = typeof mm.department_id === "string" && mm.department_id ? mm.department_id : null;
      // Şube müdürü sadece departman şefi atar (şube müdürünü işletme sahibi atar)
      if (isBranchManager(auth) && (!deptId || locId !== auth.location_id)) {
        return NextResponse.json({ error: "Şube müdürü sadece kendi şubesine departman şefi atayabilir" }, { status: 403 });
      }
      if (deptId) {
        const ok = await db.prepare("SELECT id FROM departments WHERE id = ? AND location_id = ?").get(deptId, locId);
        if (!ok) return NextResponse.json({ error: "Departman bu şubede bulunamadı" }, { status: 400 });
      }
      const permissions = normalizeAccess({ mode: mm.mode, department_id: deptId });
      const title = typeof mm.display_title === "string" && mm.display_title.trim() ? mm.display_title.trim() : (deptId ? "Şef" : "Yönetici");
      await db.prepare("UPDATE users SET role = 'manager', location_id = ?, department_id = COALESCE(?, department_id), display_title = ?, permissions = ?, managed_location_ids = NULL WHERE id = ?")
        .run(locId, deptId, title, permissions, id);
      // Yönetici varsayılan olarak vardiya yazılmaz (kullanıcı kararı); kartındaki anahtarla plana alınır
      await db.prepare("UPDATE personnel SET user_access_level = 'manager', schedulable = false WHERE id = ?").run(target.personnel_id);
      if (deptId && p?.department_id !== deptId) {
        // Şef kendi departmanının ekibinde görünsün
        await db.prepare("UPDATE personnel SET department_id = ?, assigned_department_ids = ? WHERE id = ?").run(deptId, JSON.stringify([deptId]), target.personnel_id);
      }
      return NextResponse.json({ success: true });
    }

    // Yöneticiyi çalışana döndür (ör. şef değişti): ekipteki kaydı varsa çalışan olarak devam eder
    if (body.make_employee === true) {
      if (target.role !== "manager" && target.role !== "supervisor") return NextResponse.json({ error: "Kişi zaten çalışan" }, { status: 400 });
      if (!target.personnel_id) {
        return NextResponse.json({ error: "Bu yöneticinin ekipte çalışan kaydı yok; hesabı silinebilir" }, { status: 400 });
      }
      await db.prepare("UPDATE users SET role = 'employee', permissions = NULL, display_title = NULL, managed_location_ids = NULL WHERE id = ?").run(id);
      // Çalışan her zaman plandadır (vardiya dışı kalma sadece yöneticiler için)
      await db.prepare("UPDATE personnel SET user_access_level = 'employee', schedulable = true WHERE id = ?").run(target.personnel_id);
      await db.prepare("UPDATE departments SET manager_id = NULL WHERE manager_id = ?").run(id);
      return NextResponse.json({ success: true });
    }

    // Bölge müdürünün sorumlu şubeleri: sadece patron (değişiklik bir sonraki girişte geçerli olur)
    if (body.managed_location_ids !== undefined) {
      if (auth.role !== "admin" || target.role !== "supervisor") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const want = Array.isArray(body.managed_location_ids) ? body.managed_location_ids.map(String) : [];
      const ok = want.length
        ? await db.prepare(`SELECT id FROM locations WHERE org_id = ? AND id IN (${want.map(() => "?").join(",")})`).all(auth.org_id, ...want) as { id: string }[]
        : [];
      if (!want.length || ok.length !== want.length) return NextResponse.json({ error: "En az bir geçerli şube seçin" }, { status: 400 });
      await db.prepare("UPDATE users SET managed_location_ids = ? WHERE id = ?").run(JSON.stringify(want), id);
    }

    // Yöneticinin kapsamı (sadece patron): tek şube = şube yöneticisi (manager), birden çok = bölge yöneticisi
    // (supervisor). Rol değişikliği kişinin bir sonraki girişinde geçerli olur.
    if (body.scope_location_ids !== undefined) {
      if (auth.role !== "admin" || (target.role !== "manager" && target.role !== "supervisor")) {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const want: string[] = Array.isArray(body.scope_location_ids) ? [...new Set<string>(body.scope_location_ids.map(String))] : [];
      const ok = want.length
        ? await db.prepare(`SELECT id FROM locations WHERE org_id = ? AND id IN (${want.map(() => "?").join(",")})`).all(auth.org_id, ...want) as { id: string }[]
        : [];
      if (!want.length || ok.length !== want.length) return NextResponse.json({ error: "En az bir geçerli şube seçin" }, { status: 400 });
      if (want.length === 1) {
        await db.prepare("UPDATE users SET role = 'manager', location_id = ?, managed_location_ids = NULL WHERE id = ?").run(want[0], id);
        // Şube değiştiyse eski şubenin departman kapsamı geçersiz olur
        const cur = parseAccess(target.permissions);
        if (cur?.department_id && want[0] !== target.location_id) {
          await db.prepare("UPDATE users SET permissions = ? WHERE id = ?").run(normalizeAccess({ mode: cur.mode }), id);
        }
      } else {
        await db.prepare("UPDATE users SET role = 'supervisor', location_id = NULL, department_id = NULL, managed_location_ids = ? WHERE id = ?").run(JSON.stringify(want), id);
        // Departman şefliği tek şubeye bağlıdır; birden çok şubeye çıkan yönetici departman kapsamını kaybeder
        const cur = parseAccess(target.permissions);
        if (cur?.department_id) await db.prepare("UPDATE users SET permissions = ? WHERE id = ?").run(normalizeAccess({ mode: cur.mode }), id);
      }
    }

    // Yöneticinin ne yapabileceği: patron herkes için, bölge yöneticisi kapsamındaki şube yöneticileri için
    // (yukarıdaki rütbe/kapsam kontrolü). Bir sonraki girişte geçerli olur.
    if (body.access !== undefined) {
      if (target.role !== "manager" && target.role !== "supervisor") {
        return NextResponse.json({ error: "Yetki sadece yöneticilere verilir" }, { status: 400 });
      }
      if (managesChef && !parseAccess(body.access)?.department_id) {
        return NextResponse.json({ error: "Şube müdürü şefin departmanını kaldıramaz" }, { status: 403 });
      }
      const permissions = normalizeAccess(body.access);
      const dept = parseAccess(permissions)?.department_id;
      if (dept) {
        const ok = target.role === "manager" && target.location_id
          ? await db.prepare("SELECT id FROM departments WHERE id = ? AND location_id = ?").get(dept, target.location_id)
          : null;
        if (!ok) return NextResponse.json({ error: "Departman yöneticinin şubesinde bulunamadı" }, { status: 400 });
      }
      await db.prepare("UPDATE users SET permissions = ? WHERE id = ?").run(permissions, id);
    }

    if (body.approval_status !== undefined) {
      // Onay/red işlemi — sadece admin/supervisor yapabilir
      if (auth.role !== "admin" && auth.role !== "supervisor") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      await db.prepare("UPDATE users SET approval_status = ?, approved_by = ?, approved_at = ? WHERE id = ?")
        .run(body.approval_status, auth.id, now, id);
    }

    if (body.name !== undefined || body.phone !== undefined || body.location_id !== undefined || body.department_id !== undefined || body.display_title !== undefined) {
      const fields: string[] = [];
      const vals: any[] = [];
      if (body.name !== undefined) { fields.push("name = ?"); vals.push(body.name); }
      if (body.phone !== undefined) { fields.push("phone = ?"); vals.push(body.phone); }
      if (body.location_id !== undefined) { fields.push("location_id = ?"); vals.push(body.location_id); }
      if (body.department_id !== undefined) { fields.push("department_id = ?"); vals.push(body.department_id); }
      if (body.display_title !== undefined) { fields.push("display_title = ?"); vals.push(body.display_title); }
      vals.push(id);
      await db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/users?id=xxx — hesap sil (sadece admin/supervisor)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor" && auth.role !== "manager") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
  if (id === auth.id) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz" }, { status: 400 });

  const db = getDB();
  try {
    const target = await db.prepare("SELECT id, role, location_id FROM users WHERE id = ? AND org_id = ?").get(id, auth.org_id) as { id: string; role: string; location_id: string | null } | undefined;
    if (!target) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }
    // Bölge müdürü: patronu ya da başka bölge müdürünü silemez, sadece kapsamındaki şubelerin hesaplarını
    if (auth.role === "supervisor") {
      if (target.role === "admin" || target.role === "supervisor" || managerOutsideBranch(auth, target.location_id)) {
        return NextResponse.json({ error: "Bu hesabı silme izniniz yok" }, { status: 403 });
      }
    }
    // Müdür: sadece kendi şubesindeki personel hesabı, "personnel_delete" izniyle (lib/ruleLocks)
    if (auth.role === "manager") {
      if (target.role !== "employee" || target.location_id !== auth.location_id
          || !(await hasLocationPermission(db, auth, auth.location_id, "personnel_delete"))) {
        return NextResponse.json({ error: "Bu hesabı silme izniniz yok" }, { status: 403 });
      }
    }
    await db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

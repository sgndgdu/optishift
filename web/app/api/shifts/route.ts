/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { db as drizzleDb } from "@/lib/db";
import { scoreAdjustments } from "@/lib/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { trNum } from "@/lib/format";
import { canPublishPlan } from "@/lib/userAccess";
import { recomputeLocationFairness } from "@/lib/scoring";
import { businessToday, getWeekStart } from "@/lib/date";
import { type ShiftDef } from "@/lib/fairness";
import { performCheckIn, performCheckOut } from "@/lib/checkin";
import { checkHandoverGate } from "@/lib/handover";
import { finalizeShiftId, loadLocDefs, syncDraftWeek } from "@/lib/draftSync";
import { canActOnPersonnel, canEditPublishedWeek, canManageLocation, canManageLocations, managerOutsideBranch, departmentPersonnelIds } from "@/lib/access";

// Lokasyonun shift_definitions listesini yükler (cache'li kullanım için).
// shift_id "custom"/boş gelen atamaları sunucuda saate göre gerçek tanıma bağlarız —
// client'ta tanımlar geç yüklendiyse (race) veri yine de doğru yazılır.
// GET: Personelin vardiyalarını getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const week_start = searchParams.get("week_start");
  const location_id = searchParams.get("location_id");

  const db = getDB();
  try {
    let rows: any[] = [];
    if (personnel_id && week_start) {
      // Personel kendi vardiyasını görür; başka birininkini sadece aynı şubedeyse (takas teklifi için)
      // ve sadece o şubedeki yayınlanmış vardiyalarını görür. Şube görünümü (location_id) zaten
      // şubenin yayınlanmış planını personele açıyor, bu aynı kapsamın kişi bazlı hali.
      let colleagueLocation: string | null = null;
      if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
        const mate = auth.location_id ? await db.prepare(
          `SELECT id FROM personnel WHERE id = ? AND org_id = ? AND primary_location_id = ?`
        ).get(personnel_id, auth.org_id, auth.location_id) : null;
        if (!mate) {
          return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }
        colleagueLocation = auth.location_id;
      } else if (auth.role !== "employee") {
        // Yönetici: kişi işletmede ve kapsamındaki şubede olmalı (lib/access)
        if (!(await canActOnPersonnel(db, auth, personnel_id))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT s.*, l.name as location_name, dp.name as department_name
        FROM shift_assignments s
        LEFT JOIN locations l ON s.location_id = l.id
        LEFT JOIN departments dp ON dp.id = s.department_id
        WHERE s.personnel_id = ? AND s.week_start = ?
      `).all(personnel_id, week_start);
      if (colleagueLocation) {
        rows = rows
          .filter((r: any) => r.location_id === colleagueLocation)
          .map((r: any) => ({
            id: r.id, personnel_id: r.personnel_id, location_id: r.location_id, location_name: r.location_name,
            week_start: r.week_start, day: r.day, shift_id: r.shift_id, start_time: r.start_time, end_time: r.end_time,
            kind: r.kind, publication_status: r.publication_status,
          }));
      }
      // Employee: only published shifts
      if (auth.role === "employee") {
        rows = rows.filter((r: any) => !r.publication_status || r.publication_status === "published");
      }
    } else if (personnel_id) {
      if (!(await canActOnPersonnel(db, auth, personnel_id))) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT s.*, l.name as location_name
        FROM shift_assignments s
        LEFT JOIN locations l ON s.location_id = l.id
        WHERE s.personnel_id = ?
      `).all(personnel_id);
      // Employee: only published shifts
      if (auth.role === "employee") {
        rows = rows.filter((r: any) => !r.publication_status || r.publication_status === "published");
      }
    } else if (location_id && week_start) {
      // Lokasyonun bu org'a ait olduğunu doğrula
      const loc = await db.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ?").get(location_id, auth.org_id);
      if (!loc || managerOutsideBranch(auth, location_id)) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      // Ekip üyesi sadece çalıştığı şubenin planını görür, giriş-çıkış gibi ayrıntılar olmadan (eskiden işletmedeki
      // her şubenin tüm satırları geliyordu; tam test 2026-10-05)
      if (auth.role === "employee") {
        const me = auth.personnel_id ? await db.prepare(
          `SELECT primary_location_id, assigned_location_ids FROM personnel WHERE id = ? AND org_id = ?`
        ).get(auth.personnel_id, auth.org_id) as any : null;
        let mine: string[] = [];
        try { const a = Array.isArray(me?.assigned_location_ids) ? me.assigned_location_ids : JSON.parse(String(me?.assigned_location_ids ?? "[]")); mine = Array.isArray(a) ? a.map(String) : []; } catch { mine = []; }
        if (![auth.location_id, me?.primary_location_id, ...mine].includes(location_id)) {
          return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }
      }
      rows = await db.prepare(`
        SELECT s.*, l.name as location_name
        FROM shift_assignments s
        LEFT JOIN locations l ON s.location_id = l.id
        WHERE s.location_id = ? AND s.week_start = ?
      `).all(location_id, week_start);
      // Employee: only published shifts
      if (auth.role === "employee") {
        rows = rows
          .filter((r: any) => !r.publication_status || r.publication_status === "published")
          .map((r: any) => r.personnel_id === auth.personnel_id ? r : ({
            id: r.id, personnel_id: r.personnel_id, location_id: r.location_id, location_name: r.location_name,
            week_start: r.week_start, day: r.day, shift_id: r.shift_id, start_time: r.start_time, end_time: r.end_time,
            kind: r.kind, publication_status: r.publication_status, department_id: r.department_id,
          }));
      }
    } else {
      rows = [];
    }
    // İcap nöbeti satırları sadece isteyen ekranlara gider (Vardiya Planı, portal ana sayfa/takvim);
    // eski ekranlar kişi-gün başına tek satır varsayıyor
    if (searchParams.get("include_on_call") !== "1") {
      rows = rows.filter((r: any) => r.kind !== "on_call");
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Vardiya ataması yap (Çakışma Kontrolü ile)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = getDB();
  try {
    const body = await req.json();
    // body can be a single shift or an array of shifts
    const shifts = Array.isArray(body) ? body : (body.shifts ?? [body]);
    const forcePublish: boolean = !Array.isArray(body) && body.force === true;

    if (shifts.length === 0) {
      return NextResponse.json({ error: "Vardiya verisi boş" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const results: any[] = [];
    const errors: string[] = [];
    const compensations: { personnel_id: string; points: number }[] = [];
    // Telafi olayı yazılan lokasyonlar — dönüş öncesi kümülatif skorları tazelenir
    const compAffectedLocations = new Set<string>();
    // Force assignment detection: items collected during transaction, processed after
    const forceItems: { personnel_id: string; location_id: string; week_start: string; day: number; shift_id_db: number; start_time: string | null; end_time: string | null; prevForceStatus: string | null }[] = [];

    // Lokasyon shift tanımlarını önbelleğe al (shift_id çözümlemesi için)
    const defsCache = new Map<string, ShiftDef[]>();
    const getLocDefs = async (locId: string): Promise<ShiftDef[]> => {
      if (!defsCache.has(locId)) defsCache.set(locId, await loadLocDefs(db, locId));
      return defsCache.get(locId)!;
    };

    // Lokasyon kurallarını önbelleğe al (async)
    const rulesCache = new Map<string, any>();
    const getLocRules = async (locId: string): Promise<any> => {
      if (rulesCache.has(locId)) return rulesCache.get(locId)!;
      let rules: any = {};
      try {
        const row = await db.prepare("SELECT rules FROM locations WHERE id = ?").get(locId) as any;
        rules = JSON.parse(row?.rules || "{}");
      } catch { /* varsayılan */ }
      rulesCache.set(locId, rules);
      return rules;
    };
    const getCompPoints = async (locId: string): Promise<number> => {
      const r = await getLocRules(locId);
      return typeof r.change_compensation_points === "number" ? r.change_compensation_points : 2;
    };
    const getMinRestMin = async (locId: string): Promise<number> => {
      const r = await getLocRules(locId);
      return (typeof r.min_rest_hours === "number" ? r.min_rest_hours : 11) * 60;
    };

    // Görev/Kontrol Listeleri (rules.task_management_enabled): yeni vardiya
    // atanınca locations.task_templates'ten shift_tasks'a otomatik kopyalanır.
    const taskTemplatesCache = new Map<string, Record<string, string[]>>();
    const getTaskTemplates = async (locId: string): Promise<Record<string, string[]>> => {
      if (taskTemplatesCache.has(locId)) return taskTemplatesCache.get(locId)!;
      let templates: Record<string, string[]> = {};
      try {
        const row = await db.prepare("SELECT task_templates FROM locations WHERE id = ?").get(locId) as any;
        templates = JSON.parse(row?.task_templates || "{}");
      } catch { /* varsayılan */ }
      taskTemplatesCache.set(locId, templates);
      return templates;
    };
    const copyTaskTemplateIfEnabled = async (locId: string, shiftAssignmentId: number, shiftDefId: string) => {
      const rules = await getLocRules(locId);
      if (!rules?.task_management_enabled) return;
      const templates = await getTaskTemplates(locId);
      const taskList = templates[shiftDefId] ?? templates["*"] ?? [];
      for (const desc of taskList) {
        if (!desc || !desc.trim()) continue;
        await db.prepare(`
          INSERT INTO shift_tasks (org_id, location_id, shift_assignment_id, task_description, is_completed, created_at)
          VALUES (?, ?, ?, ?, false, ?)
        `).run(auth.org_id, locId, shiftAssignmentId, desc.trim(), now);
      }
    };

    const todayStr = businessToday();
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

    // ── Toplu ön okuma (eskiden satır başına ~7 sorgu vardı; 25 satırlık yayın 26 sn sürüyordu) ──
    const valid = shifts.filter((x: any) => x?.personnel_id && x?.location_id && x?.week_start && x?.day !== undefined);

    // Yetki: her şube isteği yapanın işletmesinde ve yönetebildiği şube olmalı; kişiler işletmenin personeli olmalı.
    // Yayınlanmış haftayı müdür ancak patron onayıyla değiştirir (lib/access).
    if (!(await canManageLocations(db, auth, valid.map((x: any) => String(x.location_id))))) {
      return NextResponse.json({ error: "Bu şubede işlem yetkiniz yok" }, { status: 403 });
    }
    // Departman şefi sadece kendi ekibine vardiya yazar
    for (const l of new Set(valid.map((x: any) => String(x.location_id)))) {
      const scopeIds = await departmentPersonnelIds(db, auth, l as string);
      if (scopeIds && valid.some((x: any) => String(x.location_id) === l && !scopeIds.includes(String(x.personnel_id)))) {
        return NextResponse.json({ error: "Sadece kendi departmanınızın planını düzenleyebilirsiniz" }, { status: 403 });
      }
    }
    // "Planı yayınlama" yetkisi yoksa (lib/userAccess): taslak yazar, yayınlayamaz ve yayınlanmış satıra dokunamaz
    if (!canPublishPlan(auth) && valid.some((x: any) => (x.publication_status ?? "published") === "published")) {
      return NextResponse.json({ error: "Planı yayınlama yetkiniz yok. Hazırladığınız planı sorumlunuza onaya gönderin." }, { status: 403 });
    }
    const vPids = [...new Set(valid.map((x: any) => String(x.personnel_id)))] as string[];
    if (vPids.length) {
      const own = await db.prepare(`SELECT COUNT(*) AS n FROM personnel WHERE org_id = ? AND id IN (${vPids.map(() => "?").join(",")})`)
        .get(auth.org_id, ...vPids) as any;
      if (Number(own?.n ?? 0) !== vPids.length) {
        return NextResponse.json({ error: "Personel bu işletmeye ait değil" }, { status: 403 });
      }
    }
    for (const lw of new Set(valid.map((x: any) => `${x.location_id}|${x.week_start}`))) {
      const [l, w] = (lw as string).split("|");
      if (!(await canEditPublishedWeek(db, auth, l, w))) {
        return NextResponse.json({ error: "Yayınlanmış haftayı değiştirmek için hesap sahibi onayı gerekiyor" }, { status: 403 });
      }
    }
    const pidList = [...new Set(valid.map((x: any) => String(x.personnel_id)))] as string[];
    const weekList = [...new Set(valid.map((x: any) => String(x.week_start)))] as string[];
    const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");
    const rowKey = (pid: string, ws: string, d: number, k: string) => `${pid}|${ws}|${d}|${k}`;

    // Bu kişilerin bu haftalardaki satırları: dinlenme kontrolü ve mevcut satır (eskisi gibi ilk satır)
    const current = new Map<string, any>();
    if (pidList.length && weekList.length) {
      const rows = await db.prepare(`
        SELECT id, personnel_id, location_id, week_start, day, start_time, end_time, publication_status,
               force_acceptance_status, COALESCE(kind, 'regular') AS kind
        FROM shift_assignments
        WHERE personnel_id IN (${inList(pidList.length)}) AND week_start IN (${inList(weekList.length)})
          AND status != 'swapped' AND status != 'absent'
        ORDER BY id
      `).all(...pidList, ...weekList) as any[];
      for (const r of rows) {
        const k = rowKey(r.personnel_id, r.week_start, Number(r.day), r.kind);
        if (!current.has(k)) current.set(k, r);
      }
    }

    // Uygunluk ve onaylı izinler (zorunlu atama tespiti)
    const availByKey = new Map<string, any>();
    const leavesByPid = new Map<string, { start_date: string; end_date: string }[]>();
    if (pidList.length && weekList.length) {
      const av = await db.prepare(`
        SELECT * FROM availability WHERE personnel_id IN (${inList(pidList.length)}) AND week_start IN (${inList(weekList.length)})
      `).all(...pidList, ...weekList) as any[];
      for (const a of av) { const k = `${a.personnel_id}|${a.week_start}`; if (!availByKey.has(k)) availByKey.set(k, a); }
      const lv = await db.prepare(`
        SELECT personnel_id, start_date, end_date FROM leave_requests
        WHERE status = 'approved' AND personnel_id IN (${inList(pidList.length)})
      `).all(...pidList) as any[];
      for (const l of lv) (leavesByPid.get(l.personnel_id) ?? leavesByPid.set(l.personnel_id, []).get(l.personnel_id)!).push(l);
    }

    // Güncellemeler toplanır, döngü sonunda tek UPDATE ile yazılır
    const pendingUpdates: { id: number; shift_id: string; start: string | null; end: string | null; pub: string; dept: string | null }[] = [];
    const publishedGroups = new Set<string>(); // location|week: yayından sonra artık taslak kopyalar silinir

    for (const shift of shifts) {
        const { personnel_id, location_id, week_start, day, shift_id, start_time, end_time } = shift;
        // İcap nöbeti ayrı satır: aynı gün normal vardiyayla birlikte olabilir, dinlenme kuralına girmez
        const kind: "regular" | "on_call" = shift.kind === "on_call" ? "on_call" : "regular";
        // Çok departmanlı kişinin bu vardiyadaki departmanı (null: ana departmanı)
        const deptId: string | null = typeof shift.department_id === "string" && shift.department_id ? shift.department_id : null;

        if (!personnel_id || !location_id || !week_start || day === undefined) {
          errors.push("Eksik veri: personnel_id, location_id, week_start, day zorunlu");
          continue;
        }

        // shift_id güvencesi: "custom"/boş geldiyse saate göre gerçek tanıma bağla
        const finalShiftId = finalizeShiftId(shift_id, start_time, end_time, await getLocDefs(location_id));

        // 1. 11 SAAT DİNLENME KURALI KONTROLÜ (force=true ise uyar ama bloklamaz)
        if (start_time && end_time && kind === "regular") {
          const newStart = toMin(start_time);
          const newEnd   = toMin(end_time);
          const minRest = await getMinRestMin(location_id);

          // Önceki gün vardiyası (aynı partide az önce güncellenen saatler dahil)
          const prevShift = day > 0 ? current.get(rowKey(personnel_id, week_start, day - 1, "regular")) : null;
          if (prevShift?.end_time && prevShift?.start_time) {
            const prevEnd = toMin(prevShift.end_time);
            const prevEndAdj = prevEnd <= toMin(prevShift.start_time) ? prevEnd + 1440 : prevEnd;
            const gap = (newStart + 1440) - prevEndAdj;
            if (gap < minRest) {
              const msg = `${personnel_id} için iki vardiya arası ${trNum(Math.round(gap / 60 * 10) / 10)} saat, en az ${minRest / 60} olmalı.`;
              if (!forcePublish) { errors.push(msg); continue; }
              else errors.push(msg);
            }
          }

          // Sonraki gün vardiyası
          const nextShift = day < 6 ? current.get(rowKey(personnel_id, week_start, day + 1, "regular")) : null;
          if (nextShift?.start_time) {
            const nextStart = toMin(nextShift.start_time);
            const curEndAdj = newEnd <= newStart ? newEnd + 1440 : newEnd;
            const gap = (nextStart + 1440) - curEndAdj;
            if (gap < minRest) {
              const msg = `${personnel_id} için ertesi günkü vardiyayla arası ${trNum(Math.round(gap / 60 * 10) / 10)} saat, en az ${minRest / 60} olmalı.`;
              if (!forcePublish) { errors.push(msg); continue; }
              else errors.push(msg);
            }
          }
        }

        // 2. ÇAKIŞMA KONTROLÜ (Aynı gün başka şubede mesaisi var mı?)
        const key = rowKey(personnel_id, week_start, day, kind);
        const existing = current.get(key);
        const pubStatus = shift.publication_status ?? "published";

        if (existing) {
          // Kendi şubesi için zaten yazılmışsa sadece update edeceğiz (override).
          // Eğer BAŞKA şube yazmışsa engelle.
          if (existing.location_id !== location_id) {
            errors.push(`Personel (ID: ${personnel_id}) o gün başka bir şubede görevli.`);
            continue;
          }
          // Yayın sonrası değişiklik tespiti: yayınlanmış vardiyanın saati değişiyorsa
          // personele telafi puanı yazılır (predictability pay analoğu — OPTI-023)
          const timeChanged =
            existing.publication_status === "published" &&
            (existing.start_time !== (start_time || null) || existing.end_time !== (end_time || null));

          pendingUpdates.push({ id: existing.id, shift_id: finalShiftId, start: start_time || null, end: end_time || null, pub: pubStatus, dept: deptId });
          if (pubStatus === "published") publishedGroups.add(`${location_id}|${week_start}`);

          if (timeChanged && pubStatus === "published") {
            // Sadece bugün veya gelecekteki vardiyalar için telafi (geçmiş düzeltmeleri hariç)
            const shiftDate = new Date(`${week_start}T00:00:00`);
            shiftDate.setDate(shiftDate.getDate() + day);
            const compEnabled = ((await getLocRules(location_id))?.change_compensation_enabled !== false);
            if (shiftDate.toISOString().split("T")[0] >= todayStr && compEnabled) {
              const compPts = await getCompPoints(location_id);
              if (compPts > 0) {
                // Telafi bir puan OLAYIDIR: score_adjustments'a yazılır, kümülatif
                // skor recompute ile güncellenir — prev_score'a doğrudan += yok.
                await drizzleDb.insert(scoreAdjustments).values({
                  org_id: auth.org_id,
                  location_id,
                  personnel_id,
                  type: "change_comp",
                  points: compPts,
                  week_start,
                  ref_id: String(existing.id),
                  note: `Yayın sonrası saat değişikliği: ${existing.start_time}–${existing.end_time} → ${start_time}–${end_time}`,
                  created_by: auth.id,
                });
                compAffectedLocations.add(location_id);
                await db.prepare(`
                  INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
                  VALUES (?, 'alert', 'Vardiyanız güncellendi', ?, '/portal/calendar', false, ?)
                `).run(
                  personnel_id,
                  `Yayınlanmış vardiyanın saati ${existing.start_time}–${existing.end_time} → ${start_time}–${end_time} olarak değişti. Bu değişiklik için Adalet Puanınıza +${compPts} puan eklendi.`,
                  now
                );
                compensations.push({ personnel_id, points: compPts });
              }
            }
          }

          current.set(key, { ...existing, start_time: start_time || null, end_time: end_time || null, publication_status: pubStatus });
          results.push({ id: existing.id, updated: true });
          forceItems.push({ personnel_id, location_id, week_start, day, shift_id_db: existing.id, start_time: start_time || null, end_time: end_time || null, prevForceStatus: existing.force_acceptance_status ?? null });
          continue;
        }

        // Çakışma yoksa yeni kayıt oluştur
        const result = await db.prepare(`
          INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, status, publication_status, published_at, kind, department_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)
        `).run(personnel_id, location_id, week_start, day, finalShiftId, start_time || null, end_time || null, pubStatus, pubStatus === "published" ? now : null, kind, deptId, now);

        const newId = Number(result.lastInsertRowid);
        current.set(key, { id: newId, personnel_id, location_id, week_start, day, start_time: start_time || null, end_time: end_time || null, publication_status: pubStatus, force_acceptance_status: null, kind });
        if (pubStatus === "published") publishedGroups.add(`${location_id}|${week_start}`);
        results.push({ id: newId, inserted: true });
        if (kind === "regular") await copyTaskTemplateIfEnabled(location_id, newId, finalShiftId);
        forceItems.push({ personnel_id, location_id, week_start, day, shift_id_db: newId, start_time: start_time || null, end_time: end_time || null, prevForceStatus: null });
    }

    // Toplu UPDATE (500'lük parçalar)
    for (let i = 0; i < pendingUpdates.length; i += 500) {
      const chunk = pendingUpdates.slice(i, i + 500);
      const vals: unknown[] = [];
      const tuples = chunk.map(u => { vals.push(u.id, u.shift_id, u.start, u.end, u.pub, u.dept); return "(?::int, ?::text, ?::text, ?::text, ?::text, ?::text)"; });
      await db.prepare(`
        UPDATE shift_assignments AS sa
        SET shift_id = v.shift_id, start_time = v.start_time, end_time = v.end_time, status = 'scheduled',
            publication_status = v.pub, department_id = v.dept,
            published_at = CASE WHEN v.pub = 'published' THEN COALESCE(sa.published_at, ?::bigint) ELSE sa.published_at END
        FROM (VALUES ${tuples.join(", ")}) AS v(id, shift_id, start_time, end_time, pub, dept)
        WHERE sa.id = v.id
      `).run(now, ...vals);
    }

    // Aynı kişi-gün-tür için kalmış taslak kopyalar (eşzamanlı kayıt artığı) yayından sonra silinir
    for (const g of publishedGroups) {
      const [locId, ws] = g.split("|");
      await db.prepare(`
        DELETE FROM shift_assignments d
        WHERE d.location_id = ? AND d.week_start = ? AND d.publication_status = 'draft'
          AND EXISTS (
            SELECT 1 FROM shift_assignments p
            WHERE p.location_id = d.location_id AND p.week_start = d.week_start AND p.personnel_id = d.personnel_id
              AND p.day = d.day AND COALESCE(p.kind, 'regular') = COALESCE(d.kind, 'regular')
              AND p.publication_status = 'published')
      `).run(locId, ws);
    }

    // ── Force Assignment Detection ──────────────────────────────────────────

    const forceNotifications: { personnel_id: string; shift_id_db: number; points: number; dateLabel: string; timeStr: string }[] = [];

    for (const item of forceItems) {
      // Zaten pending/accepted/rejected → tekrar flaglama
      if (item.prevForceStatus) continue;

      // Uygunluk kontrolü
      const isUnavailable = availByKey.get(`${item.personnel_id}|${item.week_start}`)?.[`day_${item.day}`] === "unavailable";

      // İzin kontrolü
      const shiftDate = new Date(`${item.week_start}T00:00:00`);
      shiftDate.setDate(shiftDate.getDate() + item.day);
      const shiftDateStr = shiftDate.toISOString().split("T")[0];
      const onLeave = (leavesByPid.get(item.personnel_id) ?? []).some(l => l.start_date <= shiftDateStr && l.end_date >= shiftDateStr);

      if (!isUnavailable && !onLeave) continue;

      // force_bonus_multiplier kolonu artık düz bonus PUANI tutar (çarpan değil), 0 = kapalı
      const rules = await getLocRules(item.location_id);
      const forceBonusPoints = typeof rules?.force_bonus_points === "number" ? rules.force_bonus_points : 5;

      await db.prepare(`
        UPDATE shift_assignments
        SET force_assigned = true, force_acceptance_status = 'pending', force_bonus_multiplier = ?
        WHERE id = ?
      `).run(forceBonusPoints, item.shift_id_db);

      const DAY_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
      const dateLabel = `${DAY_TR[item.day]} ${shiftDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`;
      const timeStr = item.start_time && item.end_time ? ` ${item.start_time}–${item.end_time}` : "";
      forceNotifications.push({ personnel_id: item.personnel_id, shift_id_db: item.shift_id_db, points: forceBonusPoints, dateLabel, timeStr });
    }

    for (const fn of forceNotifications) {
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'force_assign', 'Zorunlu Atama Talebi', ?, '/portal/requests', false, ?)
      `).run(
        fn.personnel_id,
        `Sorumlunuz sizi ${fn.dateLabel}${fn.timeStr} vardiyasına atadı. O gün izinli olduğunuz için onayınız gerekiyor. Kabul ederseniz +${fn.points} puan alırsınız.`,
        now,
      );
    }

    // Telafi olayları yazıldıysa kümülatif skorları (prev_score önbelleği) tazele
    for (const locId of compAffectedLocations) {
      await recomputeLocationFairness(auth.org_id, locId, getWeekStart());
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: "Bazı atamalarda çakışma oldu", details: errors, results, compensations }, { status: 409 });
    }

    return NextResponse.json({ success: true, results, compensations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Bulk publish a draft week OR giriş/çıkış a single shift
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const body = await req.json();
    const { action } = body;

    // ── Bulk publish: draft → published ─────────────────────────────
    if (action === "publish_week") {
      if (auth.role === "employee" || !canPublishPlan(auth)) {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const { location_id, week_start } = body;
      if (!location_id || !week_start) {
        return NextResponse.json({ error: "location_id ve week_start zorunlu" }, { status: 400 });
      }
      if (!(await canManageLocation(db, auth, location_id))) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      if (!(await canEditPublishedWeek(db, auth, location_id, week_start))) {
        return NextResponse.json({ error: "Yayınlanmış haftayı değiştirmek için hesap sahibi onayı gerekiyor" }, { status: 403 });
      }
      // Departman şefi sadece kendi ekibinin taslağını yayınlar
      const scopeIds = await departmentPersonnelIds(db, auth, location_id);
      if (scopeIds && scopeIds.length === 0) return NextResponse.json({ success: true, updated: 0 });
      const scopeSql = scopeIds ? ` AND personnel_id IN (${scopeIds.map(() => "?").join(",")})` : "";
      const info = await db.prepare(`
        UPDATE shift_assignments SET publication_status = 'published',
          published_at = COALESCE(published_at, ?)
        WHERE location_id = ? AND week_start = ? AND publication_status = 'draft'${scopeSql}
      `).run(Math.floor(Date.now() / 1000), location_id, week_start, ...(scopeIds ?? []));
      return NextResponse.json({ success: true, updated: info.changes });
    }

    // ── Taslak otomatik kayıt: haftanın draft satırlarını tam senkronla ──
    // OPTI-024: client cellMap'in güncel halini gönderir; draft satırlar
    // silinip yeniden yazılır (lokalde silinen hücre DB'den de silinir).
    // Yayınlanmış satırlara dokunulmaz — onların değişikliği "Yayınla" ile gider.
    if (action === "sync_draft_week") {
      if (auth.role === "employee") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      const { location_id, week_start, shifts } = body;
      if (!location_id || !week_start || !Array.isArray(shifts)) {
        return NextResponse.json({ error: "location_id, week_start ve shifts zorunlu" }, { status: 400 });
      }
      if (!(await canManageLocation(db, auth, location_id))) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      // Departman şefi sadece kendi ekibinin taslağını yazar (lib/access)
      const scopeIds = await departmentPersonnelIds(db, auth, location_id);
      const synced = await syncDraftWeek(db, location_id, week_start, shifts, scopeIds);
      // Şef planı değiştirdiyse önceki "onaya gönderildi" kaydı düşer (yeniden göndermeli)
      if (scopeIds) {
        await db.prepare("DELETE FROM plan_submissions WHERE location_id = ? AND week_start = ? AND department_id = ?")
          .run(location_id, week_start, auth.access?.department_id ?? "");
      }
      return NextResponse.json({ success: true, synced });
    }

    // ── Giriş ─────────────────────────────────────────────────────
    if (action === "check_in") {
      const { shift_id, lat, lon, acknowledge_handover_id } = body;
      if (!shift_id) {
        return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
      }
      // rules.handover_log_enabled açıksa: bekleyen (okunmamış) bir devir-teslim
      // notu varsa girişi başlatmadan durdur — istemci notu gösterip
      // acknowledge_handover_id ile tekrar denemeli (bkz. lib/handover.ts).
      const pendingHandover = await checkHandoverGate(db, {
        shiftAssignmentId: shift_id,
        acknowledgeHandoverId: acknowledge_handover_id ?? null,
      });
      if (pendingHandover) {
        return NextResponse.json(
          { error: "Önce devir-teslim notunu okuyup onaylamanız gerekiyor", pending_handover: pendingHandover },
          { status: 428 }
        );
      }
      const outcome = await performCheckIn(db, auth.org_id, {
        shiftId: shift_id,
        lat, lon,
        // Employee sadece kendi vardiyasını giriş yapabilir
        restrictPersonnelId: auth.role === "employee" ? (auth.personnel_id ?? undefined) : undefined,
      });
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      return NextResponse.json({ success: true, check_in_distance_m: outcome.check_in_distance_m, check_in_verified: outcome.check_in_verified });
    }

    // ── Çıkış ────────────────────────────────────────────────────
    if (action === "check_out") {
      const { shift_id, handover_note } = body;
      if (!shift_id) {
        return NextResponse.json({ error: "shift_id zorunlu" }, { status: 400 });
      }
      const outcome = await performCheckOut(db, auth.org_id, {
        shiftId: shift_id,
        handoverNote: handover_note,
        restrictPersonnelId: auth.role === "employee" ? (auth.personnel_id ?? undefined) : undefined,
      });
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveHardDayRules, weekDayExtraPoints, type Rules as FairnessRules } from "@/lib/fairness";
import { addDays, businessToday } from "@/lib/date";
import { applyOverrides, sanitizeOverrides } from "@/lib/planOverrides";
import { isModuleOn } from "@/lib/moduleVisibility";
import { hasSubDepartments } from "@/lib/departments";
import { getDB } from "@/lib/db/client";
import { db as drizzleDb, departments as departmentsTable } from "@/lib/db";
import { eq } from "drizzle-orm";
import { logPlatformEvent } from "@/lib/platform-logger";
import { recomputeYtdOvertime, upsertPendingOvertime } from "@/lib/overtime";
import { industryFromRules, applyCertificationShield, type PersonDocument } from "@/lib/templates";
import { weekStates } from "@/lib/workCycle";
import { loadImplicitPrefs } from "@/lib/implicitPrefsData";
import { departmentInBranch, departmentsInBranch, plannedInBranch } from "@/lib/branchRotation";
import { assignmentWorkMinutes, effectiveWeeklyLimit, isNightTime, netWorkMinutes } from "@/lib/legal";

// Railway'de çalışan FastAPI engine servisinin URL'i
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";
const ENGINE_TIMEOUT_MS = 55_000;

async function callEngine(payload: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS);

  try {
    const engineSecret = process.env.ENGINE_SHARED_SECRET;
    const res = await fetch(`${ENGINE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(engineSecret ? { "x-engine-secret": engineSecret } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // FastAPI hataları {"detail": "..."} şeklinde gelir — kullanıcıya ham JSON göstermek yerine mesajı ayıkla
      let message = text || `Engine HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.detail === "string") message = parsed.detail;
      } catch {
        /* JSON değilse ham metni kullan */
      }
      throw new Error(message);
    }
    return await res.json();
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(
        "Plan hazırlama beklenenden uzun sürdü. Birkaç saniye sonra tekrar deneyin."
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type GenerateResult = { status: number; body: any };

/**
 * Motor girdisini DB'den kurar, motoru çağırır, sonucu döner. TEK KAYNAK:
 * /api/generate (müdür) ve otomatik pilot (lib/autopilot, cron) aynı yolu kullanır.
 * `body`: fixed_assignments, current_assignments, scenario (isteğe bağlı).
 */
export async function generatePlan(orgIdIn: string, branchId: string, week_start: string, body: any): Promise<GenerateResult> {
  try {
    const db = getDB();

    // Location'ı DB'den çek ve org'a ait olduğunu doğrula
    const locationRow = (await db
      .prepare(`SELECT * FROM locations WHERE id = $1 AND org_id = $2`)
      .get(branchId, orgIdIn)) as any;
    if (!locationRow) {
      return { status: 403, body: { error: "Erişim reddedildi" } };
    }
    const orgId: string = orgIdIn;

    // Shift tanımlarını parse et; yoksa 2-vardiyalı varsayılan modeli kullan
    const defaultShifts = [
      { name: "Sabah", start: "08:00", end: "16:00", base_points: 3 },
      { name: "Akşam", start: "16:00", end: "00:00", base_points: 5 },
    ];
    let shiftsPayload = defaultShifts;
    if (locationRow?.shift_definitions) {
      try {
        const defs = JSON.parse(locationRow.shift_definitions);
        if (Array.isArray(defs) && defs.length > 0) {
          shiftsPayload = defs.map((d: any) => ({
            id: String(d.id ?? d.name ?? ""),
            name: String(d.name ?? "Vardiya"),
            start: String(d.start ?? "08:00"),
            end: String(d.end ?? "16:00"),
            base_points: Number(d.base_points ?? 5),
            is_night: isNightTime(d.start, d.end), // tek kural lib/legal (elle işaret kaldırıldı)
            on_call: !!d.on_call,
            driving_hours: Number(d.driving_hours) > 0 ? Number(d.driving_hours) : 0,
            // Mola (dk): girilmediyse null, motor yasal asgariyi uygular (lib/legal breakMinutes ile aynı)
            break_minutes: typeof d.break_minutes === "number" && d.break_minutes >= 0 ? d.break_minutes : null,
            // Departman şefinin planında şube geneli "en az N yetkinlikli" kuralı uygulanmaz: yetkinlikli kişi
            // çoğu zaman başka departmandadır; kuralı şube yöneticisi yayın kontrolünde görür.
            // Zorunlu görev kuralı Görevler'le birlikte kaldırıldı (2026-10-05): eski kayıtlı kural gizli kısıt olmasın
            required_skills: [],
          }));
        }
      } catch {
        /* parse hatası → varsayılan shifts kullan */
      }
    }

    // Departmanları çek (departman bazlı kapasite matrisi için).
    // /api/departments (frontend'in kullandığı, kanıtlanmış çalışan yol) ile aynı
    // Drizzle sorgusu kullanılıyor — buradaki raw SQL uyumluluk katmanı üzerinden
    // sessizce yutulan bir hata departmanlı lokasyonlarda departmentRows'un boş
    // dönmesine ve locations.demand_matrix'in (hayalet talep) tekrar motora
    // gönderilmesine yol açıyordu.
    let departmentRows: any[] = [];
    try {
      departmentRows = await drizzleDb
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.location_id, branchId));
    } catch (err) {
      console.error("[/api/generate] departments sorgusu başarısız:", err);
    }

    // Aktif ve planlanabilir personeli çek (vardiya yapmayan yönetici: personnel.schedulable = false, kişinin kartından)
    const allPersonnelRows = (await db
      .prepare(
        `SELECT * FROM personnel WHERE assigned_location_ids LIKE $1 AND status = 'active' AND schedulable IS NOT FALSE`
      )
      .all(`%"${branchId}"%`)) as any[];
    // Şube rotasyonu (lib/branchRotation): rotasyonu olan kişi o hafta sadece sırası gelen şubeye yazılır
    const personnelRows = allPersonnelRows.filter((p: any) => plannedInBranch(p.branch_rotation, branchId, week_start));

    // Uygunluk verilerini çek
    const personnelIds = personnelRows.map((p: any) => p.id);
    let availabilityRows: any[] = [];
    if (personnelIds.length > 0) {
      const placeholders = personnelIds.map((_: any, i: number) => `$${i + 1}`).join(",");
      availabilityRows = (await db
        .prepare(
          `SELECT * FROM availability WHERE personnel_id IN (${placeholders}) AND week_start = $${personnelIds.length + 1}`
        )
        .all(...personnelIds, week_start)) as any[];
    }

    // Onaylı izin taleplerini çek
    let approvedLeaveRows: any[] = [];
    if (personnelIds.length > 0) {
      try {
        const weekEndDate = new Date(week_start + "T00:00:00Z");
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const week_end = weekEndDate.toISOString().split("T")[0];
        const placeholders = personnelIds.map((_: any, i: number) => `$${i + 1}`).join(",");
        approvedLeaveRows = (await db
          .prepare(
            `SELECT personnel_id, start_date, end_date
             FROM leave_requests
             WHERE personnel_id IN (${placeholders})
               AND status = 'approved'
               AND start_date <= $${personnelIds.length + 1}
               AND end_date >= $${personnelIds.length + 2}`
          )
          .all(...personnelIds, week_end, week_start)) as any[];
      } catch {
        /* leave_requests tablosu yoksa atla */
      }
    }

    // prevScores
    const prevScores: Record<string, number> = {};
    for (const p of personnelRows) {
      prevScores[p.id] = p.prev_score ?? 0;
    }

    // YTD mesai önbelleğini tazele (yıl devrilmesi dahil) — motor YTD hard cap'i
    // taze değerle kursun diye bayat personnel cache'ine güvenilmez
    let ytdFresh: Record<string, number> = {};
    try {
      ytdFresh = await recomputeYtdOvertime(orgIdIn, personnelRows.map((p: any) => p.id));
    } catch (e) {
      console.error("[generate] YTD mesai recompute hatası:", e);
    }

    // Personel verisini formatla
    // Görevler 2026-10-05'te kaldırıldı (kullanıcı kararı): motor kişiyi sadece departmanlarıyla tanır.
    // Paylaşılan personel: her şubede o şubenin departmanı (lib/branchRotation departmentInBranch).
    // Birden çok departmanı olan kişi o departmanların hepsinin ihtiyacına yazılabilir (department_ids).
    const branchDeptIds = new Set<string>(departmentRows.map((d: any) => d.id));
    const leafDeptIds = new Set<string>(departmentRows.filter((d: any) => !hasSubDepartments(departmentRows, d.id)).map((d: any) => d.id));
    for (const p of personnelRows as any[]) {
      p.department_ids = departmentsInBranch(p, branchDeptIds).filter(id => leafDeptIds.has(id));
      p.department_id = departmentInBranch(p, branchDeptIds);
    }
    let personnelData = personnelRows.map((p: any) => {
      return {
        id: p.id,
        name: p.name,
        skills: [] as string[],
        night_restriction: p.night_restriction ?? null,
        department_id: p.department_id ?? null,
        department_ids: (p.department_ids ?? []) as string[],
        prev_score: prevScores[p.id] ?? 0,
        cumulative_burden: prevScores[p.id] ?? 0,
        employment_type: p.employment_type || "full_time",
        max_weekly_hours: p.max_weekly_hours ?? 45,
        hourly_wage: typeof p.hourly_wage === "number" && p.hourly_wage > 0 ? p.hourly_wage : 0,
        min_weekly_hours: p.min_weekly_hours ?? 0,
        branch_ids: JSON.parse(p.assigned_location_ids || "[]"),
        org_id: p.org_id,
        role_level: "secondary",
        ytd_overtime_hours: ytdFresh[p.id] ?? p.ytd_overtime_hours ?? 0,
      };
    });

    const parseAvail = (val: any) => {
      if (!val) return "available";
      if (typeof val === "string" && val.startsWith("{")) {
        try {
          return JSON.parse(val);
        } catch {
          return "available";
        }
      }
      return val;
    };

    // Gün durumu + (varsa) personelin girdiği saat aralığı. Motor "Uygun" günde aralığı kesin,
    // "Esnek" günde yumuşak uygular; aralık yoksa gün tümüyle uygun sayılır.
    const withWindow = (status: any, start: any, end: any) => {
      if (typeof status !== "string" || status === "unavailable") return status;
      if (typeof start === "string" && typeof end === "string" && start && end) return { status, start, end };
      return status;
    };
    const availabilityData: Record<string, any> = {};
    for (const av of availabilityRows) {
      const days: Record<number, any> = {};
      for (let d = 0; d < 7; d++) days[d] = withWindow(parseAvail(av[`day_${d}`]), av[`day_${d}_start`], av[`day_${d}_end`]);
      availabilityData[av.personnel_id] = days;
    }

    // Haftalık sabit izin günleri
    for (const p of personnelRows) {
      if (p.weekly_off_day !== null && p.weekly_off_day !== undefined) {
        const d = Number(p.weekly_off_day);
        if (d >= 0 && d <= 6) {
          if (!availabilityData[p.id]) availabilityData[p.id] = {};
          availabilityData[p.id][d] = "unavailable";
        }
      }
    }

    // Onaylı izin günleri
    const wsDate = new Date(week_start + "T00:00:00Z");
    for (const leave of approvedLeaveRows) {
      const pid = leave.personnel_id;
      const leaveStart = new Date(leave.start_date + "T00:00:00Z");
      const leaveEnd = new Date(leave.end_date + "T00:00:00Z");
      if (!availabilityData[pid]) availabilityData[pid] = {};
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(wsDate);
        dayDate.setDate(wsDate.getDate() + d);
        if (dayDate >= leaveStart && dayDate <= leaveEnd) {
          availabilityData[pid][d] = "unavailable";
        }
      }
    }

    // Paylaşılan personel (kullanıcı kararı 2026-10-04): kişinin AYNI haftada başka şubelerdeki vardiyaları
    // (taslak dahil). O gün bu şubede planlanmaz; süresi haftalık sınırından düşülür (saat şubeler arasında toplanır).
    const otherBranchMinutes: Record<string, number> = {};
    if (personnelIds.length > 0) {
      try {
        const ph = personnelIds.map((_: any, i: number) => `$${i + 3}`).join(",");
        const rows = (await db.prepare(
          `SELECT personnel_id, day, start_time, end_time FROM shift_assignments
           WHERE week_start = $1 AND location_id <> $2 AND COALESCE(kind, 'regular') = 'regular' AND personnel_id IN (${ph})`
        ).all(week_start, branchId, ...personnelIds)) as any[];
        for (const r of rows) {
          const d = Number(r.day);
          if (!(d >= 0 && d <= 6)) continue;
          if (!availabilityData[r.personnel_id]) availabilityData[r.personnel_id] = {};
          availabilityData[r.personnel_id][d] = "unavailable";
          const [sh, sm] = String(r.start_time ?? "").split(":").map(Number);
          const [eh, em] = String(r.end_time ?? "").split(":").map(Number);
          if ([sh, sm, eh, em].some(Number.isNaN)) continue;
          let dur = (eh * 60 + em) - (sh * 60 + sm);
          if (dur <= 0) dur += 1440;
          // Diğer şubenin tanımı burada yok: yasal asgari mola düşülür
          otherBranchMinutes[r.personnel_id] = (otherBranchMinutes[r.personnel_id] ?? 0) + netWorkMinutes(dur);
        }
      } catch (e) {
        console.error("[generate] diğer şube vardiyaları okunamadı:", e);
      }
    }

    // Kapasite matrisi (departmansız lokasyonlar / eski format).
    // Lokasyonda departman satırları varsa bu alan motora GÖNDERİLMEZ — talep artık
    // departments.demand_matrix üzerinden yönetiliyor (bkz. CLAUDE.md §3.B). Aksi halde
    // departmanlar eklenmeden önce girilmiş eski/artık veri, kullanıcının schedule
    // sayfasında hiç görmediği "hayalet" bir exact_coverage kısıtı olarak motora gidip
    // gereksiz INFEASIBLE sonuçlarına yol açıyordu.
    // hasDepartments: departmentRows sorgusu (geçici bir sebeple) boş dönerse bile,
    // personelin department_id'si varsa yine de departmanlı say — flat matrisi
    // yanlışlıkla tekrar göndermeyi engelleyen ikinci bir güvenlik katmanı.
    const hasDepartments =
      departmentRows.length > 0 || personnelData.some((p) => !!p.department_id);
    // Departmanlı şubede departmanı seçilmemiş kişi hiçbir departmanın ihtiyacına sayılmaz;
    // motora gidince ihtiyaç tablosunun dışında her gün fazladan yazılıyordu.
    // Kullanıcı kararı (2026-10-03): otomatik plana alınmaz, ekranda uyarılır.
    // Departman şefi (lib/userAccess): sadece kendi departmanının ekibi ve ihtiyacı planlanır;
    // diğer departmanlara dokunulmaz (değer route'ta oturumdan gelir, istemciden değil).
    // Departman şefinin kapsamı: kendi departmanı + alt departmanları (route oturumdan hesaplar, lib/access)
    const onlyDepts: string[] | null = Array.isArray(body?.only_department_ids) && body.only_department_ids.length ? body.only_department_ids : null;
    // Alt departmanı olan departmana doğrudan bağlı kişi de departmansız sayılır: ihtiyaç alt departmanlarda (lib/departments)
    const groupDeptIds = new Set<string>(departmentRows.filter((d: any) => hasSubDepartments(departmentRows, d.id)).map((d: any) => d.id));
    const noDept = (p: { department_id: string | null }) => !p.department_id || groupDeptIds.has(p.department_id);
    const excludedNoDepartment = departmentRows.length > 0
      ? personnelData.filter((p) => noDept(p) && (!onlyDepts || (p.department_id && onlyDepts.includes(p.department_id)))).map((p) => ({ id: p.id, name: p.name }))
      : [];
    if (departmentRows.length > 0) personnelData = personnelData.filter((p) => !noDept(p));
    if (onlyDepts) {
      personnelData = personnelData.filter((p) => !!p.department_id && onlyDepts.includes(p.department_id))
        .map((p) => ({ ...p, department_ids: p.department_ids.filter((id) => onlyDepts.includes(id)) }));
      departmentRows = departmentRows.filter((d: any) => onlyDepts.includes(d.id));
    }
    let demandMatrixPayload: Record<string, Record<string, number>> = {};
    if (locationRow?.demand_matrix && !hasDepartments) {
      try {
        const parsed = JSON.parse(locationRow.demand_matrix);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          demandMatrixPayload = parsed;
        }
      } catch {
        /* parse hatası */
      }
    }

    // Departman bazlı kapasite matrisi — schedule sayfası departmanlı lokasyonlarda
    // talebi buraya (departments.demand_matrix) kaydediyor, motora burada aktarılır.
    const departmentDemandMatrixPayload: Record<string, Record<string, Record<string, number>>> = {};
    const departmentNamesPayload: Record<string, string> = {};
    for (const dept of departmentRows) {
      departmentNamesPayload[dept.id] = dept.name ?? dept.id;
      // Alt departmanı olanın kendi tablosu gitmez (eski "hayalet talep" olmasın; ihtiyaç alt departmanlarda)
      if (!dept?.demand_matrix || groupDeptIds.has(dept.id)) continue;
      try {
        const parsed = JSON.parse(dept.demand_matrix);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
          departmentDemandMatrixPayload[dept.id] = parsed;
        }
      } catch {
        /* parse hatası */
      }
    }

    // Kural toggle'ları
    let maxConsecutiveDays = 6;
    let noNightToMorning = false;
    let preferredNotMultiplier = 1.5;
    let clopeningMinRestHours = 13;
    let overtimeThresholdHours = 45.0;
    let maxYtdOvertimeHours = 270.0;
    let overtimeFairDistribution = true;
    let overtimeTrackingEnabled = true;
    let personnelConflictsEnabled = true;
    let complianceTrackingEnabled = false; // varsayılan kapalı — ileri seviye modül
    let balancingPeriodWeeks = 0;
    let ruleMaxWeeklyHours = 45;
    let maxOnCallPerWeek = 3; // icap nöbeti: kişi başı haftalık üst sınır
    let ruleMinRestHours = 11;
    let weekendMultiplierEnabled = true;
    let nightMultiplierEnabled = true;
    let preferredNotEnabled = true;
    let clopeningEnabled = true;
    let clopeningPenaltyWeight = 30;
    let weekendMultiplier = 1.2;
    let nightMultiplier = 1.3;
    if (locationRow?.rules) {
      try {
        const pr = JSON.parse(locationRow.rules);
        if (typeof pr?.max_consecutive_days === "number")
          maxConsecutiveDays = pr.max_consecutive_days;
        noNightToMorning = !!pr?.no_night_to_morning;
        if (typeof pr?.preferred_not_multiplier === "number")
          preferredNotMultiplier = pr.preferred_not_multiplier;
        if (typeof pr?.clopening_min_rest_hours === "number")
          clopeningMinRestHours = pr.clopening_min_rest_hours;
        if (typeof pr?.overtime_threshold_hours === "number")
          overtimeThresholdHours = pr.overtime_threshold_hours;
        if (typeof pr?.max_ytd_overtime_hours === "number")
          maxYtdOvertimeHours = pr.max_ytd_overtime_hours;
        if (typeof pr?.overtime_fair_distribution === "boolean")
          overtimeFairDistribution = pr.overtime_fair_distribution;
        overtimeTrackingEnabled = isModuleOn(pr, "overtime_tracking_enabled");
        personnelConflictsEnabled = isModuleOn(pr, "personnel_conflicts_enabled");
        if (pr?.compliance_tracking_enabled === true) complianceTrackingEnabled = true;
        if (typeof pr?.balancing_period_weeks === "number")
          balancingPeriodWeeks = Math.max(0, Math.min(8, Math.round(pr.balancing_period_weeks)));
        if (typeof pr?.max_weekly_hours === "number")
          ruleMaxWeeklyHours = pr.max_weekly_hours;
        if (typeof pr?.max_on_call_per_week === "number")
          maxOnCallPerWeek = Math.max(0, Math.min(7, Math.round(pr.max_on_call_per_week)));
        if (typeof pr?.min_rest_hours === "number")
          ruleMinRestHours = pr.min_rest_hours;
        if (typeof pr?.weekend_multiplier_enabled === "boolean")
          weekendMultiplierEnabled = pr.weekend_multiplier_enabled;
        if (typeof pr?.night_multiplier_enabled === "boolean")
          nightMultiplierEnabled = pr.night_multiplier_enabled;
        if (typeof pr?.preferred_not_enabled === "boolean")
          preferredNotEnabled = pr.preferred_not_enabled;
        if (typeof pr?.clopening_enabled === "boolean")
          clopeningEnabled = pr.clopening_enabled;
        if (typeof pr?.clopening_penalty_weight === "number")
          clopeningPenaltyWeight = pr.clopening_penalty_weight;
        if (typeof pr?.weekend_multiplier === "number")
          weekendMultiplier = pr.weekend_multiplier;
        if (typeof pr?.night_multiplier === "number")
          nightMultiplier = pr.night_multiplier;
      } catch {
        /* ignore */
      }
    }

    // Belge/Sertifika Uyumluluğu: süresi dolmuş zorunlu belgesi olan personel bu
    // haftaki plana hiç dahil edilmez. Motor bu kuralı bilmez — filtreleme burada,
    // personnelData motora gönderilmeden önce yapılır (bkz. lib/db/schema.ts personnelDocuments).
    let excludedCompliance: { id: string; name: string; doc_type: string; expiry_date: string }[] = [];
    // Sertifika Kalkanı (lib/templates/skills.ts): şubenin sektörü seçiliyse belge→rol
    // bağıyla çalışır; geçersiz belge ilgili rolü kişinin yetkinliklerinden düşürür, motor
    // vardiyanın zorunlu yetkinliğini karşılarken o kişiyi saymaz (kesin kural).
    const revokedSkills: { id: string; name: string; skill: string; document: string; reason: "expired" | "missing" }[] = [];
    const branchIndustry = industryFromRules(locationRow?.rules);
    if (complianceTrackingEnabled && branchIndustry && personnelIds.length > 0) {
      try {
        const placeholders = personnelIds.map((_: any, i: number) => `$${i + 1}`).join(",");
        const docRows = (await db
          .prepare(`SELECT personnel_id, doc_type, expiry_date FROM personnel_documents WHERE personnel_id IN (${placeholders})`)
          .all(...personnelIds)) as any[];
        const docsByPerson = new Map<string, PersonDocument[]>();
        for (const row of docRows) {
          const list = docsByPerson.get(row.personnel_id) ?? [];
          list.push({ doc_type: row.doc_type, expiry_date: row.expiry_date });
          docsByPerson.set(row.personnel_id, list);
        }
        // Belge planlanan haftanın SONUNA kadar geçerli olmalı: hafta ortasında biten
        // kimlik kartıyla hafta sonu vardiyası yazılmasın
        const weekEnd = new Date(new Date(week_start + "T00:00:00Z").getTime() + 6 * 86400_000).toISOString().slice(0, 10);
        const blocked = new Set<string>();
        for (const p of personnelData) {
          const res = applyCertificationShield(branchIndustry, p.skills ?? [], docsByPerson.get(p.id) ?? [], weekEnd);
          if (res.blockedBy) {
            blocked.add(p.id);
            excludedCompliance.push({
              id: p.id, name: p.name,
              doc_type: res.blockedBy.reason === "missing" ? `${res.blockedBy.document} (girilmemiş)` : res.blockedBy.document,
              expiry_date: res.blockedBy.expiry ?? "",
            });
            continue;
          }
          for (const r of res.revoked) revokedSkills.push({ id: p.id, name: p.name, ...r });
          p.skills = res.skills;
        }
        personnelData = personnelData.filter((p) => !blocked.has(p.id));
      } catch (e) {
        console.error("[generate] sertifika kalkanı hatası:", e);
      }
    } else if (complianceTrackingEnabled && personnelIds.length > 0) {
      try {
        const placeholders = personnelIds.map((_: any, i: number) => `$${i + 1}`).join(",");
        const expiredRows = (await db
          .prepare(
            `SELECT personnel_id, doc_type, expiry_date FROM personnel_documents
             WHERE personnel_id IN (${placeholders}) AND expiry_date < $${personnelIds.length + 1}
             ORDER BY expiry_date ASC`
          )
          .all(...personnelIds, week_start)) as any[];
        const expiredByPerson = new Map<string, { doc_type: string; expiry_date: string }>();
        for (const row of expiredRows) {
          if (!expiredByPerson.has(row.personnel_id)) {
            expiredByPerson.set(row.personnel_id, { doc_type: row.doc_type, expiry_date: row.expiry_date });
          }
        }
        if (expiredByPerson.size > 0) {
          excludedCompliance = personnelData
            .filter((p) => expiredByPerson.has(p.id))
            .map((p) => ({ id: p.id, name: p.name, ...expiredByPerson.get(p.id)! }));
          personnelData = personnelData.filter((p) => !expiredByPerson.has(p.id));
        }
      } catch (e) {
        console.error("[generate] uyumluluk filtreleme hatası:", e);
      }
    }

    // Denkleştirme dönemi (İş K. m.63): son N-1 haftanın yayınlanmış saatlerine göre
    // her personelin bu haftaki kalan hakkı hesaplanır. N ardışık haftanın ortalaması
    // max_weekly_hours'u aşamaz; tek hafta tavanı yasal 66 saattir. Kişi bazlı hak,
    // motora max_weekly_hours override'ı olarak gönderilir.
    const BALANCING_SINGLE_WEEK_CAP = 66;
    if (balancingPeriodWeeks >= 2) {
      try {
        const prevWeeks: string[] = [];
        for (let w = 1; w < balancingPeriodWeeks; w++) {
          const d = new Date(week_start + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() - 7 * w);
          prevWeeks.push(d.toISOString().split("T")[0]);
        }
        const ph = prevWeeks.map((_, i) => `$${i + 2}`).join(",");
        const rows = (await db
          .prepare(
            `SELECT personnel_id, shift_id, start_time, end_time FROM shift_assignments
             WHERE location_id = $1 AND week_start IN (${ph}) AND publication_status = 'published'
               AND COALESCE(kind, 'regular') = 'regular'`
          )
          .all(branchId, ...prevWeeks)) as any[];
        const workedMin: Record<string, number> = {};
        for (const r of rows) {
          if (!r.start_time || !r.end_time) continue;
          const [sh, sm] = String(r.start_time).split(":").map(Number);
          const [eh, em] = String(r.end_time).split(":").map(Number);
          if ([sh, sm, eh, em].some(Number.isNaN)) continue;
          workedMin[r.personnel_id] = (workedMin[r.personnel_id] ?? 0) + assignmentWorkMinutes(shiftsPayload as any[], r);
        }
        for (const p of personnelData as any[]) {
          const pMax = p.max_weekly_hours ?? ruleMaxWeeklyHours;
          // Part-time sözleşme limiti (kuraldan düşükse) denkleştirmede de korunur;
          // full-time kişi tek haftada yasal 66'ya kadar esneyebilir.
          const weekCap = pMax < ruleMaxWeeklyHours ? pMax : BALANCING_SINGLE_WEEK_CAP;
          const allowance = ruleMaxWeeklyHours * balancingPeriodWeeks - (workedMin[p.id] ?? 0) / 60;
          p.max_weekly_hours = Math.max(0, Math.floor(Math.min(weekCap, allowance)));
        }
      } catch (e) {
        console.error("[generate] denkleştirme hesabı hatası:", e);
      }
    }

    // Gece koruması: gece kısıtlı personel (gebe/emziren/18 yaş altı/sağlık)
    const nightRestrictedIds = personnelData
      .filter((p: any) => !!p.night_restriction)
      .map((p: any) => p.id);

    // Sosyal kurallar: birlikte çalışamaz çiftleri (rules.personnel_conflicts_enabled kapalıysa motora hiç gönderilmez)
    let conflictPairs: [string, string][] = [];
    if (personnelConflictsEnabled) {
      try {
        const conflictRows = (await db
          .prepare(`SELECT personnel_id_a, personnel_id_b FROM personnel_conflicts WHERE location_id = ? AND org_id = ?`)
          .all(branchId, orgId)) as any[];
        conflictPairs = conflictRows.map(r => [r.personnel_id_a, r.personnel_id_b]);
      } catch (e) {
        console.error("[generate] personnel_conflicts sorgusu hatası:", e);
      }
    }


    // Uyumluluk filtresi TÜM personeli listeden düşürdüyse motoru hiç çağırma —
    // genel "aktif personel bulunamadı" hatası yerine kimin neden dışlandığını
    // gösteren açıklayıcı bir yanıt dön.
    if (personnelData.length === 0 && excludedCompliance.length > 0) {
      return { status: 200, body: {
        error: "Bu haftaki herkesin zorunlu belgesinin süresi dolduğu için plan oluşturulamadı.",
        excluded_compliance: excludedCompliance,
      } };
    }

    // Kapalı günler (Ayarlar → Çalışma saatleri): ihtiyaç tablosu boşken motor bu günlere kimseyi yazmaz
    const closedDays: number[] = [];
    try {
      const hours = locationRow?.operating_hours ? JSON.parse(locationRow.operating_hours) : null;
      for (let d = 0; d < 7; d++) if (hours?.[d]?.isOpen === false) closedDays.push(d);
    } catch { /* bozuk JSON: her gün açık say */ }

    // Müdürün elle düzeltip koruduğu hücreler (Vardiya Planı): motor bunlara dokunmaz.
    // Kişi ve gün doğrulaması motorda (bilinmeyen personel_id yok sayılır).
    const fixedAssignments = Array.isArray(body.fixed_assignments)
      ? body.fixed_assignments.slice(0, 2000).filter((f: any) =>
          f && typeof f.personnel_id === "string" && Number.isInteger(f.day) && f.day >= 0 && f.day <= 6)
      : [];

    // Sürüş süresi (AETR iki haftalık 90 saat): geçen haftanın yayınlanmış direksiyon saati
    const prevWeekDriving: Record<string, number> = {};
    const drivingById = new Map(shiftsPayload.filter((s: any) => s.driving_hours > 0).map((s: any) => [String(s.id), Number(s.driving_hours)]));
    if (drivingById.size > 0) {
      try {
        const pd = new Date(`${week_start}T00:00:00Z`);
        pd.setUTCDate(pd.getUTCDate() - 7);
        const rows = (await db.prepare(
          `SELECT personnel_id, shift_id FROM shift_assignments
           WHERE location_id = $1 AND week_start = $2 AND publication_status = 'published'
             AND COALESCE(kind, 'regular') = 'regular'`
        ).all(branchId, pd.toISOString().slice(0, 10))) as any[];
        for (const r of rows) {
          const h = drivingById.get(String(r.shift_id));
          if (h) prevWeekDriving[r.personnel_id] = (prevWeekDriving[r.personnel_id] ?? 0) + h;
        }
      } catch (e) { console.error("[generate] geçen hafta sürüş sorgusu hatası:", e); }
    }

    // Çalışma döngüsü (rules.work_cycle, lib/workCycle): kişi başı bu haftanın W/D/N/O günleri
    const dayPatterns: Record<string, string[]> = {};
    try {
      const wc = locationRow?.rules ? JSON.parse(locationRow.rules)?.work_cycle : null;
      if (wc) {
        for (const p of personnelData as any[]) {
          const st = weekStates(wc, String(p.id), week_start);
          if (st) dayPatterns[String(p.id)] = st;
        }
      }
    } catch (e) { console.error("[generate] çalışma döngüsü:", e); }

    // Örtük tercihler (lib/implicitPrefs): uygunluk ve takas geçmişinden, açık tercihten zayıf esnek ceza.
    // rules.implicit_preferences_enabled === false ise kapalı.
    const implicitAvoid: Record<string, [number, number, number][]> = {};
    try {
      const lr = locationRow?.rules ? JSON.parse(locationRow.rules) : {};
      if (lr?.implicit_preferences_enabled !== false) {
        const learned = await loadImplicitPrefs(db, (personnelData as any[]).map(p => String(p.id)), week_start);
        const idxById = new Map(shiftsPayload.map((sd: any, i: number) => [String(sd.id), i]));
        for (const [pid, items] of Object.entries(learned)) {
          implicitAvoid[pid] = items.flatMap(it => {
            const idx = it.shiftId === null ? -1 : idxById.get(it.shiftId);
            return idx === undefined ? [] : [[it.day, idx, it.count] as [number, number, number]];
          });
        }
      }
    } catch (e) { console.error("[generate] örtük tercihler:", e); }

    // "Ya şöyle olursa?" senaryosu: kaydetmeden dene. İzin (kişi + günler), yeni personel, ihtiyaç yüzdesi.
    // Senaryoda mesai kaydı yazılmaz; sonuç sadece döner.
    const scenario = body.scenario && typeof body.scenario === "object" ? body.scenario : null;
    if (scenario) {
      for (const a of Array.isArray(scenario.absent) ? scenario.absent : []) {
        if (typeof a?.personnel_id !== "string" || !Array.isArray(a.days)) continue;
        availabilityData[a.personnel_id] ??= {};
        for (const d of a.days) if (Number.isInteger(d) && d >= 0 && d <= 6) availabilityData[a.personnel_id][d] = "unavailable";
      }
      const extra = Math.max(0, Math.min(20, Math.round(Number(scenario.extra_staff) || 0)));
      if (extra > 0) {
        const avgScore = personnelData.length ? personnelData.reduce((t: number, p: any) => t + (p.prev_score || 0), 0) / personnelData.length : 0;
        for (let i = 1; i <= extra; i++) {
          personnelData.push({
            id: `SCN-${i}`, name: `Yeni personel ${i}`, skills: [], night_restriction: null, department_id: null, department_ids: [],
            prev_score: avgScore, cumulative_burden: avgScore, employment_type: "full_time",
            max_weekly_hours: ruleMaxWeeklyHours, hourly_wage: 0, min_weekly_hours: 0, branch_ids: [branchId],
            org_id: orgIdIn, role_level: "secondary", ytd_overtime_hours: 0,
          });
        }
      }
      const pct = Math.max(-90, Math.min(300, Number(scenario.demand_change_pct) || 0));
      if (pct !== 0) {
        const scale = (m: any) => {
          for (const row of Object.values(m ?? {}) as any[]) for (const k of Object.keys(row ?? {})) row[k] = Math.max(0, Math.round(Number(row[k]) * (1 + pct / 100)));
        };
        scale(demandMatrixPayload);
        for (const m of Object.values(departmentDemandMatrixPayload ?? {})) scale(m);
      }
    }

    // Cümleyle plan değiştirme (lib/ai/planInstruct → lib/planOverrides): sorumlunun bu çözüm için ek kısıtları
    const overrides = sanitizeOverrides(body.overrides);
    if (overrides.length) {
      applyOverrides(overrides, {
        availability: availabilityData, fixed: fixedAssignments, personnel: personnelData as any[], conflictPairs,
        demand: demandMatrixPayload, deptDemand: departmentDemandMatrixPayload, shifts: shiftsPayload,
      });
    }

    // Maliyet bütçesi kaldırıldı (kullanıcı kararı 2026-10-06): motora sınır gönderilmez
    const laborBudgetTry = 0;

    // Geçmiş günler (bugünden önce) planlanmaz: kimse yazılmaz, ihtiyaç sayılmaz, kapalı gün sayılır.
    // O günlerdeki mevcut vardiyalar istemciden sabit (fixed) gelir ve haftalık saate sayılır.
    const today = businessToday();
    const pastDays = [0, 1, 2, 3, 4, 5, 6].filter(d => addDays(week_start, d) < today);
    if (pastDays.length === 7) {
      return { status: 400, body: { error: "Bu haftanın tüm günleri geçti, plan sadece bugün ve sonrası için oluşturulur." } };
    }
    if (pastDays.length > 0) {
      const dropPast = (m: any) => { for (const row of Object.values(m ?? {}) as any[]) for (const d of pastDays) if (row) { delete row[d]; delete row[String(d)]; } };
      dropPast(demandMatrixPayload);
      for (const m of Object.values(departmentDemandMatrixPayload ?? {})) dropPast(m);
      for (const p of personnelRows) {
        availabilityData[p.id] ??= {};
        for (const d of pastDays) availabilityData[p.id][d] = "unavailable";
      }
      for (const d of pastDays) if (!closedDays.includes(d)) closedDays.push(d);
    }

    // Başka şubedeki saatler haftalık sınırdan düşülür (şube sınırı üst sınır kuralıyla, lib/legal)
    for (const p of personnelData as any[]) {
      const used = otherBranchMinutes[p.id];
      if (used) p.max_weekly_hours = Math.max(0, Math.floor(effectiveWeeklyLimit(p.max_weekly_hours, ruleMaxWeeklyHours) - used / 60));
    }

    const enginePayload = {
      prevScores,
      labor_budget_try: laborBudgetTry,
      implicit_avoid: implicitAvoid,
      day_patterns: dayPatterns,
      prev_week_driving_hours: prevWeekDriving,
      closed_days: closedDays,
      fixed_assignments: fixedAssignments,
      // En az değişiklik: mevcut plan (istemci gönderirse); motor yer değiştirmeyi cezalandırır
      current_assignments: Array.isArray(body.current_assignments)
        ? body.current_assignments.slice(0, 5000).filter((c: any) => c && typeof c.personnel_id === "string" && Number.isInteger(c.day))
        : [],
      branchId,
      orgId,
      week_start,
      personnel: personnelData,
      availability: availabilityData,
      shifts: shiftsPayload,
      demand_matrix: demandMatrixPayload,
      department_demand_matrix: departmentDemandMatrixPayload,
      department_names: departmentNamesPayload,
      ensure_senior_per_shift: false, // kıdemli kuralı kaldırıldı (2026-10-07)
      max_consecutive_days: maxConsecutiveDays,
      no_night_to_morning: noNightToMorning,
      preferred_not_multiplier: preferredNotMultiplier,
      night_restricted_ids: nightRestrictedIds,
      conflict_pairs: conflictPairs,
      // Arka arkaya iki hafta gece yasağı kaldırıldı (2026-10-07, kullanıcı kararı)
      prev_week_night_ids: [],
      consecutive_night_weeks_enabled: false,
      rules: {
        // Denkleştirme açıkken hafta tavanı yasal 66'ya çıkar — kişi bazlı hak
        // yukarıda max_weekly_hours override'ı olarak zaten daraltıldı
        max_weekly_hours: balancingPeriodWeeks >= 2 ? 66 : ruleMaxWeeklyHours,
        min_rest_hours: ruleMinRestHours,
        clopening_min_rest_hours: clopeningMinRestHours,
        overtime_threshold_hours: overtimeThresholdHours,
        max_ytd_overtime_hours: maxYtdOvertimeHours,
        overtime_fair_distribution: overtimeFairDistribution,
        weekend_multiplier_enabled: weekendMultiplierEnabled,
        night_multiplier_enabled: nightMultiplierEnabled,
        preferred_not_enabled: preferredNotEnabled,
        clopening_enabled: clopeningEnabled,
        clopening_penalty_weight: clopeningPenaltyWeight,
        max_on_call_per_week: maxOnCallPerWeek,
        weekend_multiplier: weekendMultiplier,
        night_multiplier: nightMultiplier,
        // Gece zorluğu vardiya tanımından (base_points) gelir; motorun eski varsayılanı kapatılır (lib/fairness ile aynı)
        hard_shift_night: false,
        // Zor gün puanları web'de çözülür (haftanın günü, resmi tatil, özel gün; lib/fairness), motor hazır sayıyı kullanır
        ...(() => {
          let lr: FairnessRules = {};
          try { lr = locationRow?.rules ? JSON.parse(locationRow.rules) : {}; } catch { /* varsayılan */ }
          return { day_extra_points: weekDayExtraPoints(week_start, lr), pref_not_points: resolveHardDayRules(lr).prefNotPoints };
        })(),
      },
    };

    // FastAPI engine'e HTTP isteği gönder
    const orToolsStart = Date.now();
    const data = await callEngine(enginePayload);
    const orToolsLatency = Date.now() - orToolsStart;

    // OR-Tools çağrısını logla (fire-and-forget)
    const orgRow = (await db.prepare(`SELECT name FROM organizations WHERE id = $1`).get(orgIdIn)) as any;
    logPlatformEvent("or_tools_call", orgIdIn, orgRow?.name ?? null, {
      location_id: branchId,
      week_start,
      personnel_count: personnelData.length,
      latency_ms: orToolsLatency,
    });

    // Python motorundan dönen veriyi UI için eşle
    if (data.personnel) {
      data.personnel = data.personnel.map((p: any) => ({
        ...p,
        roles: p.skills || [],
      }));
    }

    // Motor fazla mesai özeti döndürdüyse overtime_records'a upsert et.
    // Hafta başına tek kayıt: re-generate çift kayıt/çift YTD saymaz; müdürün
    // karara bağladığı kayıtlar ezilmez. Nihai otorite yayın anındaki derive'dır.
    if (!scenario && overtimeTrackingEnabled && Array.isArray(data.overtime_summary) && data.overtime_summary.length > 0) {
      for (const ot of data.overtime_summary) {
        try {
          await upsertPendingOvertime({
            orgId: orgIdIn,
            locationId: branchId,
            personnelId: ot.personnelId,
            personnelName: ot.name ?? null,
            weekStart: week_start,
            scheduledHours: ot.scheduled_hours ?? 0,
            overtimeHours: ot.overtime_hours ?? 0,
            note: "OR-Tools taslağından otomatik hesaplandı",
          });
        } catch (e) {
          console.error("[generate] overtime upsert hatası:", e);
        }
      }
    }

    if (excludedCompliance.length > 0) {
      data.excluded_compliance = excludedCompliance;
    }
    if (excludedNoDepartment.length > 0) {
      data.excluded_no_department = excludedNoDepartment;
    }
    if (revokedSkills.length > 0) {
      data.revoked_skills = revokedSkills;
    }

    return { status: 200, body: data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 500, body: { error: message } };
  }
}


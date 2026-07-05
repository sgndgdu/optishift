import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { personnel, locations, overtimeRecords } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getCompTimeBalanceHours, COMP_TIME_MULTIPLIER } from "@/lib/overtime";

/**
 * GET /api/overtime/me — personelin KENDİ fazla mesai görünümü.
 * Başka personelin kaydı asla serialize edilmez (fairness/me deseni).
 *
 * PATCH /api/overtime/me — personel onayı (İş K. m.41): kendi pending kaydını
 * kabul/red eder; kabul ederken telafi türünü seçer (zamlı ücret | serbest zaman).
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.personnel_id) {
    return NextResponse.json({ error: "Personel hesabı gerekli" }, { status: 403 });
  }

  try {
    const me = (await db
      .select({
        id: personnel.id,
        primary_location_id: personnel.primary_location_id,
        ytd_overtime_hours: personnel.ytd_overtime_hours,
      })
      .from(personnel)
      .where(and(eq(personnel.id, auth.personnel_id), eq(personnel.org_id, auth.org_id))))[0];
    if (!me) return NextResponse.json({ error: "Personel bulunamadı" }, { status: 404 });

    let maxYtd = 270;
    if (me.primary_location_id) {
      const loc = (await db
        .select({ rules: locations.rules })
        .from(locations)
        .where(eq(locations.id, me.primary_location_id)))[0];
      try {
        const rules = typeof loc?.rules === "string" ? JSON.parse(loc.rules) : loc?.rules;
        if (typeof rules?.max_ytd_overtime_hours === "number") maxYtd = rules.max_ytd_overtime_hours;
      } catch { /* geçersiz JSON → varsayılan */ }
    }

    const records = await db
      .select({
        id: overtimeRecords.id,
        week_start: overtimeRecords.week_start,
        scheduled_hours: overtimeRecords.scheduled_hours,
        overtime_hours: overtimeRecords.overtime_hours,
        status: overtimeRecords.status,
        employee_status: overtimeRecords.employee_status,
        compensation_type: overtimeRecords.compensation_type,
        comp_time_used_at: overtimeRecords.comp_time_used_at,
        note: overtimeRecords.note,
        created_at: overtimeRecords.created_at,
      })
      .from(overtimeRecords)
      .where(and(
        eq(overtimeRecords.org_id, auth.org_id),
        eq(overtimeRecords.personnel_id, auth.personnel_id),
      ))
      .orderBy(desc(overtimeRecords.week_start))
      .limit(26);

    const compTimeBalance = await getCompTimeBalanceHours(auth.org_id, auth.personnel_id);

    return NextResponse.json({
      records,
      ytd_overtime_hours: me.ytd_overtime_hours ?? 0,
      max_ytd_overtime_hours: maxYtd,
      comp_time_balance_hours: compTimeBalance,
      comp_time_multiplier: COMP_TIME_MULTIPLIER,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.personnel_id) {
    return NextResponse.json({ error: "Personel hesabı gerekli" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, employee_status, compensation_type } = body as {
    id?: number;
    employee_status?: string;
    compensation_type?: string;
  };
  if (!id || !employee_status || !["accepted", "declined"].includes(employee_status)) {
    return NextResponse.json({ error: "id ve employee_status (accepted|declined) zorunlu" }, { status: 400 });
  }
  const compType = compensation_type ?? "paid";
  if (employee_status === "accepted" && !["paid", "time_off"].includes(compType)) {
    return NextResponse.json({ error: "Geçersiz telafi türü" }, { status: 400 });
  }

  try {
    const record = (await db
      .select({ id: overtimeRecords.id, status: overtimeRecords.status, personnel_id: overtimeRecords.personnel_id })
      .from(overtimeRecords)
      .where(and(eq(overtimeRecords.id, id), eq(overtimeRecords.org_id, auth.org_id))))[0];

    if (!record || record.personnel_id !== auth.personnel_id) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }
    // Müdür karara bağladıktan sonra personel yanıtı kilitlenir
    if (record.status !== "pending") {
      return NextResponse.json({ error: "Bu kayıt karara bağlanmış — yanıt değiştirilemez" }, { status: 409 });
    }

    await db
      .update(overtimeRecords)
      .set({
        employee_status,
        employee_responded_at: Math.floor(Date.now() / 1000),
        ...(employee_status === "accepted" ? { compensation_type: compType } : {}),
      })
      .where(eq(overtimeRecords.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

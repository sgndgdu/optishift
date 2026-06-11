/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { availability } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

// GET: Bir personelin belirli bir hafta müsaitliğini getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const week_start = searchParams.get("week_start");

  if (!personnel_id || !week_start) {
    return NextResponse.json({ error: "personnel_id ve week_start zorunlu" }, { status: 400 });
  }

  // Employee can only read their own availability
  if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const [row] = await db
    .select()
    .from(availability)
    .where(and(eq(availability.personnel_id, personnel_id), eq(availability.week_start, week_start)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ exists: false });
  }

  // Reshape to array format for the UI
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const raw = row[`day_${i}` as keyof typeof row];
    let parsed = raw;
    if (typeof raw === 'string' && raw.startsWith('{')) {
      try { parsed = JSON.parse(raw); } catch (e) {}
    }
    return {
      status: parsed ?? "available",
      start: row[`day_${i}_start` as keyof typeof row] ?? undefined,
      end: row[`day_${i}_end` as keyof typeof row] ?? undefined,
    };
  });

  return NextResponse.json({ exists: true, submitted_at: row.submitted_at, is_locked: row.is_locked, days });
}

// POST: Müsaitlik gönder veya güncelle
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { personnel_id, week_start, days } = body;

    if (!personnel_id || !week_start || !days) {
      return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
    }

    if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Check if already submitted and locked
    const [existing] = await db
      .select()
      .from(availability)
      .where(and(eq(availability.personnel_id, personnel_id), eq(availability.week_start, week_start)))
      .limit(1);

    if (existing?.is_locked) {
      return NextResponse.json({ error: "Bu hafta için müsaitlik kilitleniş, deadline geçmiş." }, { status: 403 });
    }

    const values: Record<string, any> = {
      personnel_id,
      week_start,
      submitted_at: Math.floor(Date.now() / 1000),
      is_locked: 0,
    };

    for (let i = 0; i < 7; i++) {
      const day = days[i] ?? { status: "available" };
      values[`day_${i}`] = typeof day.status === 'object' ? JSON.stringify(day.status) : day.status;
      values[`day_${i}_start`] = day.start ?? null;
      values[`day_${i}_end`] = day.end ?? null;
    }

    if (existing) {
      await db
        .update(availability)
        .set(values as any)
        .where(and(eq(availability.personnel_id, personnel_id), eq(availability.week_start, week_start)));
    } else {
      await db.insert(availability).values(values as any);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Availability POST error:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// DELETE: Gönderilen müsaitliği geri çek (revoke)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const week_start = searchParams.get("week_start");

  if (!personnel_id || !week_start) {
    return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
  }

  if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
    return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  }

  const [existing] = await db
    .select()
    .from(availability)
    .where(and(eq(availability.personnel_id, personnel_id), eq(availability.week_start, week_start)))
    .limit(1);

  if (existing?.is_locked) {
    return NextResponse.json({ error: "Deadline geçtiği için geri alınamaz." }, { status: 403 });
  }

  await db
    .delete(availability)
    .where(and(eq(availability.personnel_id, personnel_id), eq(availability.week_start, week_start)));

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shift_proposals, notifications, shiftAssignments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

function hhmmToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isoToDay(isoDate: string, weekStart: string): number {
  const ms = new Date(isoDate).getTime() - new Date(weekStart).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function dayName(isoDate: string) {
  const DAYS_TR = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"];
  const d = new Date(isoDate);
  const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return `${DAYS_TR[idx]} ${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
}

// POST: Müdür yeni teklif oluşturur
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = await req.json();
  const {
    personnel_id, location_id, week_start,
    current_date, current_start, current_end,
    proposed_date, proposed_start, proposed_end,
    note,
  } = body;

  if (!personnel_id || !location_id || !week_start || !current_date || !proposed_date || !proposed_start || !proposed_end) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const [proposal] = await db
    .insert(shift_proposals)
    .values({
      org_id: auth.org_id,
      location_id,
      personnel_id,
      week_start,
      current_date,
      current_start,
      current_end,
      proposed_date,
      proposed_start,
      proposed_end,
      note: note ?? null,
      status: "pending",
    })
    .returning();

  const isSameDay = current_date === proposed_date;
  const changeDesc = isSameDay
    ? `${dayName(current_date)}: ${current_start}–${current_end} → ${proposed_start}–${proposed_end}`
    : `${dayName(current_date)} (${current_start}–${current_end}) → ${dayName(proposed_date)} (${proposed_start}–${proposed_end})`;

  await db.insert(notifications).values({
    personnel_id,
    type: "shift_proposal",
    title: "Vardiya Değişikliği Teklifi",
    message: changeDesc + (note ? ` — "${note}"` : ""),
    link: String(proposal.id),
    is_read: false,
  });

  return NextResponse.json({ id: proposal.id });
}

// PATCH: Personel kabul/red yapar
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id, status } = body;

  if (!id || !["accepted", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(shift_proposals)
    .where(eq(shift_proposals.id, Number(id)));

  const proposal = rows[0];
  if (!proposal) return NextResponse.json({ error: "Teklif bulunamadı" }, { status: 404 });
  if (proposal.status !== "pending") return NextResponse.json({ error: "Teklif zaten yanıtlandı" }, { status: 409 });

  // Employee yalnızca kendi teklifini yanıtlayabilir
  if (auth.role === "employee" && auth.personnel_id !== proposal.personnel_id) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  await db.update(shift_proposals).set({ status }).where(eq(shift_proposals.id, Number(id)));

  if (status === "accepted") {
    const currentDay = isoToDay(proposal.current_date, proposal.week_start);
    const proposedDay = isoToDay(proposal.proposed_date, proposal.week_start);

    // Mevcut vardiyayı sil
    await db
      .delete(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.personnel_id, proposal.personnel_id),
          eq(shiftAssignments.week_start, proposal.week_start),
          eq(shiftAssignments.day, currentDay),
          eq(shiftAssignments.location_id, proposal.location_id),
        )
      );

    // Yeni vardiyayı ekle
    const startMin = hhmmToMin(proposal.proposed_start);
    let endMin = hhmmToMin(proposal.proposed_end);
    if (endMin <= startMin) endMin += 1440;

    await db.insert(shiftAssignments).values({
      personnel_id:       proposal.personnel_id,
      location_id:        proposal.location_id,
      week_start:         proposal.week_start,
      day:                proposedDay,
      shift_id:           "custom",
      start_time:         proposal.proposed_start,
      end_time:           proposal.proposed_end,
      points:             Math.round((endMin - startMin) / 60 * 10) / 10,
      status:             "scheduled",
      publication_status: "published",
    });

    // Kabul onay bildirimi
    await db.insert(notifications).values({
      personnel_id: proposal.personnel_id,
      type: "schedule",
      title: "Vardiya Değişikliği Onaylandı",
      message: `${dayName(proposal.proposed_date)} ${proposal.proposed_start}–${proposal.proposed_end} vardiyası takviminize eklendi.`,
      link: "/portal/calendar",
      is_read: false,
    });
  }

  return NextResponse.json({ success: true });
}

// GET: Personelin tekliflerini getir
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const proposals = await db
    .select()
    .from(shift_proposals)
    .where(eq(shift_proposals.personnel_id, auth.personnel_id ?? ""));

  return NextResponse.json(proposals);
}

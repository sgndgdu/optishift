/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ortak tablet / punch clock — bilinçli olarak requireAuth KULLANMAZ.
 * Cihaz location_id'yi URL'den alır, personel PIN ile kimliğini kanıtlar.
 * rules.kiosk_mode_enabled kapalıysa bu route hiçbir şey yapmaz.
 */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { verifyKioskPin, isKioskRateLimited } from "@/lib/kiosk-auth";
import { performCheckIn, performCheckOut } from "@/lib/checkin";
import { getWeekStart } from "@/lib/date";

function requestIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

async function kioskLocation(db: ReturnType<typeof getDB>, locationId: string) {
  const loc = await db.prepare(`SELECT id, org_id, name, rules FROM locations WHERE id = ?`).get(locationId) as any;
  if (!loc) return null;
  let rules: any = {};
  try { rules = typeof loc.rules === "string" ? JSON.parse(loc.rules) : (loc.rules ?? {}); } catch { rules = {}; }
  return { ...loc, enabled: rules.kiosk_mode_enabled === true };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const db = getDB();
  const loc = await kioskLocation(db, locationId);
  if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
  return NextResponse.json({ enabled: loc.enabled, location_name: loc.name });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const body = await req.json().catch(() => ({}));
  const { pin, action } = body;
  if (!pin || !/^\d{4}$/.test(pin)) return NextResponse.json({ error: "4 haneli PIN zorunlu" }, { status: 400 });
  if (action !== "checkin" && action !== "checkout") return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });

  if (isKioskRateLimited(requestIp(req), locationId)) {
    return NextResponse.json({ error: "Çok fazla deneme, biraz bekleyin" }, { status: 429 });
  }

  const db = getDB();
  const loc = await kioskLocation(db, locationId);
  if (!loc) return NextResponse.json({ error: "Şube bulunamadı" }, { status: 404 });
  if (!loc.enabled) return NextResponse.json({ error: "Kiosk modu bu şubede kapalı" }, { status: 403 });

  const person = await verifyKioskPin(db, locationId, pin);
  if (!person) return NextResponse.json({ error: "Geçersiz PIN" }, { status: 401 });

  const weekStart = getWeekStart(0);
  const now = new Date();
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const shift = await db.prepare(
    `SELECT * FROM shift_assignments
     WHERE personnel_id = ? AND location_id = ? AND week_start = ? AND day = ? AND publication_status = 'published'`
  ).get(person.id, locationId, weekStart, day) as any;

  if (!shift) {
    return NextResponse.json({ error: `${person.name}: bugün için planlanmış vardiyanız yok` }, { status: 404 });
  }

  if (action === "checkin") {
    if (shift.check_in_at) return NextResponse.json({ error: `${person.name}: zaten check-in yapılmış` }, { status: 409 });
    const outcome = await performCheckIn(db, loc.org_id, { shiftId: shift.id });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json({ success: true, personnel_name: person.name, action: "checkin" });
  }

  if (!shift.check_in_at) return NextResponse.json({ error: `${person.name}: önce check-in yapılmalı` }, { status: 409 });
  if (shift.check_out_at) return NextResponse.json({ error: `${person.name}: zaten check-out yapılmış` }, { status: 409 });
  const outcome = await performCheckOut(db, loc.org_id, { shiftId: shift.id });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ success: true, personnel_name: person.name, action: "checkout" });
}

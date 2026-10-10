/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDB } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { notifyBranchManagers } from "@/lib/managerNotifications";
import { sendPushToPersonnel } from "@/lib/notifications";
import { isPeriodLocked } from "@/lib/checkin";
import { rescoreWeek } from "@/lib/scoring";
import { deriveOvertimeForWeek } from "@/lib/overtime";
import { addDays, formatDateTR } from "@/lib/date";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const shiftDate = (sa: { week_start: string; day: number }) => formatDateTR(addDays(sa.week_start, Number(sa.day)));


// GET:
// ?personnel_id=...   → personelin kendi talepleri
// ?location_id=...    → müdürün görüntülemesi için
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const personnel_id = searchParams.get("personnel_id");
  const location_id  = searchParams.get("location_id");
  if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  const org_id       = auth.org_id;

  const db = getDB();
  try {
    let rows: any[];

    if (personnel_id) {
      // Employee can only see their own requests
      if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT er.*, sa.day, sa.week_start, sa.start_time, sa.end_time
        FROM shift_edit_requests er
        LEFT JOIN shift_assignments sa ON er.shift_id = sa.id
        WHERE er.org_id = ? AND er.personnel_id = ?
        ORDER BY er.created_at DESC
      `).all(org_id, personnel_id);
    } else if (location_id) {
      if (auth.role === "employee") {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      rows = await db.prepare(`
        SELECT er.*, sa.day, sa.week_start, sa.start_time, sa.end_time, sa.location_id as shift_location_id
        FROM shift_edit_requests er
        LEFT JOIN shift_assignments sa ON er.shift_id = sa.id
        WHERE er.org_id = ? AND sa.location_id = ?
        ORDER BY er.created_at DESC
      `).all(org_id, location_id);
    } else {
      return NextResponse.json({ error: "personnel_id veya location_id zorunlu" }, { status: 400 });
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Yeni vardiya düzenleme talebi (personel)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { personnel_id, personnel_name, shift_id, reason, requested_start, requested_end } = await req.json();
    const org_id = auth.org_id;
    // Gerçek saat verilirse açıklama isteğe bağlı ("Geç çıktım" gibi)
    const times = typeof requested_start === "string" && typeof requested_end === "string";
    if (times && (!HHMM.test(requested_start) || !HHMM.test(requested_end) || requested_start === requested_end)) {
      return NextResponse.json({ error: "Saatleri SS:DD biçiminde girin." }, { status: 400 });
    }
    if (!personnel_id || !shift_id || (!reason?.trim() && !times)) {
      return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    // Employee can only submit for themselves
    if (auth.role === "employee" && auth.personnel_id !== personnel_id) {
      return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Düzenleme talebi bu lokasyonda kapatılmışsa (rules.edit_requests_enabled) talep oluşturulamaz
    const personnelRow = await db.prepare("SELECT primary_location_id FROM personnel WHERE id = ?").get(personnel_id) as any;
    if (personnelRow?.primary_location_id) {
      const locRow = await db.prepare("SELECT rules FROM locations WHERE id = ?").get(personnelRow.primary_location_id) as any;
      if (locRow?.rules) {
        let rules: any = {};
        try { rules = JSON.parse(locRow.rules); } catch { /* geçersiz JSON → atla */ }
        if (rules.edit_requests_enabled === false) {
          return NextResponse.json({ error: "Bu şubede düzenleme talebi kapalı." }, { status: 422 });
        }
      }
    }

    const sa = await db.prepare(
      "SELECT sa.id, sa.personnel_id, sa.location_id, sa.week_start, sa.day, sa.start_time, sa.end_time FROM shift_assignments sa JOIN locations l ON l.id = sa.location_id WHERE sa.id = ? AND l.org_id = ?",
    ).get(shift_id, org_id) as any;
    if (!sa || sa.personnel_id !== personnel_id) return NextResponse.json({ error: "Vardiya bulunamadı" }, { status: 404 });

    const now = Math.floor(Date.now() / 1000);
    const note = reason?.trim() || "Gerçek saatim farklıydı";
    const result = await db.prepare(`
      INSERT INTO shift_edit_requests (org_id, personnel_id, personnel_name, shift_id, reason, requested_start, requested_end, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(org_id, personnel_id, personnel_name ?? null, shift_id, note,
      times ? requested_start : null, times ? requested_end : null, now);
    // Sorumluya haber: onay bekleyen saat düzeltmesi (Onaylar)
    const who = personnel_name ?? "Bir ekip üyesi";
    await notifyBranchManagers(db, org_id, sa.location_id, "approvals", {
      type: "edit_request",
      title: "Saat düzeltme talebi",
      message: times
        ? `${who}, ${shiftDate(sa)} vardiyasının ${sa.start_time}-${sa.end_time} değil ${requested_start}-${requested_end} olduğunu bildirdi.`
        : `${who}, ${shiftDate(sa)} vardiyası için düzeltme istedi: ${note}`,
      link: "/requests",
    }).catch(() => 0);
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Durum güncelleme
// Müdür: { id, status: 'approved' | 'rejected', manager_note? }
// Personel: { id, status: 'cancelled' } — sadece kendi 'pending' talebini iptal edebilir
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const db = getDB();
  try {
    const { id, status, manager_note } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "id ve status zorunlu" }, { status: 400 });
    }

    const existing = await db.prepare(
      `SELECT * FROM shift_edit_requests WHERE id = ? AND org_id = ?`
    ).get(id, auth.org_id) as any;

    if (!existing) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }
    if (auth.role === "manager") {
      const sa = await db.prepare(`SELECT location_id FROM shift_assignments WHERE id = ?`).get(existing.shift_id) as { location_id: string } | undefined;
      if (managerOutsideBranch(auth, sa?.location_id ?? null)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    }

    // Personel sadece kendi pending talebini iptal edebilir
    if (status === "cancelled") {
      if (auth.role !== "employee" && !["manager", "admin", "supervisor"].includes(auth.role ?? "")) {
        return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
      }
      if (auth.role === "employee" && auth.personnel_id !== existing.personnel_id) {
        return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
      }
      if (existing.status !== "pending") {
        return NextResponse.json({ error: "Sadece bekleyen talepler iptal edilebilir" }, { status: 409 });
      }
      await db.prepare(`UPDATE shift_edit_requests SET status = 'cancelled' WHERE id = ?`).run(id);
      return NextResponse.json({ success: true });
    }

    // Manager onay/ret
    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }
    if (auth.role === "employee") {
      return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
    }

    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Bu talep zaten karara bağlandı" }, { status: 409 });
    }
    const sa = await db.prepare("SELECT * FROM shift_assignments WHERE id = ?").get(existing.shift_id) as any;

    // Onayda vardiya gerçek saate çekilir; yayınlanmış haftada puan ve fazla mesai yeniden hesaplanır
    const applyTimes = status === "approved" && sa && existing.requested_start && existing.requested_end;
    if (applyTimes) {
      if (await isPeriodLocked(db, auth.org_id, sa.location_id, sa.week_start, sa.day)) {
        return NextResponse.json({ error: "Bu ayın puantajı kilitli. Önce Raporlar'dan ayın kilidini açın." }, { status: 409 });
      }
      await db.prepare("UPDATE shift_assignments SET start_time = ?, end_time = ? WHERE id = ?")
        .run(existing.requested_start, existing.requested_end, sa.id);
    }

    await db.prepare(`UPDATE shift_edit_requests SET status = ?, manager_note = ? WHERE id = ?`)
      .run(status, manager_note ?? null, id);

    let overtimeHours = 0;
    if (applyTimes && sa.publication_status === "published") {
      await rescoreWeek(auth.org_id, sa.location_id, sa.week_start).catch(e => console.error("[edit-request] puan", e));
      const derived = await deriveOvertimeForWeek(auth.org_id, sa.location_id, sa.week_start).catch(e => { console.error("[edit-request] mesai", e); return []; });
      overtimeHours = derived.find(d => d.personnelId === existing.personnel_id && d.result !== "deleted")?.overtimeHours ?? 0;
    }

    // Kişiye karar bildirimi
    if (sa) {
      const when = shiftDate(sa);
      const title = status === "approved" ? "Saat düzeltmeniz onaylandı" : "Saat düzeltmeniz reddedildi";
      const message = status === "approved"
        ? (applyTimes
          ? `${when} vardiyanız ${existing.requested_start}-${existing.requested_end} olarak düzeltildi.${overtimeHours > 0 ? ` O hafta ${String(overtimeHours).replace(".", ",")} saat fazla mesainiz oldu; Talepler'den onaylayın.` : ""}`
          : `${when} vardiyası için düzeltme talebiniz onaylandı.`)
        : `${when} vardiyası için düzeltme talebiniz reddedildi.${manager_note ? ` Not: ${manager_note}` : ""}`;
      const now = Math.floor(Date.now() / 1000);
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, link, is_read, created_at)
        VALUES (?, 'edit_request', ?, ?, '/portal/requests', false, ?)
      `).run(existing.personnel_id, title, message, now).catch(() => {});
      sendPushToPersonnel(existing.personnel_id, auth.org_id, { title, body: message, url: "/portal/requests" }).catch(() => {});
    }
    return NextResponse.json({ success: true, applied: !!applyTimes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Açık vardiya üstlenme (claim) — TEK KAYNAK.
 *
 * app/api/open-shifts/route.ts PATCH (normal "Kabul Et" / müdür ataması) ve
 * (Teklif Pazarı 2026-10-03 kaldırıldı; shift_bids tablosu eski kayıtlar için duruyor.)
 */
import { rescoreWeek } from "@/lib/scoring";
import { resolveShiftDef } from "@/lib/fairness";
import { businessToday, formatDateTR } from "@/lib/date";
import { sendPushToPersonnel } from "@/lib/notifications";
import { rankCandidates } from "@/lib/openShiftCandidates";
import { checkPersonChange } from "@/lib/assignmentCheck";

export type ClaimOutcome =
  | { ok: true }
  | { ok: false; status: number; error: string; violations?: string[]; can_force?: boolean };

export async function claimOpenShift(
  db: any,
  orgId: string,
  openShiftId: number,
  claimedBy: string,
  claimedByName: string | null,
  opts: { overrideBonusPoints?: number; assignedByManager?: boolean; force?: boolean } = {},
): Promise<ClaimOutcome> {
  const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(openShiftId, orgId) as any;
  if (!os) return { ok: false, status: 404, error: "Vardiya bulunamadı" };

  if (os.status !== "open") return { ok: false, status: 409, error: "Bu vardiya artık açık değil" };
  if (os.date < businessToday()) return { ok: false, status: 409, error: "Bu vardiyanın tarihi geçti" };
  // Vardiyası ilana düşen kişi kendi ilanını üstlenip kahraman bonusu alamaz (devir ilanını geri çekebilir)
  if (os.released_by && os.released_by === claimedBy) {
    return { ok: false, status: 409, error: "Kendi bıraktığınız vardiyayı alamazsınız. İlanı geri çekebilirsiniz." };
  }

  const dt = new Date(os.date + "T00:00:00Z");
  const dayIdx = (dt.getUTCDay() + 6) % 7; // 0 = Pazartesi
  const monday = new Date(dt);
  monday.setUTCDate(dt.getUTCDate() - dayIdx);
  const week_start = monday.toISOString().split("T")[0];

  // Aynı gün zaten normal vardiyası olan kişi ikinci vardiyayı alamaz (motor da günde tek vardiya yazar)
  const sameDay = await db.prepare(`
    SELECT id FROM shift_assignments
    WHERE personnel_id = ? AND week_start = ? AND day = ? AND COALESCE(kind, 'regular') = 'regular'
  `).get(claimedBy, week_start, dayIdx);
  if (sameDay) return { ok: false, status: 409, error: "Bu kişinin o gün zaten vardiyası var" };

  // Dinlenme ve haftalık sınır (lib/assignmentCheck). Personel ihlali geçemez;
  // müdür ataması sorunları görüp açıkça onaylarsa (force) yapılır.
  const problems = await checkPersonChange(db, claimedBy, os.location_id, {
    add: [{ week_start, day: dayIdx, start_time: os.start_time, end_time: os.end_time }],
  });
  if (problems.length > 0 && !(opts.assignedByManager && opts.force)) {
    return {
      ok: false, status: 409, violations: problems, can_force: !!opts.assignedByManager,
      error: opts.assignedByManager
        ? "Bu atama çalışma kurallarına uymuyor. Yine de atamak için sorunları görüp onaylayın."
        : "Bu vardiyayı alırsanız çalışma kurallarına uymayan bir plan oluşur.",
    };
  }

  // Teklif kabulünde vardiyanın kahraman bonusu, kabul edilen teklifin tutarına çekilir —
  // rescoreWeek bu kolonu okuyarak puanlar (lib/scoring.ts).
  if (typeof opts.overrideBonusPoints === "number") {
    await db.prepare(`UPDATE open_shifts SET hero_bonus_multiplier = ? WHERE id = ?`).run(opts.overrideBonusPoints, openShiftId);
  }

  const now = Math.floor(Date.now() / 1000);
  // Durum koşullu güncelleme: iki kişi aynı anda basarsa yalnız biri kazanır
  const won = await db.prepare(`
    UPDATE open_shifts
    SET claimed_by = ?, claimed_by_name = ?, claimed_at = ?, status = 'claimed'
    WHERE id = ? AND status = 'open'
    RETURNING id
  `).all(claimedBy, claimedByName ?? null, now, openShiftId);
  if (!won || (Array.isArray(won) && won.length === 0)) {
    return { ok: false, status: 409, error: "Bu vardiyayı az önce başkası aldı" };
  }

  // Kahraman bonusu: claimed_by = personnel_id
  await db.prepare(`UPDATE personnel SET hero_count = COALESCE(hero_count, 0) + 1 WHERE id = ?`).run(claimedBy);

  // Personelin devir ilanı: vardiya ilanı açanın takviminden çıkar, vardiya tanımı yeni atamaya geçer
  let shiftId = "open-shift";
  if (os.source_assignment_id && os.released_by) {
    const src = await db.prepare(`SELECT shift_id FROM shift_assignments WHERE id = ?`).get(os.source_assignment_id) as any;
    if (src?.shift_id) shiftId = String(src.shift_id);
    await db.prepare(`DELETE FROM shift_assignments WHERE id = ? AND personnel_id = ?`).run(os.source_assignment_id, os.released_by);
    await db.prepare(`
      INSERT INTO notifications (personnel_id, type, title, message, created_at)
      VALUES (?, 'shift_change', ?, ?, ?)
    `).run(
      os.released_by,
      "Vardiyan devredildi",
      `${formatDateTR(os.date)} ${os.start_time}–${os.end_time} vardiyanızı ${claimedByName ?? "bir ekip arkadaşınız"} aldı. Bu vardiya artık sizin planınızda değil.`,
      now,
    );
  }

  // Devir ilanı değilse (sorumlunun ilanı, izinden ilana çevrilen) vardiya tanımı saatten bulunur; yoksa takvimde
  // "Vardiya" diye adsız görünüyor, plan puanlaması da tanımsız kalıyordu (tam test 2026-10-05)
  if (shiftId === "open-shift") {
    const loc = await db.prepare(`SELECT shift_definitions FROM locations WHERE id = ?`).get(os.location_id) as any;
    let defs: { id: string; start: string; end: string }[] = [];
    try { defs = typeof loc?.shift_definitions === "string" ? JSON.parse(loc.shift_definitions) : (loc?.shift_definitions ?? []); } catch { defs = []; }
    const def = resolveShiftDef(null, os.start_time, os.end_time, Array.isArray(defs) ? defs : []);
    if (def) shiftId = def.id;
  }

  // Kapılan vardiyayı kahramanın takvimine işle (yoksa vardiya hiçbir takvimde görünmez)
  await db.prepare(`
    INSERT INTO shift_assignments (personnel_id, location_id, week_start, day, shift_id, start_time, end_time, points, status, publication_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'scheduled', 'published', ?)
  `).run(claimedBy, os.location_id, week_start, dayIdx, shiftId, os.start_time, os.end_time, now);

  // Ödünç (başka şubeden üstlenen): şube kişinin çalıştığı şubelere eklenir, yoksa o şubenin planında satırı görünmez
  const who = await db.prepare(`SELECT assigned_location_ids FROM personnel WHERE id = ?`).get(claimedBy) as any;
  let assigned: string[] = [];
  try { assigned = JSON.parse(who?.assigned_location_ids || "[]"); } catch { assigned = []; }
  if (!assigned.includes(os.location_id)) {
    await db.prepare(`UPDATE personnel SET assigned_location_ids = ? WHERE id = ?`).run(JSON.stringify([...assigned, os.location_id]), claimedBy);
  }

  // Kahraman bonusu (düz puan, hero_bonus_multiplier kolonunda tutulur) puan formülünde uygulanır —
  // prev_score'a doğrudan yazılmaz, hafta deterministik olarak yeniden puanlanır.
  await rescoreWeek(orgId, os.location_id, week_start);

  await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    claimedBy,
    "hero_bonus",
    opts.assignedByManager ? "Açık vardiyaya atandınız" : "Vardiyayı aldınız",
    opts.assignedByManager
      ? `Sorumlunuz sizi ${formatDateTR(os.date)} tarihli ${os.start_time}–${os.end_time} vardiyasına atadı. Bu vardiya için ek puan alırsınız ve sonraki planlarda size daha az vardiya verilir.`
      : `${formatDateTR(os.date)} tarihli ${os.start_time}–${os.end_time} vardiyasını aldınız. Teşekkürler! Ek puan aldınız, sonraki planlarda size daha az vardiya verilir.`,
    now,
  );

  return { ok: true };
}

/**
 * Açık vardiya ilanı oluşturur ve duyurur — TEK KAYNAK (müdür ilanı, Gelemiyor, personel devri, izin onayı).
 * notify: "all" şubenin aktif personeli, "top" en uygun 3 aday, "none" kimse. releasedBy bildirim almaz.
 */
export async function publishOpenShift(
  db: any,
  o: {
    org_id: string; location_id: string; date: string; start_time: string; end_time: string; note: string | null;
    heroPoints?: number; releasedBy?: string | null; sourceAssignmentId?: number | null; notify?: "all" | "top" | "none";
  },
): Promise<{ id: number | null; notified: string[] }> {
  const notify = o.notify ?? "all";
  // hero_bonus_multiplier kolonu düz bonus PUANI tutar; belirtilmezse şubenin varsayılanı
  let heroPoints = o.heroPoints;
  if (typeof heroPoints !== "number") {
    heroPoints = 6;
    try {
      const locRow = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(o.location_id) as any;
      const rules = typeof locRow?.rules === "string" ? JSON.parse(locRow.rules) : (locRow?.rules ?? {});
      if (typeof rules.hero_bonus_points === "number") heroPoints = rules.hero_bonus_points;
    } catch { /* varsayılan kalır */ }
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(`
    INSERT INTO open_shifts (org_id, location_id, date, start_time, end_time, note, hero_bonus_multiplier, status, created_at, released_by, source_assignment_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(o.org_id, o.location_id, o.date, o.start_time, o.end_time, o.note, heroPoints, now, o.releasedBy ?? null, o.sourceAssignmentId ?? null);

  let targets: { id: string; name?: string; away?: boolean }[] = [];
  if (notify === "all" || notify === "top") {
    const { candidates } = await rankCandidates(db, { location_id: o.location_id, date: o.date, start_time: o.start_time, end_time: o.end_time, excludePersonnelId: o.releasedBy ?? undefined });
    if (notify === "all") {
      // Şubede çalışan ve bu vardiyayı gerçekten alabilecek herkes (paylaşılan personel dahil). O gün vardiyası olan,
      // izinli, "gelemem" diyen ya da alırsa dinlenme/haftalık sınırı bozulacak kişiye bildirim gitmez (üstlenemezdi).
      targets = candidates.filter(c => !c.other_branch && !c.blocking).map(c => ({ id: c.personnel_id, name: c.name }));
    } else {
      const local = candidates.filter(c => !c.other_branch);
      targets = local.filter(c => c.warnings.length === 0).slice(0, 3).map(c => ({ id: c.personnel_id, name: c.name }));
      if (targets.length === 0) targets = local.slice(0, 3).map(c => ({ id: c.personnel_id, name: c.name }));
    }
    // Ödünç (2026-10-04): diğer şubelerden en uygun 3 kişiye de davet gider; portalda ilanı görüp üstlenebilir
    targets.push(...candidates.filter(c => c.other_branch && c.warnings.length === 0).slice(0, 3)
      .map(c => ({ id: c.personnel_id, name: c.name, away: true })));
  }
  const dateLabel = formatDateTR(o.date);
  const branchName = (await db.prepare(`SELECT name FROM locations WHERE id = ?`).get(o.location_id) as any)?.name ?? "";
  const osId = result.lastInsertRowid ?? null;
  const insertNotif = await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, link, created_at)
    VALUES (?, 'open_shift', ?, ?, ?, ?)
  `);
  // Bildirimler paralel: sırayla gönderilince kalabalık şubede ilan saniyelerce sürüyordu
  await Promise.allSettled(targets.map(async p => {
    const link = p.away && osId ? `/portal/open-shifts?invite=${osId}` : "/portal/open-shifts";
    await insertNotif.run(
      p.id,
      p.away ? `${branchName} şubesinde yardım aranıyor · ${dateLabel}` : notify === "top" ? `Size uygun bir vardiya · ${dateLabel}` : `Açık Vardiya · ${dateLabel}`,
      p.away
        ? `${branchName} şubesinde ${o.start_time}–${o.end_time} vardiyası boş ve sizin o gün vardiyanız yok. İsterseniz bu vardiyayı alabilirsiniz. Vardiyayı alan kişi +${heroPoints} puan kazanır.`
        : notify === "top"
        ? `${o.start_time}–${o.end_time} vardiyası için en uygun kişilerden birisiniz. Vardiyayı ilk kabul eden alır ve +${heroPoints} puan kazanır.`
        : `${o.start_time}–${o.end_time} vardiyası için gönüllü aranıyor. Vardiyayı alan kişi +${heroPoints} puan kazanır.`,
      link,
      now,
    );
    await sendPushToPersonnel(p.id, o.org_id, {
      title: p.away ? `${branchName} şubesinde yardım aranıyor` : `Açık Vardiya · ${dateLabel}`,
      body: `${dateLabel} ${o.start_time}–${o.end_time}: gönüllü aranıyor. Vardiyayı alan kişi +${heroPoints} puan kazanır.`,
      url: link,
    });
  }));
  return { id: osId, notified: targets.map(p => (p.away ? `${p.name ?? p.id} (başka şube)` : p.name ?? p.id)) };
}

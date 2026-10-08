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
import { notifyBranchManagers } from "@/lib/managerNotifications";
import { canApproveLoan, declinedIds, userCanApproveLoan, wasInvited, worksAt, type Viewer } from "@/lib/loans";
import { orgSettings } from "@/lib/orgSettings";

export type ClaimOutcome =
  | { ok: true; pending?: boolean }
  | { ok: false; status: number; error: string; violations?: string[]; can_force?: boolean };

export async function claimOpenShift(
  db: any,
  orgId: string,
  openShiftId: number,
  claimedBy: string,
  claimedByName: string | null,
  /** assigner: doğrudan atayan sorumlu (ödüncte kişinin şubesi adına da karar verebiliyor mu, lib/loans).
   *  force: kurala uymayan atama. Sadece hesap sahibi ya da onun onayladığı istisna geçirir (route'lar, lib/ruleExceptions). */
  opts: { overrideBonusPoints?: number; assignedByManager?: boolean; force?: boolean; loanApproval?: boolean; assigner?: Viewer | null } = {},
): Promise<ClaimOutcome> {
  const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(openShiftId, orgId) as any;
  if (!os) return { ok: false, status: 404, error: "Vardiya bulunamadı" };

  // loanApproval: ana şubenin sorumlusu bekleyen ödüncü onaylıyor (lib/loans); vardiya o kişide bekliyor
  const fromStatus = opts.loanApproval ? "loan_pending" : "open";
  if (os.status !== fromStatus || (opts.loanApproval && os.claimed_by !== claimedBy)) {
    return { ok: false, status: 409, error: "Bu vardiya artık açık değil" };
  }
  if (os.date < businessToday()) return { ok: false, status: 409, error: "Bu vardiyanın tarihi geçti" };
  // Vardiyası ilana düşen kişi kendi ilanını üstlenip kahraman bonusu alamaz (devir ilanını geri çekebilir)
  if (os.released_by && os.released_by === claimedBy) {
    return { ok: false, status: 409, error: "Kendi bıraktığınız vardiyayı alamazsınız. İlanı geri çekebilirsiniz." };
  }

  // Ödünç (lib/loans): başka şubeden kişi. Kendisi alıyorsa davet edilmiş olmalı. İşletme ayarı açıksa (lib/orgSettings)
  // kişinin şubesinin sorumlusu onaylayınca kesinleşir; yazan / ilanı açan o şube için de karar verebiliyorsa onay gerekmez.
  // Sorumlunun doğrudan atama yetkisi route'ta (canBorrow) süzülür.
  const person = await db.prepare(`SELECT primary_location_id, assigned_location_ids FROM personnel WHERE id = ? AND org_id = ?`).get(claimedBy, orgId) as any;
  if (!person) return { ok: false, status: 404, error: "Kişi bulunamadı" };
  const away = !worksAt(person, os.location_id);
  const home: string | null = person.primary_location_id ?? null;
  let needsLoanApproval = false;
  if (away && !opts.loanApproval) {
    if (declinedIds(os).includes(claimedBy)) {
      return { ok: false, status: 409, error: "Bu vardiya için kişinin şubesinin sorumlusu onay vermedi." };
    }
    const { loan_approval } = await orgSettings(db, orgId);
    if (opts.assignedByManager) {
      needsLoanApproval = loan_approval && !!home && !canApproveLoan(opts.assigner, home);
    } else {
      if (!(await wasInvited(db, claimedBy, openShiftId))) {
        return { ok: false, status: 403, error: "Bu vardiya başka bir şubenin ilanı. Sadece davet edilen kişiler alabilir." };
      }
      needsLoanApproval = loan_approval && !!home && !(await userCanApproveLoan(db, os.created_by, home));
    }
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

  // Dinlenme ve haftalık sınır (lib/assignmentCheck). Ekip üyesi kuralı aşamaz; sorumlu ataması ya da ödünç onayı
  // force ile geçer (force'u sadece hesap sahibi ya da onun onayladığı istisna gönderir, lib/ruleExceptions).
  const problems = await checkPersonChange(db, claimedBy, os.location_id, {
    add: [{ week_start, day: dayIdx, start_time: os.start_time, end_time: os.end_time }],
  });
  const bendable = !!opts.assignedByManager || !!opts.loanApproval;
  if (problems.length > 0 && !(bendable && opts.force)) {
    return {
      ok: false, status: 409, violations: problems, can_force: bendable,
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
  if (needsLoanApproval) {
    // Vardiya bu kişi için tutulur, plana henüz yazılmaz; ana şubenin sorumlusu Onaylar'da karar verir
    const held = await db.prepare(`
      UPDATE open_shifts
      SET claimed_by = ?, claimed_by_name = ?, claimed_at = ?, status = 'loan_pending', loan_home_location_id = ?
      WHERE id = ? AND status = 'open'
      RETURNING id
    `).all(claimedBy, claimedByName ?? null, now, person.primary_location_id, openShiftId);
    if (!held || (Array.isArray(held) && held.length === 0)) {
      return { ok: false, status: 409, error: "Bu vardiyayı az önce başkası aldı" };
    }
    await notifyLoanRequested(db, orgId, os, claimedBy, claimedByName, person.primary_location_id, !!opts.assignedByManager);
    return { ok: true, pending: true };
  }

  // Durum koşullu güncelleme: iki kişi aynı anda basarsa yalnız biri kazanır
  const won = await db.prepare(`
    UPDATE open_shifts
    SET claimed_by = ?, claimed_by_name = ?, claimed_at = ?, status = 'claimed'
    WHERE id = ? AND status = ?
    RETURNING id
  `).all(claimedBy, claimedByName ?? null, now, openShiftId, fromStatus);
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
      "Vardiyanız devredildi",
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

  // Onaysız ödünç (ayar kapalı ya da yazan iki şube için de karar verebiliyor): kişinin şubesine sadece haber
  if (away && !opts.loanApproval && home && home !== os.location_id) {
    const there = await branchName(db, os.location_id);
    await notifyBranchManagers(db, orgId, home, "approvals", {
      type: "open_shift", title: "Ekibinizden biri başka şubede çalışacak",
      message: `${claimedByName ?? "Bir ekip üyeniz"}, ${there} şubesinde ${formatDateTR(os.date)} ${os.start_time}–${os.end_time} vardiyasına yazıldı.`,
      link: "/schedule",
    }).catch(() => 0);
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
    opts.loanApproval ? "Vardiya planınıza yazıldı" : opts.assignedByManager ? "Açık vardiyaya atandınız" : "Vardiyayı aldınız",
    opts.loanApproval
      ? `Sorumlunuz onayladı. ${formatDateTR(os.date)} tarihli ${os.start_time}–${os.end_time} vardiyası planınıza yazıldı. Ek puan aldınız, sonraki planlarda size daha az vardiya verilir.`
      : opts.assignedByManager
      ? `Sorumlunuz sizi ${formatDateTR(os.date)} tarihli ${os.start_time}–${os.end_time} vardiyasına atadı. Bu vardiya için ek puan alırsınız ve sonraki planlarda size daha az vardiya verilir.`
      : `${formatDateTR(os.date)} tarihli ${os.start_time}–${os.end_time} vardiyasını aldınız. Teşekkürler! Ek puan aldınız, sonraki planlarda size daha az vardiya verilir.`,
    now,
  );

  return { ok: true };
}

async function branchName(db: any, locationId: string | null | undefined): Promise<string> {
  if (!locationId) return "";
  return ((await db.prepare(`SELECT name FROM locations WHERE id = ?`).get(locationId)) as any)?.name ?? "";
}

/** Ödünç onaya düştü: kişiye, ana şubesinin sorumlularına ve ilanı açan şubenin sorumlularına haber */
async function notifyLoanRequested(db: any, orgId: string, os: any, personnelId: string, name: string | null, homeId: string, byManager: boolean) {
  const when = `${formatDateTR(os.date)} ${os.start_time}–${os.end_time}`;
  const [there, home] = await Promise.all([branchName(db, os.location_id), branchName(db, homeId)]);
  const who = name ?? "Bir ekip üyeniz";
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, link, created_at)
    VALUES (?, 'open_shift', ?, ?, '/portal/open-shifts', ?)
  `).run(personnelId, "Onay bekleniyor",
    byManager
      ? `${there} şubesi sizi ${when} vardiyasına yazmak istiyor. Kendi sorumlunuz onaylayınca vardiya planınıza yazılır, size bildirim gelir.`
      : `${there} şubesindeki ${when} vardiyasını aldınız. Kendi sorumlunuz onaylayınca vardiya planınıza yazılır, size bildirim gelir.`, now);
  await notifyBranchManagers(db, orgId, homeId, "approvals", {
    type: "open_shift", title: "Başka şubeye yardım isteği",
    message: byManager
      ? `${there} şubesi ${who} kişisini ${when} vardiyasına yazmak istiyor. Onaylarsanız vardiya planına yazılır.`
      : `${who}, ${there} şubesindeki ${when} vardiyasını almak istiyor. Onaylarsanız vardiya planına yazılır.`,
    link: "/requests",
  }).catch(() => 0);
  if (!byManager) {
    await notifyBranchManagers(db, orgId, os.location_id, "plan_settings", {
      type: "open_shift", title: "İlan alındı, onay bekleniyor",
      message: `${who} (${home}) ${when} vardiyasını aldı. ${home} şubesinin sorumlusu onaylayınca vardiya planınıza yazılır.`,
      link: "/open-shifts",
    }).catch(() => 0);
  }
}

/**
 * Bekleyen ödüncü geri çevirir: ana şubenin sorumlusu reddeder ya da ilanı açan şube beklemekten vazgeçer.
 * İlan yeniden açılır, kişi bu ilanı bir daha alamaz.
 */
export async function declineLoan(db: any, orgId: string, openShiftId: number, by: "home" | "requester"): Promise<ClaimOutcome> {
  const os = await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(openShiftId, orgId) as any;
  if (!os || os.status !== "loan_pending") return { ok: false, status: 409, error: "Bu ödünç artık onay beklemiyor" };
  const declined = [...new Set([...declinedIds(os), String(os.claimed_by)])];
  const done = await db.prepare(`
    UPDATE open_shifts SET status = 'open', claimed_by = NULL, claimed_by_name = NULL, claimed_at = NULL,
      loan_home_location_id = NULL, loan_declined = ?
    WHERE id = ? AND status = 'loan_pending' RETURNING id
  `).all(JSON.stringify(declined), openShiftId);
  if (!done || (Array.isArray(done) && done.length === 0)) return { ok: false, status: 409, error: "Bu ödünç artık onay beklemiyor" };

  const when = `${formatDateTR(os.date)} ${os.start_time}–${os.end_time}`;
  const [there, home] = await Promise.all([branchName(db, os.location_id), branchName(db, os.loan_home_location_id)]);
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, created_at)
    VALUES (?, 'open_shift', ?, ?, ?)
  `).run(os.claimed_by, "Vardiya size verilmedi",
    by === "home"
      ? `Sorumlunuz ${there} şubesindeki ${when} vardiyasını almanızı onaylamadı. Kendi planınız değişmedi.`
      : `${there} şubesi ${when} vardiyası için başka birini arıyor. Kendi planınız değişmedi.`, now);
  if (by === "home") {
    await notifyBranchManagers(db, orgId, os.location_id, "plan_settings", {
      type: "open_shift", title: "Ödünç onaylanmadı",
      message: `${home} şubesinin sorumlusu ${os.claimed_by_name ?? "kişinin"} ${when} vardiyasına gelmesini onaylamadı. İlan yeniden açık.`,
      link: "/open-shifts",
    }).catch(() => 0);
  }
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
    /** İlanı açan hesap (users.id) ve başka şubelere de duyurulsun mu (lib/loans canBorrow) */
    createdBy?: string | null; crossBranch?: boolean;
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
    INSERT INTO open_shifts (org_id, location_id, date, start_time, end_time, note, hero_bonus_multiplier, status, created_at, released_by, source_assignment_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
  `).run(o.org_id, o.location_id, o.date, o.start_time, o.end_time, o.note, heroPoints, now, o.releasedBy ?? null, o.sourceAssignmentId ?? null, o.createdBy ?? null);
  const osId = result.lastInsertRowid ?? null;
  const notified = await announceOpenShift(db, { ...o, id: osId, heroPoints: heroPoints ?? 6, notify, crossBranch: !!o.crossBranch });
  return { id: osId, notified };
}

/** İlanı ekibe duyurur (publishOpenShift içinden) */
export async function announceOpenShift(
  db: any,
  o: {
    id: number | null; org_id: string; location_id: string; date: string; start_time: string; end_time: string;
    heroPoints: number; releasedBy?: string | null; notify: "all" | "top" | "none"; crossBranch?: boolean;
  },
): Promise<string[]> {
  const { notify, heroPoints } = o;
  const now = Math.floor(Date.now() / 1000);
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
    // Ödünç: diğer şubelere de davet gider, portalda ilanı görüp alabilir. Sadece ilanı "Başka şubeden kişi"
    // yetkisiyle açan sorumluda (lib/loans canBorrow)
    // "Herkese duyur": diğer şubelerde alabilecek herkes; "İlk 3": diğer şubelerden en uygun 3 kişi (sorumlunun seçimi)
    if (o.crossBranch) {
      const away = candidates.filter(c => c.other_branch && !c.blocking);
      targets.push(...(notify === "all" ? away : away.filter(c => c.warnings.length === 0).slice(0, 3))
        .map(c => ({ id: c.personnel_id, name: c.name, away: true })));
    }
  }
  const dateLabel = formatDateTR(o.date);
  const branchLabel = await branchName(db, o.location_id);
  const osId = o.id;
  const insertNotif = await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, link, created_at)
    VALUES (?, 'open_shift', ?, ?, ?, ?)
  `);
  // Bildirimler paralel: sırayla gönderilince kalabalık şubede ilan saniyelerce sürüyordu
  await Promise.allSettled(targets.map(async p => {
    if (p.away && osId) {
      await sendAwayInvite(db, { id: osId, org_id: o.org_id, location_id: o.location_id, date: o.date, start_time: o.start_time, end_time: o.end_time, hero_bonus_multiplier: heroPoints }, p.id, branchLabel);
      return;
    }
    const link = "/portal/open-shifts";
    await insertNotif.run(
      p.id,
      notify === "top" ? `Size uygun bir vardiya · ${dateLabel}` : `Açık Vardiya · ${dateLabel}`,
      notify === "top"
        ? `${o.start_time}–${o.end_time} vardiyası için en uygun kişilerden birisiniz. Vardiyayı ilk kabul eden alır ve +${heroPoints} puan kazanır.`
        : `${o.start_time}–${o.end_time} vardiyası için gönüllü aranıyor. Vardiyayı alan kişi +${heroPoints} puan kazanır.`,
      link,
      now,
    );
    await sendPushToPersonnel(p.id, o.org_id, {
      title: `Açık Vardiya · ${dateLabel}`,
      body: `${dateLabel} ${o.start_time}–${o.end_time}: gönüllü aranıyor. Vardiyayı alan kişi +${heroPoints} puan kazanır.`,
      url: link,
    });
  }));
  return targets.map(p => (p.away ? `${p.name ?? p.id} (başka şube)` : p.name ?? p.id));
}

/**
 * Başka şubedeki bir kişiye ilan daveti (bildirim + telefon bildirimi). Davet edilen kişi ilanı portalda görür ve
 * alabilir (lib/loans wasInvited bu bildirimin bağlantısına bakar). Duyuru ve sorumlunun "Davet et" düğmesi kullanır.
 */
export async function sendAwayInvite(
  db: any,
  os: { id: number; org_id: string; location_id: string; date: string; start_time: string; end_time: string; hero_bonus_multiplier: number },
  personnelId: string,
  branchLabel?: string,
): Promise<void> {
  const name = branchLabel ?? await branchName(db, os.location_id);
  const dateLabel = formatDateTR(os.date);
  const link = `/portal/open-shifts?invite=${os.id}`;
  const points = Number(os.hero_bonus_multiplier) || 0;
  await db.prepare(`
    INSERT INTO notifications (personnel_id, type, title, message, link, created_at)
    VALUES (?, 'open_shift', ?, ?, ?, ?)
  `).run(
    personnelId,
    `${name} şubesinde yardım aranıyor · ${dateLabel}`,
    `${name} şubesinde ${os.start_time}–${os.end_time} vardiyası boş ve sizin o gün vardiyanız yok. İsterseniz bu vardiyayı alabilirsiniz, kendi sorumlunuz onaylayınca planınıza yazılır.${points > 0 ? ` Vardiyayı alan kişi +${points} puan kazanır.` : ""}`,
    link,
    Math.floor(Date.now() / 1000),
  );
  await sendPushToPersonnel(personnelId, os.org_id, {
    title: `${name} şubesinde yardım aranıyor`,
    body: `${dateLabel} ${os.start_time}–${os.end_time}: gönüllü aranıyor.`,
    url: link,
  });
}

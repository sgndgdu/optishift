/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Vardiya değiştirme kararı (sorumlu onayı/reddi, ekip üyesinin kabulü): TEK KAYNAK. PATCH /api/swap-requests ve
 * hesap sahibinin kural istisnası onayı (lib/ruleExceptions) aynı fonksiyonu çağırır.
 */
import type { AuthUser } from "@/lib/auth";
import { notifyBranchManagers } from "@/lib/managerNotifications";
import { managerOutsideBranch } from "@/lib/access";
import { swapReducer, toSwapEvent, SwapStatus } from "@/lib/swapReducer";
import { sendPushToPersonnel } from "@/lib/notifications";
import { checkPersonChange } from "@/lib/assignmentCheck";
import { canBendRules, EXCEPTION_SENT_MESSAGE, requestRuleException } from "@/lib/ruleExceptions";

const res = (body: any, init?: { status: number }) => ({ status: init?.status ?? 200, body });

export /**
 * Takas sonrası iki tarafın takvimi kurallara uyuyor mu (lib/assignmentCheck).
 * Dönen satırlar kişi adıyla; boşsa sorun yok.
 */
async function swapProblems(db: any, requesterShiftId: number, targetShiftId: number, names: { requester?: string | null; target?: string | null }): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT id, personnel_id, location_id, week_start, day, start_time, end_time FROM shift_assignments WHERE id IN (?, ?)`
  ).all(requesterShiftId, targetShiftId) as any[];
  const r = rows.find(x => String(x.id) === String(requesterShiftId));
  const t = rows.find(x => String(x.id) === String(targetShiftId));
  if (!r || !t || !r.start_time || !t.start_time) return [];
  const timed = (x: any) => ({ week_start: String(x.week_start), day: Number(x.day), start_time: String(x.start_time), end_time: String(x.end_time) });
  const [forR, forT] = await Promise.all([
    checkPersonChange(db, r.personnel_id, r.location_id, { removeIds: [Number(r.id)], add: [timed(t)] }),
    checkPersonChange(db, t.personnel_id, t.location_id, { removeIds: [Number(t.id)], add: [timed(r)] }),
  ]);
  return [
    ...forR.map(x => `${names.requester ?? "Talep eden"}: ${x}`),
    ...forT.map(x => `${names.target ?? "Değiştirilecek kişi"}: ${x}`),
  ];
}

export async function decideSwap(db: any, auth: AuthUser, input: { id?: any; status?: any; force?: any }): Promise<{ status: number; body: any }> {
  const { id, status, force } = input;

  if (!id || !status) {
    return res({ error: "id ve status zorunlu" }, { status: 400 });
  }

  // Manager statüslerini sadece manager/admin/supervisor kullanabilir
  const managerStatuses = ["manager_approved", "manager_rejected"];
  if (managerStatuses.includes(status) && auth.role === "employee") {
    return res({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const existing = await db.prepare(
    `SELECT * FROM shift_swap_requests WHERE id = ? AND org_id = ?`
  ).get(id, auth.org_id) as any;

  if (!existing) {
    return res({ error: "Talep bulunamadı" }, { status: 404 });
  }

  // API body → SwapEvent
  const event = toSwapEvent(status, auth.personnel_id);
  if (!event) {
    return res({ error: "Geçersiz durum değeri" }, { status: 400 });
  }

  // location_id'yi requester shift'ten al (Factor 6: hangi lokasyonun müdürüne gideceğini bilmek için)
  const requesterShift = await db.prepare(
    `SELECT location_id FROM shift_assignments WHERE id = ?`
  ).get(existing.requester_shift_id) as any;
  const location_id = requesterShift?.location_id ?? "";
  if (managerStatuses.includes(status) && managerOutsideBranch(auth, location_id)) return res({ error: "Erişim reddedildi" }, { status: 403 });

  // Reducer: (mevcutDurum, olay, bağlam) → yeniDurum + yan etkiler
  const result = swapReducer(
    existing.status as SwapStatus,
    event,
    {
      target_id:          existing.target_id,
      requester_id:       existing.requester_id,
      requester_name:     existing.requester_name ?? "Personel",
      target_name:        existing.target_name    ?? "Personel",
      requester_shift_id: existing.requester_shift_id,
      target_shift_id:    existing.target_shift_id,
      location_id,
    }
  );

  if (!result.ok) {
    return res({ error: result.error }, { status: result.httpStatus });
  }

  // Kabul ve onayda plan o arada değişmiş olabilir: kuralları yeniden kontrol et.
  // Personel ihlali geçemez; müdür sorunları görüp açıkça onaylarsa (force) takas yapılır.
  if (result.newStatus === "peer_accepted" || result.newStatus === "manager_approved") {
    const problems = await swapProblems(db, existing.requester_shift_id, existing.target_shift_id,
      { requester: existing.requester_name, target: existing.target_name });
    const managerForce = result.newStatus === "manager_approved" && force === true;
    // Kuralı sadece hesap sahibi esnetir; başkasının "yine de onayla"sı hesap sahibinin onayına gider (lib/ruleExceptions)
    if (problems.length > 0 && managerForce && !canBendRules(auth)) {
      await requestRuleException(db, auth, {
        kind: "swap_approve", location_id, ref_key: String(id), payload: { swap_id: Number(id) },
        summary: `${existing.requester_name ?? "Bir ekip üyesi"} ile ${existing.target_name ?? "ekip arkadaşı"} arasındaki vardiya değiştirmeyi onaylamak istiyor.`,
        violations: problems,
      });
      return res({ success: true, exception_requested: true, message: EXCEPTION_SENT_MESSAGE }, { status: 202 });
    }
    if (problems.length > 0 && !managerForce) {
      return res({
        error: result.newStatus === "manager_approved"
          ? "Bu vardiya değiştirme çalışma kurallarına uymuyor. Yine de onaylamak için sorunları görüp onaylayın."
          : "Bu vardiya değiştirmeyi kabul ederseniz çalışma kurallarına uymayan bir plan oluşur.",
        violations: problems,
        can_force: result.newStatus === "manager_approved",
      }, { status: 409 });
    }
  }

  // Durum güncelle
  await db.prepare(`UPDATE shift_swap_requests SET status = ? WHERE id = ?`)
    .run(result.newStatus, id);

  // Yan etkileri uygula
  const now = Math.floor(Date.now() / 1000);
  const pushPromises: Promise<void>[] = [];

  for (const effect of result.sideEffects) {
    if (effect.type === "SWAP_SHIFTS") {
      const sa_r = await db.prepare(`SELECT * FROM shift_assignments WHERE id = ?`).get(effect.requester_shift_id) as any;
      const sa_t = await db.prepare(`SELECT * FROM shift_assignments WHERE id = ?`).get(effect.target_shift_id) as any;
      if (sa_r && sa_t) {
        await db.prepare(`UPDATE shift_assignments SET personnel_id = ?, status = 'scheduled' WHERE id = ?`)
          .run(sa_t.personnel_id, sa_r.id);
        await db.prepare(`UPDATE shift_assignments SET personnel_id = ?, status = 'scheduled' WHERE id = ?`)
          .run(sa_r.personnel_id, sa_t.id);
      }
    }

    if (effect.type === "NOTIFY") {
      await db.prepare(`
        INSERT INTO notifications (personnel_id, type, title, message, is_read, created_at)
        VALUES (?, 'trade_request', ?, ?, false, ?)
      `).run(effect.personnel_id, effect.title, effect.message, now);

      // Push bildirimi de gönder (VAPID yapılandırıldıysa)
      pushPromises.push(
        sendPushToPersonnel(effect.personnel_id, auth.org_id, {
          title: effect.title,
          body: effect.message,
          url: "/portal/requests",
        })
      );
    }

    // Factor 7: akış duraklar → müdürü bul → bildir (Launch/Pause → insana araç gibi sor)
    if (effect.type === "NOTIFY_MANAGER") {
      // Yönetim paneli bildirimi (hesaba bağlı, lib/managerNotifications): onay yetkisi olan sorumlular
      // Beklenir: yanıt döndükten sonra sunucusuz işlev kesilebilir, bildirim kaybolmasın
      await notifyBranchManagers(db, auth.org_id, effect.location_id, "approvals", {
        type: "trade_request", title: effect.title, message: effect.message, link: "/requests",
      }).catch(e => console.error("[swap-requests] sorumlu bildirimi", e));
    }
  }

  // Push bildirimleri DB kapandıktan sonra async gönder — HTTP yanıtını bloklamaz
  Promise.allSettled(pushPromises);

  return res({ success: true, newStatus: result.newStatus });
}

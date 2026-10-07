/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ekip üyesinin asistanının önerdiği işlemler: TEK KAYNAK. Sadece kişinin KENDİ adına: izin talebi, vardiyasını
 * bırakma (ekibe duyurulur), açık vardiyayı alma. Biçim yönetim asistanıyla aynı (<islem> bloğu,
 * lib/ai/actions splitAssistantReply); her öneri veritabanından doğrulanır, kart metni KODLA yazılır.
 * Uygulama lib/copilot/applyAction (mevcut uçlar, ekrandan yapılanla aynı yetki ve kurallar).
 */
import type { AuthUser } from "@/lib/auth";
import type { ProposedAction } from "@/lib/ai/actions";
import { LEAVE_TYPES, normalizeLeaveType } from "@/lib/ai/actions";
import { addDays, businessToday, businessWallTime, formatDateTR } from "@/lib/date";
import { countLeaveDays, isAnnualLeaveType } from "@/lib/leave";
import { loadLeaveBalance } from "@/lib/leaveBalance";
import { checkPersonChange } from "@/lib/assignmentCheck";

const MAX_ACTIONS = 3;
const MAX_LEAVE_DAYS = 60;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/^\D+/, "")); return Number.isInteger(n) && n > 0 ? n : null; };
const J = (raw: unknown, d: any) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? d); } catch { return d; } };
const range = (a: string, b: string) => (a === b ? formatDateTR(a) : `${formatDateTR(a, { weekday: false })} - ${formatDateTR(b, { weekday: false })}`);

export async function resolveTeamActions(db: any, auth: AuthUser, raw: unknown[]): Promise<{ actions: ProposedAction[]; dropped: string[] }> {
  const actions: ProposedAction[] = [];
  const dropped: string[] = [];
  if (!raw.length || !auth.personnel_id) return { actions, dropped };
  const me = await db.prepare(`SELECT * FROM personnel WHERE id = ? AND org_id = ?`).get(auth.personnel_id, auth.org_id) as any;
  if (!me) return { actions, dropped };
  const home = await db.prepare(`SELECT rules FROM locations WHERE id = ?`).get(me.primary_location_id) as any;
  const rules = J(home?.rules, {});
  const today = businessToday();
  const myLocs = new Set([me.primary_location_id, ...J(me.assigned_location_ids, [])].filter(Boolean));

  if (raw.length > MAX_ACTIONS) dropped.push(`Bir seferde en fazla ${MAX_ACTIONS} işlem önerilebilir.`);
  for (const item of raw.slice(0, MAX_ACTIONS)) {
    const a = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const type = str(a.type);

    if (type === "request_leave") {
      if (rules.leave_requests_enabled === false) { dropped.push("Bu şubede izin talebi kapalı, sorumlunuzla konuşun."); continue; }
      const start = str(a.start_date), end = str(a.end_date) || start;
      if (!DATE.test(start) || !DATE.test(end) || end < start) { dropped.push("İzin tarihleri anlaşılamadı."); continue; }
      if (start < today) { dropped.push("Geçmiş bir tarih için izin istenemez."); continue; }
      if (addDays(start, MAX_LEAVE_DAYS) < end) { dropped.push("İzin çok uzun, Talepler sayfasından isteyin."); continue; }
      const overlap = await db.prepare(`
        SELECT 1 FROM leave_requests WHERE personnel_id = ? AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ? LIMIT 1
      `).get(me.id, end, start);
      if (overlap) { dropped.push("Bu tarihlerde zaten bir izin talebiniz ya da izniniz var."); continue; }
      const leaveType = normalizeLeaveType(a.leave_type);
      const days = countLeaveDays(start, end, me.weekly_off_day);
      const shifts = await db.prepare(`
        SELECT COUNT(*)::int AS n FROM shift_assignments
        WHERE personnel_id = ? AND publication_status = 'published' AND COALESCE(kind,'regular') = 'regular'
          AND (week_start::date + day) BETWEEN ?::date AND ?::date
      `).get(me.id, start, end).catch(() => null) as any;
      const n = Number(shifts?.n ?? 0);
      let balanceNote = "";
      if (isAnnualLeaveType(leaveType)) {
        const bal = await loadLeaveBalance(db, me.id, auth.org_id).catch(() => null);
        if (bal && days > bal.remaining) balanceNote = ` Dikkat: kalan yıllık izniniz ${bal.remaining} gün, bu talep ${days} gün.`;
      }
      actions.push({
        kind: "request_leave", personnel_id: me.id, type: leaveType, start_date: start, end_date: end, days,
        note: str(a.note).slice(0, 200),
        title: `${range(start, end)} için ${leaveType} talebi sorumlunuza gönderilir (${days} gün).` +
          (n ? ` Bu günlerde ${n} vardiyanız var, onaylanırsa yerinize biri bulunur.` : " Bu günlerde vardiyanız yok.") + balanceNote,
      });
      continue;
    }

    if (type === "release_shift") {
      if (rules.open_shifts_enabled === false) { dropped.push("Bu şubede açık vardiya kapalı. Vardiya değiştirmek için Talepler sayfasını kullanın ya da sorumlunuza yazın."); continue; }
      const id = num(a.assignment_id);
      const row = id ? await db.prepare(`SELECT * FROM shift_assignments WHERE id = ? AND personnel_id = ?`).get(id, me.id) as any : null;
      if (!row || row.publication_status !== "published" || (row.kind ?? "regular") !== "regular") { dropped.push("Bırakılacak vardiya bulunamadı."); continue; }
      const date = addDays(row.week_start, Number(row.day));
      if (businessWallTime(date, row.start_time).getTime() <= Date.now()) { dropped.push("Başlamış ya da geçmiş vardiya bırakılamaz. Sorumlunuza haber verin."); continue; }
      const listed = await db.prepare(`SELECT 1 FROM open_shifts WHERE source_assignment_id = ? AND status = 'open'`).get(row.id);
      if (listed) { dropped.push("Bu vardiya zaten ekibe duyuruldu."); continue; }
      actions.push({
        kind: "release_shift", assignment_id: row.id,
        title: `${formatDateTR(date)} ${row.start_time}-${row.end_time} vardiyanızı bırakırsınız. Uygun bir ekip arkadaşınız alınca planınızdan çıkar, o zamana kadar sizde kalır. Sorumlunuza haber gider.`,
      });
      continue;
    }

    if (type === "claim_open_shift") {
      const id = num(a.open_shift_id);
      const os = id ? await db.prepare(`SELECT * FROM open_shifts WHERE id = ? AND org_id = ?`).get(id, auth.org_id) as any : null;
      if (!os || os.status !== "open" || !myLocs.has(os.location_id) || os.date < today) { dropped.push("Açık vardiya bulunamadı ya da artık açık değil."); continue; }
      if (os.released_by === me.id) { dropped.push("Kendi bıraktığınız vardiyayı alamazsınız."); continue; }
      const ws = addDays(os.date, -((new Date(os.date + "T00:00:00Z").getUTCDay() + 6) % 7));
      const problems = await checkPersonChange(db, me.id, os.location_id, {
        add: [{ week_start: ws, day: (new Date(os.date + "T00:00:00Z").getUTCDay() + 6) % 7, start_time: os.start_time, end_time: os.end_time }],
      }).catch(() => [] as string[]);
      if (problems.length) { dropped.push(`Bu vardiyayı alamazsınız: ${problems[0]}.`); continue; }
      actions.push({
        kind: "claim_open_shift", open_shift_id: os.id, personnel_id: me.id, name: me.name,
        title: `${formatDateTR(os.date)} ${os.start_time}-${os.end_time} açık vardiyasını alırsınız. Planınıza eklenir ve +${os.hero_bonus_multiplier ?? 6} puan kazanırsınız.`,
      });
      continue;
    }

    dropped.push("Bunu asistan yapamıyor. Talepler sayfasından ya da sorumlunuza yazarak yapabilirsiniz.");
  }
  return { actions, dropped };
}

export const TEAM_ACTIONS_PROMPT = [
  "İşlem önerme:",
  "Kişi bir şey yapmak isterse (izin, gelememe, vardiya alma), cevabının EN SONUNA bir <islem> bloğu ekle. Blokta JSON dizisi olur.",
  "İşlemi sen yapmazsın: kişi ekranda görür ve onaylarsa uygulanır. Asla \"yaptım\" ya da \"gönderdim\" deme; \"Onaylarsanız gönderilir\" de.",
  "Yapılabilen işlemler (alan adlarını aynen kullan):",
  `- {"type":"request_leave","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","leave_type":"${LEAVE_TYPES.join(" | ")}","note":"kısa açıklama"}  (sorumluya izin talebi; sorumlu onaylar)`,
  "- {\"type\":\"release_shift\",\"assignment_id\":45}  (veride [v45] yazan kendi vardiyası; gelemeyecekse. Ekibe duyurulur, biri alana kadar kişide kalır)",
  "- {\"type\":\"claim_open_shift\",\"open_shift_id\":7}  (veride [ilan 7] yazan açık vardiya; \"alamazsınız\" yazanı önerme)",
  "Seçim: Kişi \"o gün gelemem\" der ve o gün vardiyası varsa: hastalık ya da acil durumsa release_shift öner ve sorumlusuna ayrıca haber vermesini söyle; önceden planlı bir izinse request_leave öner. İkisi de olabilirse kısa bir soru sor.",
  "Kurallar: Numaraları sadece veriden al, uydurma. [v12], [ilan 3] gibi numaraları cevap metnine yazma, sadece blokta kullan. Tarihleri bugüne göre YYYY-MM-DD yaz (\"cumartesi\" = önümüzdeki cumartesi).",
  "Bilgi eksikse blok ekleme, önce kısa bir soru sor.",
  "Örnek cevap sonu: <islem>[{\"type\":\"request_leave\",\"start_date\":\"2026-10-11\",\"end_date\":\"2026-10-11\",\"leave_type\":\"Yıllık İzin\",\"note\":\"Aile ziyareti\"}]</islem>",
].join("\n");

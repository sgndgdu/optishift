/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * İşletme Asistanı'nın önerdiği işlemler: TEK KAYNAK.
 *
 * Model cevabın sonuna <islem>[...]</islem> bloğu ekler (isimler ve bağlamdaki [v12], [izin 5], [takas 3]
 * numaralarıyla). Burada her öneri veritabanından doğrulanır, gerçek kimliklere çevrilir ve ekranda
 * gösterilecek açıklama KODLA yazılır (modelin metnine güvenilmez). Hiçbir şey kaydedilmez:
 * sorumlu "Uygula" derse tarayıcı uygulamanın mevcut uçlarını çağırır (lib/copilot/applyAction),
 * yetki ve kural kontrolleri o uçlarda olduğu gibi çalışır.
 */
import { addDays, businessToday, formatDateTR } from "@/lib/date";
import { countLeaveDays, leaveTypeLabel } from "@/lib/leave";
import { checkPersonChange } from "@/lib/assignmentCheck";

export const LEAVE_TYPES = ["Yıllık İzin", "Hastalık / Rapor", "Mazeret İzni", "Ücretsiz İzin"] as const;
const MAX_ACTIONS = 5;
const MAX_LEAVE_DAYS = 60;

export type ProposedAction =
  | { kind: "add_leave"; title: string; personnel_id: string; type: string; start_date: string; end_date: string; days: number; note: string }
  | { kind: "review_leave"; title: string; leave_id: number; status: "approved" | "rejected"; replacements?: Record<string, string> }
  | { kind: "review_swap"; title: string; swap_id: number; status: "manager_approved" | "manager_rejected" }
  | { kind: "absence"; title: string; assignment_id: number; note: string; replacement: { personnel_id: string; name: string } | null }
  | { kind: "open_shift"; title: string; location_id: string; date: string; start_time: string; end_time: string; note: string }
  /** Kimsenin almadığı ilanı bir kişiye vermek (lib/suggestions hazır çözümü) */
  | { kind: "assign_open_shift"; title: string; open_shift_id: number; personnel_id: string; name: string }
  /** Ekip üyesinin asistanı (lib/ai/teamActions): kendi adına */
  | { kind: "request_leave"; title: string; personnel_id: string; type: string; start_date: string; end_date: string; days: number; note: string }
  | { kind: "release_shift"; title: string; assignment_id: number }
  | { kind: "claim_open_shift"; title: string; open_shift_id: number; personnel_id: string; name: string };

const ACTION_TAG = /<islem>([\s\S]*?)<\/islem>/gi;

/** Model cevabını sohbet metni ve ham işlem listesine ayırır; blok metinden silinir */
export function splitAssistantReply(text: string): { answer: string; raw: unknown[] } {
  const raw: unknown[] = [];
  const answer = text.replace(ACTION_TAG, (_, body: string) => {
    const json = body.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    try {
      const v = JSON.parse(json);
      raw.push(...(Array.isArray(v) ? v : [v]));
    } catch { /* bozuk blok: yok sayılır */ }
    return "";
  }).replace(/<\/?islem>/gi, "")
    // Bağlamdaki iç numaralar ([v12], [izin 5], [takas 3]) kullanıcıya gösterilmez
    .replace(/\s*\(?\[(?:v\d+|izin \d+|takas \d+|ilan \d+)\]\)?(?:\s+numaralı)?/g, "").trim();
  return { answer, raw };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/^\D+/, "")); return Number.isInteger(n) && n > 0 ? n : null; };
const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
const range = (a: string, b: string) => (a === b ? formatDateTR(a) : `${formatDateTR(a, { weekday: false })} - ${formatDateTR(b, { weekday: false })}`);

/** Serbest yazılmış izin türünü uygulamadaki türlerden birine çevirir */
export function normalizeLeaveType(v: unknown): string {
  const t = norm(str(v));
  if (t.includes("hasta") || t.includes("rapor")) return "Hastalık / Rapor";
  if (t.includes("ücretsiz") || t.includes("ucretsiz")) return "Ücretsiz İzin";
  if (t.includes("mazeret")) return "Mazeret İzni";
  return "Yıllık İzin";
}

type Person = { id: string; name: string; weekly_off_day: number | null };

/** İsimle kişi bulma: önce tam ad, sonra tek eşleşen ad parçası (ör. sadece "Ayşe") */
export function matchPerson(people: Person[], wanted: string): Person | null {
  const w = norm(wanted);
  if (!w) return null;
  const exact = people.filter(p => norm(p.name) === w);
  if (exact.length === 1) return exact[0];
  const partial = people.filter(p => norm(p.name).split(" ").some(part => part === w) || norm(p.name).startsWith(w + " "));
  return partial.length === 1 ? partial[0] : null;
}

/**
 * Ham önerileri doğrular. Geçersiz olanlar `dropped` listesine sebebiyle düşer (sohbette gösterilir).
 * Sadece şube kapsamında çalışır.
 */
export async function resolveActions(db: any, auth: { org_id: string }, locationId: string, raw: unknown[]): Promise<{ actions: ProposedAction[]; dropped: string[] }> {
  const actions: ProposedAction[] = [];
  const dropped: string[] = [];
  if (!raw.length) return { actions, dropped };
  const today = businessToday();

  const people = (await db.prepare(`
    SELECT id, name, weekly_off_day FROM personnel
    WHERE org_id = ? AND status != 'inactive' AND (primary_location_id = ? OR assigned_location_ids LIKE ?)
  `).all(auth.org_id, locationId, `%"${locationId}"%`)) as Person[];
  const findPerson = (v: unknown, role: string): Person | null => {
    const p = matchPerson(people, str(v));
    if (!p) dropped.push(`${role} "${str(v) || "?"}" bu şubenin ekibinde bulunamadı ya da birden çok kişiyle eşleşti.`);
    return p;
  };

  if (raw.length > MAX_ACTIONS) dropped.push(`Bir seferde en fazla ${MAX_ACTIONS} işlem önerilebilir, kalanlar için tekrar sorun.`);
  for (const item of raw.slice(0, MAX_ACTIONS)) {
    const a = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const type = str(a.type);

    if (type === "add_leave") {
      const p = findPerson(a.person, "Kişi");
      if (!p) continue;
      const start = str(a.start_date), end = str(a.end_date) || start;
      if (!DATE.test(start) || !DATE.test(end) || end < start) { dropped.push(`${p.name} için izin tarihleri anlaşılamadı.`); continue; }
      if (end < addDays(today, -30)) { dropped.push(`${p.name} için geçmiş tarihe izin eklenmez.`); continue; }
      if (countLeaveDays(start, end) > MAX_LEAVE_DAYS || addDays(start, MAX_LEAVE_DAYS) < end) { dropped.push(`${p.name} için izin çok uzun, İzinler sayfasından girin.`); continue; }
      const overlap = await db.prepare(`
        SELECT 1 FROM leave_requests WHERE personnel_id = ? AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ? LIMIT 1
      `).get(p.id, end, start);
      if (overlap) { dropped.push(`${p.name} için bu tarihlerde zaten bir izin kaydı var.`); continue; }
      const leaveType = normalizeLeaveType(a.leave_type);
      const shifts = await db.prepare(`
        SELECT COUNT(*)::int AS n FROM shift_assignments
        WHERE personnel_id = ? AND COALESCE(kind,'regular') = 'regular' AND (week_start::date + day) BETWEEN ?::date AND ?::date
      `).get(p.id, start, end).catch(() => null) as any;
      const n = Number(shifts?.n ?? 0);
      actions.push({
        kind: "add_leave", personnel_id: p.id, type: leaveType, start_date: start, end_date: end,
        days: countLeaveDays(start, end, p.weekly_off_day), note: str(a.note).slice(0, 200) || "Asistanla eklendi",
        title: `${p.name} için ${leaveType}: ${range(start, end)}. İzin onaylı olarak kaydedilir.` +
          (n ? ` Bu günlerdeki ${n} vardiyası plandan çıkar, yayınlanmış olanlar açık vardiya olarak ekibe duyurulur.` : ""),
      });
      continue;
    }

    if (type === "review_leave") {
      const id = num(a.leave_id);
      const row = id ? await db.prepare(`
        SELECT lr.*, p.name FROM leave_requests lr JOIN personnel p ON p.id = lr.personnel_id
        WHERE lr.id = ? AND p.org_id = ? AND p.primary_location_id = ?
      `).get(id, auth.org_id, locationId) as any : null;
      if (!row || row.status !== "pending") { dropped.push("Onay bekleyen izin talebi bulunamadı."); continue; }
      const approve = str(a.decision) !== "reject";
      actions.push({
        kind: "review_leave", leave_id: row.id, status: approve ? "approved" : "rejected",
        title: `${row.name}, ${range(row.start_date, row.end_date)} için ${leaveTypeLabel(row.type)} istedi. ` +
          (approve ? "Talep onaylanır. O günlerdeki vardiyaları plandan çıkar, yayınlanmış olanlar açık vardiya olarak duyurulur." : "Talep reddedilir."),
      });
      continue;
    }

    if (type === "review_swap") {
      const id = num(a.swap_id);
      const row = id ? await db.prepare(`
        SELECT sr.* FROM shift_swap_requests sr JOIN shift_assignments sa ON sa.id = sr.requester_shift_id
        WHERE sr.id = ? AND sr.org_id = ? AND sa.location_id = ?
      `).get(id, auth.org_id, locationId) as any : null;
      if (!row || row.status !== "peer_accepted") { dropped.push("Sorumlu onayı bekleyen vardiya değiştirme talebi bulunamadı."); continue; }
      const approve = str(a.decision) !== "reject";
      actions.push({
        kind: "review_swap", swap_id: row.id, status: approve ? "manager_approved" : "manager_rejected",
        title: `${row.requester_name} ile ${row.target_name} arasındaki vardiya değiştirme talebi ${approve ? "onaylanır" : "reddedilir"}.`,
      });
      continue;
    }

    if (type === "absence") {
      const id = num(a.assignment_id);
      const row = id ? await db.prepare(`
        SELECT sa.*, p.name FROM shift_assignments sa JOIN personnel p ON p.id = sa.personnel_id
        WHERE sa.id = ? AND sa.location_id = ? AND p.org_id = ?
      `).get(id, locationId, auth.org_id) as any : null;
      if (!row) { dropped.push("Vardiya bulunamadı."); continue; }
      const date = addDays(row.week_start, Number(row.day));
      if (row.publication_status !== "published" || (row.kind ?? "regular") !== "regular" || date < today) {
        dropped.push(`${formatDateTR(date)} günü ${row.name} adına yazılı vardiya için bu işlem yapılamaz. Asistan sadece yayınlanmış ve tarihi geçmemiş vardiyayı değiştirir. Taslak planı Vardiya Planı'ndan düzenleyin.`);
        continue;
      }
      let replacement: { personnel_id: string; name: string } | null = null;
      if (str(a.replacement)) {
        const p = findPerson(a.replacement, "Yerine gelecek kişi");
        if (!p) continue;
        if (p.id === row.personnel_id) { dropped.push("Yerine gelecek kişi vardiyanın sahibiyle aynı."); continue; }
        replacement = { personnel_id: p.id, name: p.name };
        const problems = await checkPersonChange(db, p.id, locationId, {
          add: [{ week_start: row.week_start, day: Number(row.day), start_time: row.start_time, end_time: row.end_time }],
        }).catch(() => [] as string[]);
        // Kurala takılan kişi yazılmaz (atama 409 ile düşerdi): vardiya en uygun 3 kişiye teklif edilir
        if (problems.length) { dropped.push(`${p.name} bu vardiyayı alamaz: ${problems[0]}. Bunun yerine en uygun 3 kişiye teklif önerildi.`); replacement = null; }
      }
      // Gerekçe sadece kullanıcı söylediyse yazılır (önceden belirtilmeyen her şey "hastalık" sayılıyordu)
      const reason = str(a.reason) === "emergency" ? "acil bir durum nedeniyle gelemiyor"
        : str(a.reason) === "sick" ? "hastalık nedeniyle gelemiyor" : "gelemiyor";
      actions.push({
        kind: "absence", assignment_id: row.id, replacement, note: `${row.name} ${reason}`,
        title: `${row.name}, ${formatDateTR(date)} ${row.start_time}-${row.end_time} vardiyasına gelemiyor. ` +
          (replacement ? `Vardiya ${replacement.name} adına yazılır ve ikisine de bildirim gider.` : "Vardiya en uygun 3 kişiye teklif edilir, ilk kabul eden alır."),
      });
      continue;
    }

    if (type === "open_shift") {
      const date = str(a.date), st = str(a.start_time), et = str(a.end_time);
      if (!DATE.test(date) || !TIME.test(st) || !TIME.test(et) || date < today) { dropped.push("Açık vardiya için tarih ya da saat anlaşılamadı."); continue; }
      actions.push({
        kind: "open_shift", location_id: locationId, date, start_time: st, end_time: et, note: str(a.note).slice(0, 200),
        title: `${formatDateTR(date)} ${st}-${et} için açık vardiya ilanı verilir ve bütün ekibe duyurulur. İlk alan kişiye yazılır.`,
      });
      continue;
    }

    dropped.push("Asistan bu türde bir işlemi yapamıyor.");
  }
  return { actions, dropped };
}

/** Sistem talimatına eklenen bölüm: asistanın yapabildiği işlemler ve biçim */
export const ACTIONS_PROMPT = [
  "İşlem önerme (sadece şube görünümünde):",
  "Kullanıcı bir değişiklik isterse ya da bir sorunu çözmek için açıkça işe yarayacaksa, cevabının EN SONUNA bir <islem> bloğu ekle.",
  "Blokta bir JSON dizisi olur. İşlemleri sen yapmazsın: sorumlu ekranda görür ve onaylarsa uygulanır. Bu yüzden asla \"yaptım\" deme; \"Onaylarsanız uygulanır\" de.",
  "Yapılabilen işlemler (alan adlarını aynen kullan):",
  `- {"type":"add_leave","person":"Ad Soyad","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","leave_type":"${LEAVE_TYPES.join(" | ")}","note":"kısa açıklama"}`,
  "- {\"type\":\"review_leave\",\"leave_id\":12,\"decision\":\"approve | reject\"}  (veride [izin 12] yazan talep)",
  "- {\"type\":\"review_swap\",\"swap_id\":3,\"decision\":\"approve | reject\"}  (veride [takas 3] yazan talep)",
  "- {\"type\":\"absence\",\"assignment_id\":45,\"reason\":\"sick | emergency | other\",\"replacement\":\"Ad Soyad ya da boş\"}  (veride [v45] yazan YAYINLANMIŞ vardiya; kişi gelemiyor. reason: kullanıcı hastalık ya da acil durum demediyse other. replacement boşsa vardiya en uygun 3 kişiye teklif edilir)",
  "- {\"type\":\"open_shift\",\"date\":\"YYYY-MM-DD\",\"start_time\":\"HH:MM\",\"end_time\":\"HH:MM\",\"note\":\"kısa açıklama\"}  (ek kişi gereken bir saat için ilan)",
  "Kurallar: Numaraları ve isimleri sadece veriden al, uydurma. [v12] gibi numaraları cevap metnine yazma, sadece blokta kullan. Kişilerden \"ekip üyesi\" diye söz et, \"personel\" deme. Tarihleri bugüne ve plan satırlarındaki gün.ay bilgisine göre YYYY-MM-DD yaz.",
  "Yerine birini önerirken o gün boş olan, izinli olmayan ve haftalık saati sınıra yakın olmayan kişiyi seç; seçimini bir cümleyle açıkla.",
  "Bilgi eksikse (hangi gün, hangi kişi) blok ekleme, önce kısa bir soru sor. Taslak planı düzenleme, plan oluşturma ve ayar değiştirme yapamazsın; bunlar için ilgili sayfayı söyle.",
  "Örnek cevap sonu: <islem>[{\"type\":\"absence\",\"assignment_id\":45,\"reason\":\"sick\",\"replacement\":\"Mehmet Kaya\"}]</islem>",
].join("\n");

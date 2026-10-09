/**
 * Cümleyle plan değiştirme: TEK KAYNAK. Sorumlu Vardiya Planı'nda "Ayşe bu hafta sadece sabah çalışsın,
 * Mehmet cuma gelmesin" gibi yazar; yapay zekâ bunu yapılandırılmış isteklere çevirir, burada her istek kişi ve
 * vardiya listesinden doğrulanıp motor kısıtına (lib/planOverrides) dönüştürülür. Ekranda gösterilen özet
 * KODLA yazılır (modelin metnine güvenilmez). Plan motorla yeniden kurulur, mevcut plan en az değişir.
 */
import type { PlanOverride } from "@/lib/planOverrides";
import { matchPerson } from "@/lib/ai/actions";
import { addDays } from "@/lib/date";
import { DAY_NAMES, DAY_SHORT } from "@/lib/constants";

export type InstructPerson = { id: string; name: string; weekly_off_day?: number | null };
export type InstructShift = { id: string; name: string; start: string; end: string };
export type InstructDept = { id: string; name: string };
/** Kayıtlı kişi sayıları: departman kimliği (departmansız şubede "") → vardiya → gün → kişi.
 *  "Bir kişi daha" gibi göreli istekler bunun üstüne eklenir. */
export type InstructDemand = Record<string, Record<string, Record<string, number>>>;
export type InstructCtx = {
  people: InstructPerson[]; shifts: InstructShift[]; departments: InstructDept[]; weekStart: string; today: string; demand?: InstructDemand;
  /** Bu haftanın planı okunur satırlarla (lib/ai/businessContext weekPlanLines): sorulara cevap için */
  plan?: string[];
};

const MAX_DIRECTIVES = 12;
const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const TIME = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;

export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** "all" ya da boş → bütün hafta; sayı (0=Pzt) ya da gün adı kabul edilir */
export function parseDays(v: unknown): number[] {
  if (v === "all" || v === undefined || v === null || (Array.isArray(v) && v.length === 0)) return [0, 1, 2, 3, 4, 5, 6];
  const list = Array.isArray(v) ? v : [v];
  const out = new Set<number>();
  for (const x of list) {
    if (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6) { out.add(x); continue; }
    const n = norm(String(x));
    const i = DAY_NAMES.findIndex(d => norm(d) === n);
    const j = DAY_SHORT.findIndex(d => norm(d) === n);
    if (i >= 0) out.add(i); else if (j >= 0) out.add(j);
    else if (/^\d$/.test(n) && Number(n) <= 6) out.add(Number(n));
  }
  return [...out].sort();
}

function daysLabel(days: number[]): string {
  if (days.length === 7) return "bütün hafta";
  if (days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1] + 1)) return `${DAY_NAMES[days[0]]}-${DAY_NAMES[days[days.length - 1]]}`;
  return days.map(d => DAY_NAMES[d]).join(", ");
}

function findShift(shifts: InstructShift[], wanted: string): InstructShift | null {
  const w = norm(wanted);
  if (!w) return null;
  const exact = shifts.filter(s => norm(s.name) === w);
  if (exact.length === 1) return exact[0];
  const time = shifts.filter(s => w.includes(s.start) && w.includes(s.end));
  if (time.length === 1) return time[0];
  const partial = shifts.filter(s => norm(s.name).includes(w) || w.includes(norm(s.name)));
  if (partial.length === 1) return partial[0];
  // Model adı biraz değiştirebiliyor ("Akşam Service", "akşama"): ilk kelimeye göre, tek eşleşme varsa
  const head = w.split(/[\s(]+/)[0].slice(0, 4);
  if (head.length < 3) return null;
  const byWord = shifts.filter(s => norm(s.name).split(/[\s(]+/).some(t => t.startsWith(head)));
  return byWord.length === 1 ? byWord[0] : null;
}

/** Vardiya listesinin kapsadığı saat aralığı (gece geçişi "26:00" gibi yazılır) */
function spanOf(list: InstructShift[]): { start: string; end: string } {
  let a = Infinity, b = -Infinity;
  for (const s of list) {
    const st = toMin(s.start); let en = toMin(s.end); if (en <= st) en += 1440;
    a = Math.min(a, st); b = Math.max(b, en);
  }
  return { start: fmt(a), end: fmt(b) };
}

export function resolveDirectives(raw: unknown[], ctx: InstructCtx): { overrides: PlanOverride[]; summary: string[]; dropped: string[]; rebuild: boolean; ask?: string; options?: string[] } {
  let rebuild = false;
  let askDept = "";
  const overrides: PlanOverride[] = [];
  const summary: string[] = [];
  const dropped: string[] = [];
  const person = (v: unknown, what = "Kişi") => {
    const p = matchPerson(ctx.people.map(x => ({ id: x.id, name: x.name, weekly_off_day: x.weekly_off_day ?? null })), str(v));
    if (!p) dropped.push(`${what} "${str(v) || "?"}" bu haftanın planında bulunamadı ya da birden çok kişiyle eşleşti.`);
    return p;
  };
  const pastDays = new Set([0, 1, 2, 3, 4, 5, 6].filter(d => addDays(ctx.weekStart, d) < ctx.today));
  const future = (days: number[]) => days.filter(d => !pastDays.has(d));

  if (raw.length > MAX_DIRECTIVES) dropped.push(`Bir seferde en fazla ${MAX_DIRECTIVES} istek işlenir.`);
  for (const item of raw.slice(0, MAX_DIRECTIVES)) {
    const a = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const type = str(a.type);

    if (type === "day_off") {
      const p = person(a.person); if (!p) continue;
      const days = future(parseDays(a.days));
      if (!days.length) { dropped.push(`${p.name}: günler anlaşılamadı ya da geçmişte kaldı.`); continue; }
      overrides.push({ type: "day_off", personnel_id: p.id, days });
      summary.push(`${p.name}: ${daysLabel(days)} çalışmaz.`);
      continue;
    }

    if (type === "only_shifts" || type === "not_shifts") {
      const p = person(a.person); if (!p) continue;
      const names = Array.isArray(a.shifts) ? a.shifts.map(String) : [str(a.shifts)];
      const picked = names.map(n => findShift(ctx.shifts, n));
      if (picked.some(x => !x) || !picked.length) { dropped.push(`${p.name}: vardiya adı anlaşılamadı (${names.join(", ")}). Vardiyalar: ${ctx.shifts.map(s => s.name).join(", ")}.`); continue; }
      const chosen = picked as InstructShift[];
      const allowed = type === "only_shifts" ? chosen : ctx.shifts.filter(s => !chosen.some(c => c.id === s.id));
      if (!allowed.length) { dropped.push(`${p.name}: hiçbir vardiyaya yazılamaz hale gelir, bunun yerine "çalışmaz" deyin.`); continue; }
      const span = spanOf(allowed);
      // Aralığın içine yasaklanan bir vardiya düşüyorsa kesin uygulanamaz
      const A = toMin(span.start), B = toMin(span.end);
      const leaks = ctx.shifts.filter(s => !allowed.some(x => x.id === s.id)).filter(s => {
        const st = toMin(s.start); let en = toMin(s.end); if (en <= st) en += 1440;
        return (st >= A && en <= B) || (st + 1440 >= A && en + 1440 <= B);
      });
      if (leaks.length) { dropped.push(`${p.name}: ${allowed.map(s => s.name).join(" ve ")} arasında ${leaks.map(s => s.name).join(", ")} vardiyası var, bu istek kesin uygulanamaz. Günleri ayırarak yazın.`); continue; }
      const days = future(parseDays(a.days));
      if (!days.length) { dropped.push(`${p.name}: günler geçmişte kaldı.`); continue; }
      overrides.push({ type: "hours", personnel_id: p.id, days, start: span.start, end: span.end });
      summary.push(`${p.name}: ${daysLabel(days)} sadece ${allowed.map(s => s.name).join(" ya da ")} vardiyasına yazılır.`);
      continue;
    }

    if (type === "hours") {
      const p = person(a.person); if (!p) continue;
      const s = str(a.start).replace(".", ":") || "00:00", e = str(a.end).replace(".", ":") || "23:59";
      if (!TIME.test(s) || !TIME.test(e)) { dropped.push(`${p.name}: saatler anlaşılamadı.`); continue; }
      const st = toMin(s); let en = toMin(e); if (en <= st) en += 1440;
      const days = future(parseDays(a.days));
      if (!days.length) { dropped.push(`${p.name}: günler geçmişte kaldı.`); continue; }
      overrides.push({ type: "hours", personnel_id: p.id, days, start: fmt(st), end: fmt(en) });
      summary.push(`${p.name}: ${daysLabel(days)} sadece ${fmt(st)}-${fmt(en % 1440)} arasına sığan vardiyaya yazılır.`);
      continue;
    }

    if (type === "work") {
      const p = person(a.person); if (!p) continue;
      const sh = findShift(ctx.shifts, str(a.shift));
      const days = future(parseDays(a.days ?? a.day));
      if (!sh) { dropped.push(`${p.name}: vardiya adı anlaşılamadı. Vardiyalar: ${ctx.shifts.map(s => s.name).join(", ")}.`); continue; }
      if (!days.length || days.length > 6) { dropped.push(`${p.name}: hangi gün çalışacağı anlaşılamadı.`); continue; }
      for (const d of days) overrides.push({ type: "work", personnel_id: p.id, day: d, shift_id: sh.id });
      summary.push(`${p.name}: ${daysLabel(days)} ${sh.name} (${sh.start}-${sh.end}) vardiyasında çalışır.`);
      continue;
    }

    if (type === "max_hours") {
      const p = person(a.person); if (!p) continue;
      const h = Math.round(Number(a.hours));
      if (!(h >= 0 && h <= 66)) { dropped.push(`${p.name}: saat anlaşılamadı.`); continue; }
      overrides.push({ type: "max_hours", personnel_id: p.id, hours: h });
      summary.push(`${p.name}: bu hafta en fazla ${h} saat çalışır.`);
      continue;
    }

    if (type === "not_together") {
      const p = person(a.person); if (!p) continue;
      const q = person(a.other, "İkinci kişi"); if (!q) continue;
      if (p.id === q.id) { dropped.push("Aynı kişi iki kez yazılmış."); continue; }
      overrides.push({ type: "not_together", personnel_id: p.id, other_id: q.id });
      summary.push(`${p.name} ile ${q.name} aynı vardiyaya yazılmaz.`);
      continue;
    }

    if (type === "demand") {
      const sh = findShift(ctx.shifts, str(a.shift));
      if (!sh) { dropped.push(`Vardiya adı anlaşılamadı. Vardiyalar: ${ctx.shifts.map(s => s.name).join(", ")}.`); continue; }
      // "add": göreli değişiklik ("bir kişi daha" → +1), "count": kesin sayı
      const add = a.add !== undefined && a.add !== null && a.add !== "" ? Math.round(Number(a.add)) : null;
      const count = Math.round(Number(a.count));
      if (add !== null ? !(Math.abs(add) >= 1 && Math.abs(add) <= 20) : !(count >= 0 && count <= 50)) { dropped.push(`${sh.name}: kişi sayısı anlaşılamadı.`); continue; }
      let dept: InstructDept | null = null;
      if (ctx.departments.length) {
        const w = norm(str(a.department));
        dept = (w ? ctx.departments.find(d => norm(d.name) === w || norm(d.name.split("›").pop() ?? "") === w) : null) ?? (ctx.departments.length === 1 ? ctx.departments[0] : null);
        // Departman söylenmediyse düşürmek yerine sorulur, departman adları dokunulacak seçenek olur
        if (!dept) { askDept = `${sh.name} vardiyasında hangi departman için?`; continue; }
      }
      const days = future(parseDays(a.days));
      if (!days.length) { dropped.push(`${sh.name}: günler geçmişte kaldı.`); continue; }
      if (add === null) {
        overrides.push({ type: "demand", shift_id: sh.id, days, count, department_id: dept?.id ?? null });
        summary.push(`${dept ? `${dept.name}, ` : ""}${sh.name}: ${daysLabel(days)} ${count} kişi gerekir (sadece bu plan için).`);
        continue;
      }
      // Göreli: her gün kayıtlı sayının üstüne (gün gün farklı olabilir)
      const row = ctx.demand?.[dept?.id ?? ""]?.[sh.id] ?? {};
      const parts: string[] = [];
      for (const d of days) {
        const cur = Number(row[String(d)] ?? 0) || 0;
        const next = Math.max(0, Math.min(50, cur + add));
        overrides.push({ type: "demand", shift_id: sh.id, days: [d], count: next, department_id: dept?.id ?? null });
        parts.push(`${DAY_NAMES[d]} ${cur} yerine ${next}`);
      }
      summary.push(`${dept ? `${dept.name}, ` : ""}${sh.name}: ${parts.join(", ")} kişi (sadece bu plan için).`);
      continue;
    }

    if (type === "fill_gaps") {
      if (!rebuild) summary.push("Plan kayıtlı kişi sayılarına göre yeniden kurulur, eksik kalan vardiyalara uygun kişiler yazılır.");
      rebuild = true;
      continue;
    }

    dropped.push("Bir istek anlaşılamadı.");
  }
  if (askDept) return { overrides: [], summary: [], dropped, rebuild: false, ask: askDept, options: ctx.departments.map(d => d.name) };
  return { overrides, summary, dropped, rebuild: rebuild || overrides.length > 0 };
}

export function planInstructPrompt(ctx: InstructCtx): string {
  const week = [0, 1, 2, 3, 4, 5, 6].map(d => `${d}=${DAY_NAMES[d]} ${addDays(ctx.weekStart, d)}`).join(", ");
  const dept = ctx.departments.length ? ",\"department\":\"Departman adı\"" : "";
  return [
    "Sen bir vardiya planlama asistanısın. Sorumlu Vardiya Planı sayfasında, açık olan haftanın planı hakkında Türkçe yazıyor.",
    "Yazdığı şey ya planı değiştirme isteğidir ya da plan hakkında bir sorudur. SADECE JSON yaz, açıklama yazma.",
    `Bu haftanın günleri: ${week}. Bugün: ${ctx.today}. Geçmiş günler değiştirilemez.`,
    `Vardiyalar: ${ctx.shifts.map(s => `${s.name} (${s.start}-${s.end})`).join(", ")}.`,
    ctx.departments.length ? `Departmanlar: ${ctx.departments.map(d => d.name).join(", ")}.` : "",
    `Ekip: ${ctx.people.map(p => p.name).join(", ")}.`,
    ctx.plan?.length ? `\nBu haftanın şu anki planı:\n${ctx.plan.join("\n")}\n` : "\nBu hafta henüz plan yok.\n",
    "Üç cevap biçimi var:",
    "1) Soru ise (\"eksik var mı\", \"cuma kim çalışıyor\", \"Ayşe kaç saat çalışıyor\", \"en çok kim çalışıyor\"): {\"answer\":\"cevap\"}. Cevabı yukarıdaki plandan kendin bul, sadece sorulana cevap ver, kısa ve net yaz (en fazla 6 satır, her madde ayrı satırda \"• \" ile; \"en çok/en az\" sorularında hazır sıralamadan ilk 3-5 kişi). Sayılarda ondalık için virgül kullan (40,5 saat). Soru sorarak cevabı erteleme.",
    "   Eksik sorulduğunda SADECE planın \"Eksik\" satırını kullan (gün gün listeyi kullanma, orada geçmiş günler de var); satır \"yok\" diyorsa eksik olmadığını söyle. Fazla kişi eksik değildir. Eksik soruluyorsa ve eksik varsa cevabın sonuna \"Eksikleri kapatmak için planı yeniden kurabilirim.\" ekle ve \"options\":[\"Eksikleri kapat\"] ver. Eksik yoksa bunu açıkça söyle.",
    "2) Değişiklik isteği ise: {\"directives\":[...]}.",
    "3) Sadece ne istendiği gerçekten anlaşılmıyorsa: {\"ask\":\"kısa soru\",\"options\":[\"seçenek 1\",\"seçenek 2\"]}. options en fazla 8 kısa seçenek (ör. departman adları); sorumlu birine dokunarak cevaplar.",
    "Varsayılanlar (bunlar için SORU SORMA): gün söylenmediyse bütün hafta, vardiya söylenmediyse bütün vardiyalar, departman söylenmediyse bütün departmanlar, \"standart\" / \"normal\" kayıtlı kişi sayıları demektir.",
    "",
    "İstek türleri (days: gün numaraları dizisi, bütün hafta için \"all\"):",
    "- {\"type\":\"day_off\",\"person\":\"Ad Soyad\",\"days\":[4]}  kişi o günlerde çalışmasın / izinli / gelemez",
    "- {\"type\":\"only_shifts\",\"person\":\"Ad\",\"shifts\":[\"Sabah\"],\"days\":\"all\"}  sadece bu vardiyalarda çalışsın",
    "- {\"type\":\"not_shifts\",\"person\":\"Ad\",\"shifts\":[\"Gece\"],\"days\":\"all\"}  bu vardiyalara yazılmasın",
    "- {\"type\":\"hours\",\"person\":\"Ad\",\"start\":\"10:00\",\"end\":\"18:00\",\"days\":\"all\"}  sadece bu saatler arasında çalışsın (\"18'den sonra çalışmasın\" → start 00:00 end 18:00)",
    "- {\"type\":\"work\",\"person\":\"Ad\",\"shift\":\"Akşam\",\"days\":[5]}  o gün o vardiyada mutlaka çalışsın",
    "- {\"type\":\"max_hours\",\"person\":\"Ad\",\"hours\":30}  bu hafta en fazla şu kadar saat",
    "- {\"type\":\"not_together\",\"person\":\"Ad\",\"other\":\"Ad\"}  ikisi aynı vardiyada olmasın",
    "- {\"type\":\"demand\",\"shift\":\"Akşam\",\"days\":[5],\"count\":4" + dept + "}  o vardiyada o gün toplam şu kadar kişi olsun",
    "- {\"type\":\"demand\",\"shift\":\"Akşam\",\"days\":[5],\"add\":1" + dept + "}  \"bir kişi daha\", \"iki kişi fazla\" (add: +1, +2), \"bir kişi eksik olsun\" (add: -1). Göreli isteklerde count YAZMA, add yaz.",
    "- {\"type\":\"fill_gaps\"}  \"eksikleri kapat\", \"eksikleri doldur\", \"boşları tamamla\": plan kayıtlı kişi sayılarına göre yeniden kurulur",
    ctx.departments.length
      ? "Kişi sayısı (demand) isteğinde departman şarttır. Söylenmediyse ask ile sor ve options'a departman adlarını yaz; vardiyada sadece bir departman eksikse onu kullan."
      : "",
    "Kurallar: İsimleri ve vardiya adlarını listeden aynen yaz. Bir kişi için birden çok istek olabilir.",
    "Konuşma: önceki mesajlar varsa sorumlunun son mesajı bir soruya cevap ya da önceki isteklere ekleme/düzeltme olabilir. directives yazıyorsan HER ZAMAN bütün konuşmadaki geçerli isteklerin tam listesini yaz (önceki istekleri tekrar yaz, düzeltileni değiştir, vazgeçileni çıkar).",
  ].filter(Boolean).join("\n");
}

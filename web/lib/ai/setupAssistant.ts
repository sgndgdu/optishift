/**
 * Yapay zekâ ile kurulum: işletme sahibi işletmesini kendi cümleleriyle anlatır, asistan eksikleri
 * birer birer sorar, sonunda kurulum önerisi (işletme türü, departmanlar, vardiyalar, çalışma saatleri,
 * kaç kişi gerektiği) çıkarır. Öneri KAYDEDİLMEZ: sihirbaz gösterir, sahip düzeltip onaylar.
 * Modelin cevabı burada kodla doğrulanır (bilinmeyen tür, bozuk saat, aşırı sayı düzeltilir).
 */
import { INDUSTRIES, getIndustry, getVariant } from "@/lib/templates";

export type SetupShift = { name: string; start: string; end: string; difficulty: "easy" | "medium" | "hard" };
/** Fotoğraftan ya da yazılan listeden okunan ekip üyesi; department önerideki departmanlardan biri ya da "" */
export type SetupPerson = { name: string; department: string; phone: string };
export type SetupProposal = {
  industry: string;
  variant: string;
  departments: string[];
  shifts: SetupShift[];
  open: string;
  close: string;
  /** 0 = Pazartesi … 6 = Pazar */
  closedDays: number[];
  teamSize: number | null;
  /** departman adı (departman yoksa "") → vardiya adı → 7 günün kişi sayısı */
  demand: Record<string, Record<string, number[]>>;
  /** Fotoğraftan/listeden okunan ekip (yoksa boş) */
  team: SetupPerson[];
  summary: string;
};
export type SetupReply = { type: "question"; text: string } | { type: "proposal"; text: string; proposal: SetupProposal };

/** Modele verilen katalog: türler, alt türler, hazır vardiyalar ve departman önerileri */
function catalog(): string {
  return INDUSTRIES.map(i =>
    `- ${i.key} (${i.label}): ` + i.variants.map(v =>
      `${v.key} = ${v.label}; vardiyalar: ${v.shifts.map(s => `${s.name} ${s.start}-${s.end}`).join(", ")}; departman önerisi: ${(v.departments ?? []).join(", ") || "yok"}`,
    ).join(" | "),
  ).join("\n");
}

export function setupSystemPrompt(orgName: string): string {
  return `Sen OptiShift vardiya planlama uygulamasının kurulum asistanısın. İşletme sahibi işletmesini anlatıyor; amacın kurulum için gereken bilgileri toplamak.
İşletmenin adı: ${orgName || "(bilinmiyor)"}

Toplanacak bilgiler:
1. İşletme türü (aşağıdaki katalogdan en yakını)
2. Açılış ve kapanış saatleri, kapalı günler
3. Departmanlar (varsa; mutfak, salon gibi). Yoksa boş bırak.
4. Vardiyalar (adı, başlangıç, bitiş). Sahip söylemezse türün hazır vardiyalarını öner.
5. Kaç kişilik ekip
6. Her departmanda, her vardiyada, haftanın her günü kaç kişi gerektiği (yoğun günler dahil)

Kurallar:
- Türkçe yaz, "siz" diye hitap et, kısa ve sade cümleler kur. Slogan, deyim, emoji kullanma.
- Her seferinde SADECE BİR soru sor. Soruyu örnekle somutlaştır.
- En fazla 4 soru sor. Bilgi eksik kalırsa işletme türüne göre makul tahmin yap.
- Kişi sayılarında ekip büyüklüğünü aşma: bir günde çalışan toplam kişi, ekibin yaklaşık üçte ikisini geçmesin.
- Saatler HH:MM biçiminde. Gece yarısını geçen vardiyada bitiş başlangıçtan küçük olur (ör. 16:00-01:00).

Fotoğraf eklendiyse (kâğıt ya da Excel vardiya çizelgesi, ekip listesi, ekran görüntüsü):
- Üzerindeki kişi adlarını "team" listesine yaz. Okuyamadığın adı uydurma, atla. Aynı kişiyi bir kez yaz.
- Bölüm başlığı ya da sütunu varsa (Mutfak, Salon, Kasa) bunları departman yap ve kişiyi bağla.
- Çizelgedeki vardiya saatlerini "shifts"e yaz. Her gün her vardiyada kaç kişi yazılıysa "demand"e o sayıyı koy.
- Telefon numarası görünüyorsa "phone"a yaz, yoksa boş bırak.
- teamSize, team listesindeki kişi sayısından az olamaz.
- Fotoğraftan yeterli bilgi çıktıysa soru sorma, hemen proposal yaz. Fotoğraf okunamıyorsa bunu söyleyip daha net bir fotoğraf iste.

Katalog:
${catalog()}

CEVAP BİÇİMİ: Her zaman sadece tek bir JSON nesnesi yaz, başka metin yazma.
Soru sorarken: {"ask": "sorunuz"}
Bilgiler yeterli olunca:
{"proposal": {
  "industry": "katalogdaki tür anahtarı", "variant": "alt tür anahtarı",
  "departments": ["Salon", "Mutfak"],
  "shifts": [{"name": "Açılış", "start": "07:00", "end": "15:00", "difficulty": "easy|medium|hard"}],
  "open": "07:00", "close": "23:00", "closedDays": [6],
  "teamSize": 12,
  "demand": {"Salon": {"Açılış": [2,2,2,2,3,4,3]}, "Mutfak": {"Açılış": [1,1,1,1,1,2,2]}},
  "team": [{"name": "Ayşe Demir", "department": "Salon", "phone": ""}],
  "summary": "Sahibe gösterilecek 2-3 cümlelik özet"
}}
demand anahtarları departman adlarıdır; departman yoksa tek anahtar "" kullan. team sadece kişi adları biliniyorsa doldurulur, yoksa boş dizi. Diziler Pazartesi'den Pazar'a 7 sayıdır, kapalı günlerde 0.`;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Model cevabındaki ilk JSON nesnesini çıkarır (kod bloğu ya da açıklama eklemiş olabilir) */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** Modelin önerisini doğrular ve düzeltir. Kullanılamazsa null. */
export function normalizeProposal(raw: unknown): SetupProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const industry = getIndustry(typeof r.industry === "string" ? r.industry : "") ?? getIndustry("hospitality")!;
  const variant = getVariant(industry, typeof r.variant === "string" ? r.variant : null);

  const departments = Array.isArray(r.departments)
    ? [...new Set(r.departments.filter((d): d is string => typeof d === "string").map(d => d.trim().slice(0, 40)).filter(Boolean))].slice(0, 8)
    : [];

  let shifts: SetupShift[] = Array.isArray(r.shifts)
    ? r.shifts.flatMap((s): SetupShift[] => {
        if (!s || typeof s !== "object") return [];
        const x = s as Record<string, unknown>;
        const name = typeof x.name === "string" ? x.name.trim().slice(0, 40) : "";
        const start = String(x.start ?? ""), end = String(x.end ?? "");
        if (!name || !TIME.test(start) || !TIME.test(end) || start === end) return [];
        const difficulty = x.difficulty === "easy" || x.difficulty === "hard" ? x.difficulty : "medium";
        return [{ name, start, end, difficulty }];
      }).slice(0, 6)
    : [];
  // Vardiya çıkmadıysa türün hazır vardiyaları
  if (shifts.length === 0) {
    shifts = variant.shifts.map(s => ({ name: s.name, start: s.start, end: s.end, difficulty: s.base_points >= 7 ? "hard" : s.base_points <= 3 ? "easy" : "medium" }));
  }
  const names = new Set<string>();
  shifts = shifts.filter(s => (names.has(s.name.toLowerCase()) ? false : (names.add(s.name.toLowerCase()), true)));

  const open = TIME.test(String(r.open)) ? String(r.open) : shifts.reduce((a, s) => (s.start < a ? s.start : a), "23:59");
  const close = TIME.test(String(r.close)) ? String(r.close) : "23:00";
  const closedDays = Array.isArray(r.closedDays)
    ? [...new Set(r.closedDays.map(d => clampInt(d, -1, 6, -1)).filter(d => d >= 0))].slice(0, 6)
    : [];
  const team = normalizeTeam(r.team, departments);
  let teamSize = r.teamSize == null ? null : clampInt(r.teamSize, 1, 500, 0) || null;
  if (team.length && (teamSize ?? 0) < team.length) teamSize = team.length;

  // İhtiyaç: bilinen departman/vardiya adlarıyla eşleşen, 7 elemanlı, 0-50 arası sayılar
  const deptKeys = departments.length ? departments : [""];
  const rawDemand = (r.demand && typeof r.demand === "object" ? r.demand : {}) as Record<string, unknown>;
  const findKey = (obj: Record<string, unknown>, want: string) =>
    Object.keys(obj).find(k => k.trim().toLocaleLowerCase("tr") === want.toLocaleLowerCase("tr"));
  const demand: SetupProposal["demand"] = {};
  for (const dk of deptKeys) {
    const src = (() => {
      const k = findKey(rawDemand, dk) ?? (deptKeys.length === 1 ? Object.keys(rawDemand)[0] : undefined);
      const v = k !== undefined ? rawDemand[k] : undefined;
      return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    })();
    demand[dk] = {};
    for (const s of shifts) {
      const k = findKey(src, s.name);
      const arr = k ? src[k] : undefined;
      const days = Array.from({ length: 7 }, (_, d) => (closedDays.includes(d) ? 0 : clampInt(Array.isArray(arr) ? arr[d] : 1, 0, 50, 1)));
      demand[dk][s.name] = days;
    }
  }
  // Ekip büyüklüğü verildiyse bir günde çalışan toplam kişi ekibi aşmasın (orantılı küçült)
  if (teamSize) {
    for (let d = 0; d < 7; d++) {
      const cells: number[][] = Object.values(demand).flatMap(m => Object.values(m));
      const total = cells.reduce((t, c) => t + c[d], 0);
      if (total <= teamSize) continue;
      const f = teamSize / total;
      for (const c of cells) c[d] = c[d] > 0 ? Math.max(1, Math.floor(c[d] * f)) : 0;
    }
  }

  const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 600) : "";
  return { industry: industry.key, variant: variant.key, departments, shifts, open, close, closedDays, teamSize, demand, team, summary };
}

const MAX_TEAM = 200;
/** Ekip listesi: ad 2-60 harf, aynı ad bir kez, departman önerideki departmanlardan biri (değilse ""), telefon sadece rakam */
export function normalizeTeam(raw: unknown, departments: string[]): SetupPerson[] {
  if (!Array.isArray(raw)) return [];
  const deptOf = (v: unknown) => {
    const w = typeof v === "string" ? v.trim().toLocaleLowerCase("tr") : "";
    return departments.find(d => d.toLocaleLowerCase("tr") === w) ?? "";
  };
  const seen = new Set<string>();
  const out: SetupPerson[] = [];
  for (const item of raw) {
    const x = (typeof item === "string" ? { name: item } : item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const name = typeof x.name === "string" ? x.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (name.length < 2 || !/\p{L}/u.test(name)) continue;
    const key = name.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    const digits = typeof x.phone === "string" ? x.phone.replace(/[^\d+]/g, "") : "";
    out.push({ name, department: deptOf(x.department), phone: digits.length >= 10 ? digits.slice(0, 20) : "" });
    if (out.length >= MAX_TEAM) break;
  }
  return out;
}

/** Modelin ham cevabını soru ya da öneriye çevirir */
export function parseSetupReply(text: string): SetupReply | null {
  const j = extractJson(text);
  if (j && typeof j.ask === "string" && j.ask.trim()) return { type: "question", text: j.ask.trim().slice(0, 600) };
  if (j && j.proposal) {
    const proposal = normalizeProposal(j.proposal);
    if (proposal) return { type: "proposal", text: proposal.summary || "Kurulum önerisi hazır. Kontrol edip onaylayın.", proposal };
  }
  // JSON gelmediyse ve düz bir soru yazdıysa onu soru olarak kullan
  const plain = text.trim();
  if (!j && plain && plain.length < 600) return { type: "question", text: plain };
  return null;
}

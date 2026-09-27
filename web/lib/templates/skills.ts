/**
 * Sertifika Kalkanı.
 *
 * Motor, vardiyanın zorunlu yetkinliğini (ShiftDefinition.required_skills) KESİN kural
 * olarak uygular: yetkinliği olmayan kişi o yetkinliği sayılmaz. Kalkan bu kuralın
 * önüne geçer: bir rolü gerektiren belge geçersizse kişinin yetkinlik listesinden o rol
 * düşürülür. Böylece süresi dolmuş silahlı kimlik kartıyla kimse "Silahlı Güvenlik
 * Görevlisi" sayılmaz ve motor o kişiyi bu gerekliliği karşılamak için kullanamaz.
 *
 * Herkes için zorunlu (requiredForAll) belge geçersizse kişi o hafta plana hiç alınmaz
 * (eski davranışın sektöre göre inceltilmiş hali).
 *
 * Saf fonksiyonlar: /api/generate çağırır, testler doğrudan çalıştırır.
 */

import type { DocumentSpec, IndustryProfile } from "./types";

export const normalizeLabel = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

export interface PersonDocument { doc_type: string; expiry_date: string }

/** Personel belgesini (serbest metin) sektör kataloğundaki bir belgeyle eşleştirir. */
export function matchDocument(industry: IndustryProfile, docType: string): DocumentSpec | null {
  const n = normalizeLabel(docType);
  return industry.documents.find(d => [d.label, ...(d.aliases ?? [])].some(a => normalizeLabel(a) === n)) ?? null;
}

type DocState = { state: "valid" | "expired" | "missing"; expiry?: string };

function docState(spec: DocumentSpec, docs: PersonDocument[], industry: IndustryProfile, asOf: string): DocState {
  const matching = docs.filter(d => matchDocument(industry, d.doc_type)?.id === spec.id);
  if (!matching.length) return { state: "missing" };
  // Aynı belgenin birden fazla kaydı varsa en geç biten esas alınır (yenilenmiş belge)
  const latest = matching.map(d => d.expiry_date).sort().at(-1)!;
  return { state: latest < asOf ? "expired" : "valid", expiry: latest };
}

export interface ShieldResult {
  /** Motora gidecek, belgeyle desteklenen yetkinlikler. */
  skills: string[];
  /** Düşürülen roller ve nedeni. */
  revoked: { skill: string; document: string; reason: "expired" | "missing" }[];
  /** Kişiyi o hafta tamamen dışarıda bırakan belge (varsa). */
  blockedBy: { document: string; reason: "expired" | "missing"; expiry?: string } | null;
}

/**
 * @param skills  personelin yetkinlik listesi (personnel.roles)
 * @param docs    personelin tüm belgeleri
 * @param asOf    kontrol tarihi (YYYY-MM-DD; /api/generate planlanan haftanın SON gününü verir)
 */
export function applyCertificationShield(
  industry: IndustryProfile, skills: string[], docs: PersonDocument[], asOf: string,
): ShieldResult {
  const revoked: ShieldResult["revoked"] = [];
  const specById = new Map(industry.documents.map(d => [d.id, d]));

  // 1) Herkes için zorunlu belgeler
  for (const spec of industry.documents.filter(d => d.requiredForAll)) {
    const { state, expiry } = docState(spec, docs, industry, asOf);
    if (state === "expired" || (state === "missing" && spec.strict)) {
      return { skills: [], revoked: [], blockedBy: { document: spec.label, reason: state, ...(expiry ? { expiry } : {}) } };
    }
  }

  // 2) Rol bazlı belgeler
  const roleByLabel = new Map(industry.roles.map(r => [normalizeLabel(r.label), r]));
  const kept: string[] = [];
  for (const skill of skills) {
    const role = roleByLabel.get(normalizeLabel(skill));
    let failure: ShieldResult["revoked"][number] | null = null;
    for (const docId of role?.requiredDocs ?? []) {
      const spec = specById.get(docId);
      if (!spec) continue;
      const { state } = docState(spec, docs, industry, asOf);
      if (state === "expired" || (state === "missing" && spec.strict)) {
        failure = { skill, document: spec.label, reason: state };
        break;
      }
    }
    if (failure) revoked.push(failure); else kept.push(skill);
  }
  return { skills: kept, revoked, blockedBy: null };
}

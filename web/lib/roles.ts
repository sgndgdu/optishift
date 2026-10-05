/**
 * Şubenin görev listesi: TEK KAYNAK. İşletme türünün hazır görevleri (lib/templates) + şubenin kendi
 * eklediği görevler (locations.rules.custom_roles). Yeni görev kişinin kartından eklenir
 * (POST /api/locations/roles), Ayarlar › Temel › Görevler'de listelenir ve oradan silinir.
 * Görev = kişinin yapabildiği iş (personnel.roles); hesap türü (Çalışan / Yönetici) ayrı şeydir.
 */
import { industryFromRules } from "@/lib/templates";

export function customRoles(rules: Record<string, unknown> | null | undefined): string[] {
  const v = rules?.custom_roles;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
}

/** Hazır görevler (işletme türünden) ve şubenin eklediği görevler, tekrarsız ve sıralı. */
export function branchRoles(rules: Record<string, unknown> | null | undefined): { industry: string[]; custom: string[]; all: string[] } {
  // Alt türe özgü görevler (ör. otelde Resepsiyonist) sadece o alt türde listelenir; alt tür seçilmemişse hepsi
  const variant = typeof rules?.industry_variant === "string" ? rules.industry_variant : null;
  const industry = (industryFromRules(rules)?.roles ?? [])
    .filter(r => !variant || !r.variants || r.variants.includes(variant))
    .map(r => r.label);
  const custom = customRoles(rules).filter(r => !industry.includes(r));
  return { industry, custom, all: [...industry, ...custom] };
}

/** Görev adı biçimi: baştaki/sondaki boşluk atılır, çoklu boşluk teke iner, 40 karakter. */
export function normalizeRoleLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 40);
}

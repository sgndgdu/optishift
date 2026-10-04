/**
 * Alt departmanlar (kullanıcı kararı 2026-10-04): TEK KAYNAK.
 * Bir departmanın altında alt departmanlar olabilir (departments.parent_id, tek kat: alt departmanın altı olmaz).
 * Örnek: Salon › Üst Salon, Salon › Teras. Kurallar:
 * - Kişiler en alttaki departmana bağlanır (alt departmanı olan departmana doğrudan kişi bağlanmaz;
 *   bağlıysa otomatik plana alınmaz, ekranda "departman seçin" uyarısı çıkar).
 * - Kaç kişi gerektiği en alttaki departmanlar için girilir; alt departmanı olan departmanın kendi tablosu
 *   motora gitmez (eski "hayalet talep" olmasın).
 * - Departmanın şefi alt departmanlarının hepsini yönetir (ekip, plan, ihtiyaç tablosu); alt departmana
 *   ayrıca şef atanırsa o sadece kendi alt departmanını yönetir.
 * - Motor kişinin departman adını ve üst departmanın adını görev sayar (zorunlu görev "Salon" tüm katları kapsar).
 */
export type DeptLite = { id: string; name: string; parent_id?: string | null };

/** Departman ve (varsa) alt departmanlarının kimlikleri. */
export function departmentFamily(depts: DeptLite[], id: string): string[] {
  return [id, ...depts.filter(d => d.parent_id === id).map(d => d.id)];
}

export const hasSubDepartments = (depts: DeptLite[], id: string) => depts.some(d => d.parent_id === id);

/** Kişi bağlanabilen ve ihtiyacı girilen departmanlar: alt departmanı olmayanlar. */
export const leafDepartments = <T extends DeptLite>(depts: T[]): T[] => depts.filter(d => !hasSubDepartments(depts, d.id));

/** Ekranda gösterilecek ad: alt departmansa "Salon › Üst Salon". */
export function departmentLabel(depts: DeptLite[], d: DeptLite | null | undefined): string {
  if (!d) return "";
  const parent = d.parent_id ? depts.find(p => p.id === d.parent_id) : null;
  return parent ? `${parent.name} › ${d.name}` : d.name;
}

/** Ağaç sırası: her üst departman, hemen ardından alt departmanları. */
export function sortDepartments<T extends DeptLite>(depts: T[]): T[] {
  const tops = depts.filter(d => !d.parent_id || !depts.some(p => p.id === d.parent_id));
  return tops.flatMap(t => [t, ...depts.filter(d => d.parent_id === t.id)]);
}

/** Kişinin görev sayılan departman adları: kendi departmanı + üst departmanı. */
export function departmentRoleNames(depts: DeptLite[], id: string | null | undefined): string[] {
  const d = id ? depts.find(x => x.id === id) : null;
  if (!d) return [];
  const parent = d.parent_id ? depts.find(p => p.id === d.parent_id) : null;
  return parent ? [d.name, parent.name] : [d.name];
}

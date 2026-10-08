/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * İşletme geneli ayarlar (organizations.settings, JSON): TEK KAYNAK. Değiştiren sadece hesap sahibi,
 * yeri İşletme Ayarları (app/supervisor/(dashboard)/settings).
 * - loan_approval: başka şubeden kişi alınca kişinin kendi şubesinin sorumlusu onaylasın mı (varsayılan evet).
 *   Kapalıysa "Başka şubeden kişi" yetkisi olan sorumlu kişiyi doğrudan yazar, kişinin şubesine sadece haber gider.
 */
export interface OrgSettings {
  loan_approval: boolean;
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = { loan_approval: true };

export function parseOrgSettings(raw: unknown): OrgSettings {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    return { loan_approval: o.loan_approval !== false };
  } catch { return { ...DEFAULT_ORG_SETTINGS }; }
}

export async function orgSettings(db: any, orgId: string): Promise<OrgSettings> {
  const row = await db.prepare(`SELECT settings FROM organizations WHERE id = ?`).get(orgId) as any;
  return parseOrgSettings(row?.settings);
}

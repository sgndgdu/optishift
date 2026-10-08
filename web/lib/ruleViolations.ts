/**
 * Kural ihlali (lib/assignmentCheck) yanıtlarının istemci tarafı gösterimi.
 * Sunucu 409 + { error, violations, can_force } döner.
 */
export interface ViolationResponse { error?: string; violations?: string[]; can_force?: boolean; exception_requested?: boolean; message?: string }

/** Tek satırlık bildirim metni: hata + ilk sorunlar. */
export function violationText(d: ViolationResponse, fallback = "İşlem yapılamadı"): string {
  const v = Array.isArray(d.violations) ? d.violations : [];
  if (v.length === 0) return d.error ?? fallback;
  return `${d.error ?? fallback} ${v.join(". ")}`;
}

/**
 * Sorunları listeleyip "yine de" onayı sorar. Kuralı sadece hesap sahibi esnetir (lib/ruleBend): hesap sahibi değilse
 * soru "hesap sahibinin onayına gönderilsin mi?" olur, sunucu işlemi yapmaz, istek açar (202 exception_requested).
 */
export function confirmDespiteViolations(violations: string[], action = "Yine de onaylansın mı?", isOwner = true): boolean {
  const ask = isOwner ? action : "Kuralı sadece hesap sahibi esnetebilir. Hesap sahibinin onayına gönderilsin mi?";
  return window.confirm(`Bu işlem çalışma kurallarına uymuyor:\n\n${violations.map(v => `• ${v}`).join("\n")}\n\n${ask}`);
}

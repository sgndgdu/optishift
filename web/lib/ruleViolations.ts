/**
 * Kural ihlali (lib/assignmentCheck) yanıtlarının istemci tarafı gösterimi.
 * Sunucu 409 + { error, violations, can_force } döner.
 */
export interface ViolationResponse { error?: string; violations?: string[]; can_force?: boolean }

/** Tek satırlık bildirim metni: hata + ilk sorunlar. */
export function violationText(d: ViolationResponse, fallback = "İşlem yapılamadı"): string {
  const v = Array.isArray(d.violations) ? d.violations : [];
  if (v.length === 0) return d.error ?? fallback;
  return `${d.error ?? fallback} ${v.slice(0, 2).join(". ")}${v.length > 2 ? ` (+${v.length - 2})` : ""}`;
}

/** Müdüre sorunları listeleyip "yine de" onayı sorar. */
export function confirmDespiteViolations(violations: string[], action = "Yine de onaylansın mı?"): boolean {
  return window.confirm(`Bu işlem çalışma kurallarına uymuyor:\n\n${violations.map(v => `• ${v}`).join("\n")}\n\n${action}`);
}

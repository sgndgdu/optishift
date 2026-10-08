/**
 * Kural esnetme sabitleri (tarayıcı ve sunucu ortak; sunucu tarafı lib/ruleExceptions).
 * Çalışma kurallarını sadece hesap sahibi esnetir; başkasının isteği hesap sahibinin onayına gider.
 */
export const canBendRules = (auth: { role?: string | null } | null | undefined) => auth?.role === "admin";

/** Plan Kontrolü'nde çalışma kuralı sayılan maddeler (lib/copilot/checks); diğerleri planlama uyarısıdır */
export const RULE_CHECK_IDS = ["over-hours", "short-rest", "weekly-rest", "daily-11", "driving", "night-restriction", "long-night"];

/** Plan yayını izni 24 saat geçerli */
export const PUBLISH_PERMIT_SECONDS = 24 * 3600;

export const EXCEPTION_SENT_MESSAGE = "Bu işlem çalışma kurallarına uymuyor. Hesap sahibinin onayına gönderildi, onaylanınca uygulanır.";

/**
 * Sektörel Zeka ve Akıllı Şablon Motoru. Katmanlar:
 *   registry     sektör kayıtları (industries/*), eski sektör anahtarı eşlemesi
 *   compliance   akıllı varsayılanlar + yasal kısıt dağıtımı (şube alanları üretir)
 *   skills       sertifika kalkanı (geçersiz belge → rol düşer, motor kesin kuralı)
 *   nudges       sektör dili + Bekleyen İşler önceliği
 *   recommendations  önerilen zorunlu rollerin tek tık uygulanması
 */

export * from "./types";
export * from "./registry";
export * from "./compliance";
export * from "./skills";
export * from "./nudges";
export * from "./recommendations";

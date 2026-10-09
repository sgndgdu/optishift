import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { aiChat, aiChatProvider, type ChatTurn } from "@/lib/ai/chat";
import { buildBusinessContext } from "@/lib/ai/businessContext";
import { businessToday } from "@/lib/date";
import { ACTIONS_PROMPT, resolveActions, splitAssistantReply } from "@/lib/ai/actions";

// İşletme Asistanı (lib/ai/chat). Bağlam: kullanıcının kapsamındaki işletme özeti (lib/ai/businessContext),
// her soruda sunucuda taze hazırlanır. location_id: şube ayrıntısı; yoksa (patron/bölge müdürü) tüm şubeler.
// Asistan kayıt değiştirmez: şube görünümünde işlem ÖNERİR (lib/ai/actions), sorumlu onaylarsa
// tarayıcı uygulamanın mevcut uçlarını çağırır (lib/copilot/applyAction).

const MAX_QUESTION = 500;
const MAX_TURNS = 8;
const DAILY_LIMIT = 60; // kişi başı, ücretsiz kotayı korumak için (sunucu örneği başına, kabaca)
const usage = new Map<string, { day: string; n: number }>();
// Ücretsiz katmanda büyük flash model 45 sn'de cevap vermeyip düşüyordu (2026-10-07); kurulumdaki gibi hafif model,
// yanıt vermezse 3.5-flash. Claude'a geçince (AI_PROVIDER=anthropic) bu liste kullanılmaz.
const CHAT_OPTS = { thinking: "low" as const, timeoutMs: 25_000, models: [process.env.GEMINI_CHAT_MODEL || "gemini-flash-lite-latest", "gemini-3.5-flash"] };

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ enabled: auth.role !== "employee" && aiChatProvider() !== null });
}

function systemPrompt(context: string, actions: boolean): string {
  return [
    "Sen OptiShift'in İşletme Asistanı'sın. Hesap sahibine ya da sorumluya personel, vardiya planı, izinler, onaylar,",
    "fazla mesai, uygunluk ve şube ayarları hakkında yardım ediyorsun.",
    "Kurallar:",
    "- Türkçe, kısa ve net yaz. Gerekirse madde işareti kullan.",
    "- Sadece aşağıdaki işletme verisine dayan. Veride olmayan bir şeyi uydurma; bilmiyorsan söyle ve nereden bakılacağını öner.",
    "- Sayıları, isimleri ve tarihleri veriden aynen al.",
    actions
      ? "- Kayıtları kendin değiştiremezsin; aşağıdaki işlemleri önerebilirsin. Diğer işler için uygulamada nereden yapılacağını söyle (Vardiya Planı, Ekip, Onaylar, Ayarlar, Raporlar). Açık vardiya ilanları Vardiya Planı'nda, vardiyanın kutusunda görünür ve oradan yönetilir."
      : "- Hiçbir kaydı değiştiremezsin. İşlem önerirsen uygulamada nereden yapılacağını söyle (Vardiya Planı, Ekip, Onaylar, Ayarlar, Raporlar). Açık vardiya ilanları Vardiya Planı'nda görünür. İşlem için şubeye girilmesi gerektiğini söyle.",
    "- Departmanlı şubede bir vardiyayı sorarken departmanı ayır (\"Cumartesi Bar akşam\" = sadece Bar departmanının Akşam vardiyası). Yerine kim girebilir sorularında aynı departmandan ya da o departmanda \"ayrıca\" çalışabilen, o gün vardiyası olmayan ve haftalık sınırı dolmamış kişileri öner.",
    "- Taslak (yayınlanmamış) planda değişiklik istenirse işlem önerme; aynı cümleyi Vardiya Planı'ndaki \"Planı yazarak değiştirin\" kutusuna yazmasını, ya da kişiyi tablodan × ile çıkarıp sürükleyerek taşıyabileceğini söyle.",
    "- İş Kanunu sınırlarını (haftalık saat, 11 saat dinlenme, hafta tatili, yıllık izin) gözet; hukuki kesinlik iddia etme.",
    ...(actions ? ["", ACTIONS_PROMPT] : []),
    "",
    "İşletme verisi:",
    context,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  if (!aiChatProvider()) return NextResponse.json({ error: "Asistan bu kurulumda kapalı." }, { status: 503 });

  const body = await req.json().catch(() => null) as { location_id?: string | null; question?: string; history?: ChatTurn[] } | null;
  const question = body?.question?.trim() ?? "";
  if (!question) return NextResponse.json({ error: "Soru boş olamaz" }, { status: 400 });
  if (question.length > MAX_QUESTION) return NextResponse.json({ error: "Soru çok uzun" }, { status: 400 });

  const db = getDB();
  const locationId = body?.location_id || null;
  if (locationId) {
    if (!(await canManageLocation(db, auth, locationId))) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
  } else if (auth.role !== "admin" && auth.role !== "supervisor") {
    return NextResponse.json({ error: "Şube seçin" }, { status: 400 });
  }

  const day = businessToday();
  const u = usage.get(auth.id);
  const n = u && u.day === day ? u.n : 0;
  if (n >= DAILY_LIMIT) return NextResponse.json({ error: "Bugünkü soru sınırına ulaşıldı, yarın tekrar deneyin." }, { status: 429 });
  usage.set(auth.id, { day, n: n + 1 });

  const history = (Array.isArray(body?.history) ? body!.history! : [])
    .filter(t => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
    .slice(-MAX_TURNS)
    .map(t => ({ role: t.role, text: t.text.slice(0, 2000) }));
  while (history.length && history[0].role !== "user") history.shift();

  const context = await buildBusinessContext(db, auth, locationId);
  const result = await aiChat(systemPrompt(context, !!locationId), [...history, { role: "user", text: question }], CHAT_OPTS);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  const { answer, raw } = splitAssistantReply(result.text);
  const { actions, dropped } = locationId ? await resolveActions(db, auth, locationId, raw) : { actions: [], dropped: [] };
  return NextResponse.json({ answer: answer || (actions.length ? "Şu işlemi öneriyorum:" : "Cevap alınamadı, soruyu başka türlü sorun."), actions, dropped });
}

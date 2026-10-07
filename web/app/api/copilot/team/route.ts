import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { aiChat, aiChatProvider, type ChatTurn } from "@/lib/ai/chat";
import { buildTeamContext } from "@/lib/ai/teamContext";
import { splitAssistantReply } from "@/lib/ai/actions";
import { resolveTeamActions, TEAM_ACTIONS_PROMPT } from "@/lib/ai/teamActions";
import { businessToday } from "@/lib/date";

// Ekip üyesinin asistanı (portal). Bağlam SADECE kişinin kendi verisi (lib/ai/teamContext). Kayıt değiştirmez:
// kendi adına işlem önerir (lib/ai/teamActions), kişi onaylarsa tarayıcı mevcut uçları çağırır (lib/copilot/applyAction).

const MAX_QUESTION = 400;
const MAX_TURNS = 8;
const DAILY_LIMIT = 30; // kişi başı (sunucu örneği başına, kabaca)
const usage = new Map<string, { day: string; n: number }>();
const CHAT_OPTS = { thinking: "low" as const, timeoutMs: 25_000, models: [process.env.GEMINI_CHAT_MODEL || "gemini-flash-lite-latest", "gemini-3.5-flash"] };

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ enabled: !!auth.personnel_id && aiChatProvider() !== null });
}

function systemPrompt(context: string): string {
  return [
    "Sen OptiShift'te bir ekip üyesinin kişisel asistanısın. Kişiye kendi vardiyaları, izinleri, uygunluğu ve açık vardiyalar hakkında yardım ediyorsun.",
    "Kurallar:",
    "- Türkçe, kısa ve sıcak yaz; kişiye \"siz\" diye hitap et. Gerekirse madde işareti kullan.",
    "- Sadece aşağıdaki veriye dayan. Veride olmayanı uydurma; bilmiyorsan söyle ve sorumlusuna sormasını öner.",
    "- Başka bir çalışanın saatleri, puanı, ücreti ya da izni hakkında bilgi verme; sadece kişinin kendi günlerinde kimlerle çalıştığını söyleyebilirsin.",
    "- Planı, kuralları ya da başkasının vardiyasını değiştiremezsin. Vardiya değiştirmek (takas) için Talepler sayfasını, uygunluk için Uygunluk sayfasını söyle.",
    "- İş Kanunu sorularında genel bilgi ver, kesinlik iddia etme; şüphede sorumluya yönlendir.",
    "",
    TEAM_ACTIONS_PROMPT,
    "",
    "Kişinin verisi:",
    context,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.personnel_id) return NextResponse.json({ error: "Bu asistan ekip üyeleri içindir." }, { status: 403 });
  if (!aiChatProvider()) return NextResponse.json({ error: "Asistan bu kurulumda kapalı." }, { status: 503 });

  const body = await req.json().catch(() => null) as { question?: string; history?: ChatTurn[] } | null;
  const question = body?.question?.trim() ?? "";
  if (!question) return NextResponse.json({ error: "Soru boş olamaz" }, { status: 400 });
  if (question.length > MAX_QUESTION) return NextResponse.json({ error: "Soru çok uzun" }, { status: 400 });

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

  const db = getDB();
  const { text: context } = await buildTeamContext(db, auth);
  const result = await aiChat(systemPrompt(context), [...history, { role: "user", text: question }], CHAT_OPTS);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  const { answer, raw } = splitAssistantReply(result.text);
  const { actions, dropped } = await resolveTeamActions(db, auth, raw);
  return NextResponse.json({ answer: answer || (actions.length ? "Şunu öneriyorum:" : "Cevap alınamadı, soruyu başka türlü sorun."), actions, dropped });
}

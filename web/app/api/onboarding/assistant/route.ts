import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { aiChat, aiChatProvider, type ChatTurn } from "@/lib/ai/chat";
import { parseSetupReply, setupSystemPrompt } from "@/lib/ai/setupAssistant";
import { businessToday } from "@/lib/date";

// Yapay zekâ ile kurulum (lib/ai/setupAssistant). Sadece hesap sahibi ve bölge sorumlusu.
// Cevap ya bir soru ya da doğrulanmış kurulum önerisidir; burada hiçbir kayıt yazılmaz.

const MAX_TURNS = 14;
const DAILY_LIMIT = 40; // kişi başı; kurulum bir kez yapılır, ücretsiz kotayı korur
const usage = new Map<string, { day: string; n: number }>();

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ enabled: (auth.role === "admin" || auth.role === "supervisor") && aiChatProvider() !== null });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && auth.role !== "supervisor") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  if (!aiChatProvider()) return NextResponse.json({ error: "Yapay zekâ bu kurulumda kapalı." }, { status: 503 });

  const body = await req.json().catch(() => null) as { turns?: ChatTurn[]; finish?: boolean } | null;
  const turns = (Array.isArray(body?.turns) ? body!.turns! : [])
    .filter(t => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string" && t.text.trim())
    .slice(-MAX_TURNS)
    .map(t => ({ role: t.role, text: t.text.slice(0, 1500) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return NextResponse.json({ error: "Mesaj boş olamaz" }, { status: 400 });

  const day = businessToday();
  const u = usage.get(auth.id);
  const n = u && u.day === day ? u.n : 0;
  if (n >= DAILY_LIMIT) return NextResponse.json({ error: "Bugünkü sınıra ulaşıldı. Kurulumu adım adım seçerek tamamlayabilirsiniz." }, { status: 429 });
  usage.set(auth.id, { day, n: n + 1 });

  const db = getDB();
  let orgName = "";
  try {
    const org = await db.prepare("SELECT name FROM organizations WHERE id = ?").get(auth.org_id) as { name?: string } | undefined;
    orgName = org?.name ?? "";
  } catch { /* ad bilinmese de kurulum sürer */ }
  let system = setupSystemPrompt(orgName);
  // "Önerini hazırla" düğmesi ya da çok uzayan sohbet: artık soru sorma
  const asked = turns.filter(t => t.role === "assistant").length;
  if (body?.finish || asked >= 4) system += "\n\nArtık soru sorma. Eldeki bilgilerle hemen proposal yaz.";

  let result = await aiChat(system, turns);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  let reply = parseSetupReply(result.text);
  // Biçim bozuksa bir kez daha iste
  if (!reply) {
    result = await aiChat(system + "\n\nÖnceki cevabın JSON değildi. Sadece istenen JSON nesnesini yaz.", turns);
    if (result.ok) reply = parseSetupReply(result.text);
  }
  if (!reply) return NextResponse.json({ error: "Asistanın cevabı anlaşılamadı, tekrar deneyin." }, { status: 502 });
  return NextResponse.json(reply);
}

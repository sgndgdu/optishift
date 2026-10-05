import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDB } from "@/lib/db/client";
import { canManageLocation } from "@/lib/access";
import { aiChat, aiChatProvider, type ChatTurn } from "@/lib/ai/chat";
import { buildBusinessContext } from "@/lib/ai/businessContext";
import { businessToday } from "@/lib/date";

// İşletme Asistanı (lib/ai/chat). Bağlam: kullanıcının kapsamındaki işletme özeti (lib/ai/businessContext),
// her soruda sunucuda taze hazırlanır. location_id: şube ayrıntısı; yoksa (patron/bölge müdürü) tüm şubeler.
// Asistan sadece bilgi ve öneri verir, hiçbir kaydı değiştirmez.

const MAX_QUESTION = 500;
const MAX_TURNS = 8;
const DAILY_LIMIT = 60; // kişi başı, ücretsiz kotayı korumak için (sunucu örneği başına, kabaca)
const usage = new Map<string, { day: string; n: number }>();

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ enabled: auth.role !== "employee" && aiChatProvider() !== null });
}

function systemPrompt(context: string): string {
  return [
    "Sen OptiShift'in İşletme Asistanı'sın. Hesap sahibine ya da sorumluya personel, vardiya planı, izinler, onaylar,",
    "fazla mesai, uygunluk ve şube ayarları hakkında yardım ediyorsun.",
    "Kurallar:",
    "- Türkçe, kısa ve net yaz. Gerekirse madde işareti kullan.",
    "- Sadece aşağıdaki işletme verisine dayan. Veride olmayan bir şeyi uydurma; bilmiyorsan söyle ve nereden bakılacağını öner.",
    "- Sayıları, isimleri ve tarihleri veriden aynen al.",
    "- Hiçbir kaydı değiştiremezsin. İşlem önerirsen uygulamada nereden yapılacağını söyle",
    "  (Vardiya Planı, Ekip, Onaylar, Ayarlar, Raporlar, Açık Vardiyalar).",
    "- İş Kanunu sınırlarını (haftalık saat, 11 saat dinlenme, hafta tatili, yıllık izin) gözet; hukuki kesinlik iddia etme.",
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
  const result = await aiChat(systemPrompt(context), [...history, { role: "user", text: question }]);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ answer: result.text });
}

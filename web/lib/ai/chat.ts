/**
 * Yapay zekâ sohbeti: TEK GİRİŞ NOKTASI (Plan Asistanı sohbet kutusu).
 * Sağlayıcı ortam değişkenleriyle seçilir, kod değişmez:
 *  - varsayılan: GEMINI_API_KEY varsa Google Gemini (ücretsiz katman)
 *  - AI_PROVIDER=anthropic + ANTHROPIC_API_KEY: Claude (kurumsal müşteriler)
 * Model: GEMINI_MODEL (varsayılan "gemini-flash-latest", çalışmazsa "gemini-2.5-flash"),
 *        ANTHROPIC_MODEL (varsayılan "claude-opus-5").
 * Anahtar yoksa sohbet kapalıdır (aiChatProvider() null), ekran kutuyu göstermez.
 */
import Anthropic from "@anthropic-ai/sdk";

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type ChatResult = { ok: true; text: string } | { ok: false; error: string };
export type AiProvider = "gemini" | "anthropic";

export function aiChatProvider(): AiProvider | null {
  const want = process.env.AI_PROVIDER?.toLowerCase();
  if (want === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (want !== "gemini" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

const FAIL = "Asistan şu an cevap veremiyor, biraz sonra tekrar deneyin.";

async function geminiChat(system: string, turns: ChatTurn[]): Promise<ChatResult> {
  const key = process.env.GEMINI_API_KEY!;
  const models = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean) as string[];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map(t => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  });
  for (const model of [...new Set(models)]) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) return { ok: false, error: FAIL };
    if (res.status === 404) continue; // model adı bu hesapta yok: sıradakini dene
    if (res.status === 429) return { ok: false, error: "Ücretsiz kullanım sınırına ulaşıldı, birkaç dakika sonra tekrar deneyin." };
    if (!res.ok) {
      console.error("[ai/gemini]", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return { ok: false, error: FAIL };
    }
    const data = await res.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("").trim();
    return text ? { ok: true, text } : { ok: false, error: FAIL };
  }
  return { ok: false, error: FAIL };
}

async function anthropicChat(system: string, turns: ChatTurn[]): Promise<ChatResult> {
  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
      max_tokens: 16000,
      // Kısa, veriye dayalı cevaplar: düşük çaba yeterli ve ucuz
      output_config: { effort: "low" },
      system,
      messages: turns.map(t => ({ role: t.role, content: t.text })),
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "Bu soruya cevap verilemedi." };
    const text = response.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("").trim();
    return text ? { ok: true, text } : { ok: false, error: FAIL };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "Çok fazla istek, birkaç saniye sonra tekrar deneyin." };
    if (err instanceof Anthropic.APIError) console.error("[ai/anthropic]", err.status, err.message);
    else console.error("[ai/anthropic]", err);
    return { ok: false, error: FAIL };
  }
}

export async function aiChat(system: string, turns: ChatTurn[]): Promise<ChatResult> {
  const provider = aiChatProvider();
  if (!provider) return { ok: false, error: "Asistan sohbeti bu kurulumda kapalı." };
  return provider === "gemini" ? geminiChat(system, turns) : anthropicChat(system, turns);
}

/**
 * Yapay zekâ sohbeti: TEK GİRİŞ NOKTASI (Plan Asistanı sohbet kutusu).
 * Sağlayıcı ortam değişkenleriyle seçilir, kod değişmez:
 *  - varsayılan: GEMINI_API_KEY varsa Google Gemini (ücretsiz katman)
 *  - AI_PROVIDER=anthropic + ANTHROPIC_API_KEY: Claude (kurumsal müşteriler)
 * Model: GEMINI_MODEL (varsayılan "gemini-3.8-flash", bulunamazsa "gemini-flash-latest"; Interactions API),
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

/** models: Gemini model sırası (verilmezse varsayılan liste); timeoutMs: model başına süre */
export type ChatOptions = { thinking?: "low"; timeoutMs?: number; models?: string[] };

async function geminiChat(system: string, turns: ChatTurn[], opts: ChatOptions = {}): Promise<ChatResult> {
  // Interactions API (yeni hesaplarda generateContent ile yeni modeller 404 veriyor).
  // Geçmiş "step" biçiminde gönderilir, sunucuda saklanmaz (store: false).
  const key = process.env.GEMINI_API_KEY!;
  const models = opts.models ?? ([process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash"].filter(Boolean) as string[]);
  for (const model of [...new Set(models)]) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model,
        store: false,
        system_instruction: system,
        generation_config: { thinking_level: opts.thinking ?? "low", max_output_tokens: 4096 },
        input: turns.map(t => ({
          type: t.role === "assistant" ? "model_output" : "user_input",
          content: [{ type: "text", text: t.text }],
        })),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    }).catch((e) => { console.error("[ai/gemini] istek düştü", model, String(e).slice(0, 200)); return null; });
    if (!res) { if (opts.models) continue; return { ok: false, error: FAIL }; }
    // Model bu hesapta yok (404) ya da ücretsiz katmanda geçici yoğunluk (503/500): sıradaki modeli dene
    if (res.status === 404 || res.status === 503 || res.status === 500) {
      console.error("[ai/gemini] model atlandı", model, res.status, (await res.text().catch(() => "")).slice(0, 200));
      continue;
    }
    if (res.status === 429) return { ok: false, error: "Ücretsiz kullanım sınırına ulaşıldı, birkaç dakika sonra tekrar deneyin." };
    if (!res.ok) {
      console.error("[ai/gemini]", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return { ok: false, error: FAIL };
    }
    const data = await res.json().catch(() => null) as { steps?: { type?: string; content?: { type?: string; text?: string }[] }[] } | null;
    const text = (data?.steps ?? [])
      .filter(st => st.type === "model_output")
      .flatMap(st => (st.content ?? []).map(c => (c.type === "text" ? c.text ?? "" : "")))
      .join("").trim();
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

export async function aiChat(system: string, turns: ChatTurn[], opts: ChatOptions = {}): Promise<ChatResult> {
  const provider = aiChatProvider();
  if (!provider) return { ok: false, error: "Asistan sohbeti bu kurulumda kapalı." };
  return provider === "gemini" ? geminiChat(system, turns, opts) : anthropicChat(system, turns);
}

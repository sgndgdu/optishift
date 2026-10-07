import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { setupSystemPrompt } from "@/lib/ai/setupAssistant";

// GEÇİCİ ölçüm ucu (kurulum asistanı yavaşlığı): kaldırılacak
export const maxDuration = 60;

async function call(model: string, system: string, text: string, thinking: string) {
  const t0 = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ model, store: false, system_instruction: system, generation_config: { thinking_level: thinking, max_output_tokens: 4096 }, input: [{ type: "user_input", content: [{ type: "text", text }] }] }),
    signal: AbortSignal.timeout(40_000),
  }).catch(e => ({ status: -1, text: async () => String(e) } as unknown as Response));
  const body = await res.text().catch(() => "");
  return { model, thinking, ms: Date.now() - t0, status: res.status, out: body.slice(0, 300), len: body.length };
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin") return NextResponse.json({ error: "x" }, { status: 403 });
  const q = "12 kişilik bir kafeyiz, her gün 07-23 açığız, salon bar mutfak var.";
  const full = setupSystemPrompt("Test");
  const results = await Promise.all([
    call("gemini-3.8-flash", "Kısa cevap ver.", q, "low"),
    call("gemini-3.8-flash", full, q, "low"),
    call("gemini-flash-latest", full, q, "low"),
    call("gemini-3.5-flash", full, q, "low"),
    call("gemini-flash-lite-latest", full, q, "low"),
  ]);
  return NextResponse.json(results);
}

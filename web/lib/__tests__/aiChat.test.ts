import { describe, it, expect, afterEach, vi } from "vitest";
import { aiChatProvider, aiChat } from "@/lib/ai/chat";

const KEYS = ["AI_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"] as const;
afterEach(() => { for (const k of KEYS) vi.unstubAllEnvs(); });
const env = (vals: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) vi.stubEnv(k, vals[k] ?? "");
};

describe("aiChatProvider", () => {
  it("anahtar yoksa kapalı", () => { env({}); expect(aiChatProvider()).toBeNull(); });
  it("varsayılan: Gemini (ücretsiz)", () => {
    env({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" });
    expect(aiChatProvider()).toBe("gemini");
  });
  it("AI_PROVIDER=anthropic ile Claude", () => {
    env({ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" });
    expect(aiChatProvider()).toBe("anthropic");
  });
  it("Claude istenip anahtarı yoksa kapalı", () => {
    env({ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "g" });
    expect(aiChatProvider()).toBeNull();
  });
  it("kapalıyken aiChat hata döner, istek atmaz", async () => {
    env({});
    const r = await aiChat("s", [{ role: "user", text: "x" }]);
    expect(r.ok).toBe(false);
  });
  it("Gemini: 404 modelde sıradakini dener, cevabı birleştirir", async () => {
    env({ GEMINI_API_KEY: "g" });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (calls.length === 1) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Mer" }, { text: "haba" }] } }] }), { status: 200 });
    }));
    const r = await aiChat("s", [{ role: "user", text: "x" }]);
    expect(r).toEqual({ ok: true, text: "Merhaba" });
    expect(calls[0]).toContain("gemini-flash-latest");
    expect(calls[1]).toContain("gemini-2.5-flash");
    vi.unstubAllGlobals();
  });
});

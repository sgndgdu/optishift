/* eslint-disable @typescript-eslint/no-explicit-any */
// Factor 10: Küçük, odaklı ajan — SADECE haftalık planı açıklar.
// OR-Tools planlamayı yapar. Bu ajan sadece o planı Türkçe özetler.
//
// Adımlar (3-4 adım, hepsi bu kadar):
//   1. DB → hafta planını çek
//   2. Sıkıştırılmış bağlam oluştur (Factor 3: own your context window)
//   3. Claude'a gönder (Factor 2: own your prompts)
//   4. Yanıtı stream'le döndür

import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

const DAYS_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

// Factor 2: Own your prompts — prompt framework'e bırakılmaz, sabit yazılır
const SYSTEM_PROMPT = `Sen bir vardiya yönetim asistanısın. Müdürün hazırladığı haftalık vardiya planını analiz edip kısa bir özet sunarsın.

Şu üç konuyu ele al:
1. Haftanın genel durumu (kaç personel, kaç vardiya, kapsama)
2. Dikkat edilmesi gereken 1-2 nokta (yoğun gün, dengesizlik, eksik kapsama vb.)
3. Personel adalet dağılımı hakkında tek cümle

Kurallar:
- Türkçe yaz
- Kısa ve pratik ol, bullet point kullan
- Puan sayılarını tekrarlama, sadece yorum yap
- 150 kelimeyi aşma`;

// Factor 3: Own your context window — sadece LLM'in ihtiyacı olan veriyi sıkıştır
function buildContext(
  weekStart: string,
  locationName: string,
  shifts: any[],
  personnel: any[],
  shiftDefs: any[]
): string {
  const defMap: Record<string, string> = {};
  for (const sd of shiftDefs) {
    defMap[sd.id] = `${sd.name} (${sd.start_time}–${sd.end_time})`;
  }

  const personnelMap: Record<string, string> = {};
  const scoreMap: Record<string, number> = {};
  for (const p of personnel) {
    personnelMap[p.id] = p.name;
    scoreMap[p.id] = p.prev_score ?? 0;
  }

  // Günlere göre grupla
  const byDay: Record<number, string[]> = {};
  for (const s of shifts) {
    const day = s.day as number;
    if (!byDay[day]) byDay[day] = [];
    const name = personnelMap[s.personnel_id] ?? "?";
    const shiftLabel = defMap[s.shift_id] ?? s.shift_id;
    byDay[day].push(`${name} → ${shiftLabel}`);
  }

  const dailyLines = DAYS_TR.map((dayName, idx) => {
    const entries = byDay[idx];
    if (!entries?.length) return `  ${dayName}: boş`;
    return `  ${dayName}: ${entries.join(", ")}`;
  }).join("\n");

  const scoreLines = Object.entries(scoreMap)
    .sort(([, a], [, b]) => b - a)
    .map(([pid, score]) => `  ${personnelMap[pid] ?? pid}: ${score.toFixed(1)} puan`)
    .join("\n");

  return [
    `Hafta: ${weekStart}`,
    `Lokasyon: ${locationName}`,
    `Toplam atanan vardiya: ${shifts.length}`,
    ``,
    `Günlük dağılım:`,
    dailyLines,
    ``,
    `Personel kümülatif adalet puanları (yüksek = daha fazla yük almış):`,
    scoreLines,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "employee") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY tanımlı değil" }, { status: 503 });
  }

  const { week_start, location_id } = await req.json();
  if (!week_start || !location_id) {
    return NextResponse.json({ error: "week_start ve location_id zorunlu" }, { status: 400 });
  }

  const db = new Database(DB_PATH);
  let context: string;
  try {
    // Lokasyon bilgisi + shift tanımları
    const loc = db.prepare(
      `SELECT name, shift_definitions FROM locations WHERE id = ? AND org_id = ?`
    ).get(location_id, auth.org_id) as any;

    if (!loc) {
      db.close();
      return NextResponse.json({ error: "Lokasyon bulunamadı" }, { status: 404 });
    }

    const shiftDefs = loc.shift_definitions
      ? JSON.parse(loc.shift_definitions)
      : [];

    // Bu haftanın atamaları
    const shifts = db.prepare(`
      SELECT personnel_id, day, shift_id, start_time, end_time
      FROM shift_assignments
      WHERE location_id = ? AND week_start = ?
    `).all(location_id, week_start) as any[];

    // Personel isimleri + adalet puanları
    const personnel = db.prepare(`
      SELECT id, name, prev_score
      FROM personnel
      WHERE primary_location_id = ? AND org_id = ?
    `).all(location_id, auth.org_id) as any[];

    db.close();

    // Adım 2: sıkıştırılmış bağlam oluştur
    context = buildContext(week_start, loc.name, shifts, personnel, shiftDefs);
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // Adım 3+4: Claude'a gönder, stream ile döndür
  const client = new Anthropic({ apiKey });

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: context }],
  });

  // Response stream'i doğrudan client'a ilet
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

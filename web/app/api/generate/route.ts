import { execSync } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

const ENGINE_PATH = path.resolve(process.cwd(), "../engine/optishift_engine.py");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prevScores: Record<string, number> = body.prevScores ?? {};

  try {
    const stdout = execSync(
      `python3 "${ENGINE_PATH}" --api '${JSON.stringify(prevScores)}'`,
      { timeout: 15000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    // stdout'ta yalnızca son satır JSON — debug satırlarını atla
    const jsonLine = stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1) ?? stdout;
    const data = JSON.parse(jsonLine);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

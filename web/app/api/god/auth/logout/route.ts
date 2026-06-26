import { NextResponse } from "next/server";
import { clearGodCookie } from "@/lib/god-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearGodCookie(res);
  return res;
}

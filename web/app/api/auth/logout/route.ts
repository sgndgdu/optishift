import { NextResponse } from "next/server";
import { clearCookie } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearCookie(res);
  return res;
}

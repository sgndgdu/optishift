import crypto from "crypto";

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function resetTokenExpiresAt(): number {
  // 1 saat geçerli
  return Math.floor(Date.now() / 1000) + 3600;
}

export function buildResetUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/reset-password?token=${token}`;
}

// Basit bellek-içi sabit pencere rate limiter.
// Not: Serverless ortamda her instance kendi sayacını tutar (Fluid Compute instance'ları
// yeniden kullandığı için pratikte etkilidir ama dağıtık saldırılara karşı tam garanti
// vermez). Daha güçlü bir sınır için ileride Upstash Redis / Vercel KV eklenmesi önerilir.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Bellek büyümesini önlemek için düzenli temizlik
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * `key` için istek sayacını artırır. Limit aşıldıysa `false` döner.
 * `windowMs` içinde en fazla `limit` istek serbest bırakılır.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/** Başarılı işlemden sonra sayacı sıfırlamak için (örn. doğru şifre girildiğinde) */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function getClientIp(req: Request): string {
  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

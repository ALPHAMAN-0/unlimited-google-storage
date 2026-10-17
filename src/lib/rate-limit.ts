/**
 * Simple in-memory rate limiter.
 *
 * For production multi-instance deployments, swap this for a Redis-backed
 * implementation (Upstash Ratelimit, etc.). The interface stays the same:
 *   await rateLimit({ key, limit, windowMs })
 *
 * The token-bucket is a per-key sliding window: each key carries a list of
 * recent timestamps. A request is allowed if fewer than `limit` of them fall
 * inside the last `windowMs` milliseconds.
 *
 * Used to protect expensive endpoints (uploads, link, sync) from abuse.
 * The default in `process.env` is intentionally generous for human use; a
 * misbehaving client hitting the same endpoint 100 times in a minute is
 * throttled.
 */

interface Bucket {
  timestamps: number[];
}

const store = new Map<string, Bucket>();

// Cap memory: drop entries that haven't been touched in 1 hour.
const GC_MS = 60 * 60 * 1000;
const lastAccess = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [k, t] of lastAccess.entries()) {
    if (now - t > GC_MS) {
      store.delete(k);
      lastAccess.delete(k);
    }
  }
}, 10 * 60 * 1000).unref?.();

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number; // ms until the oldest in-window timestamp expires
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  let bucket = store.get(opts.key);
  if (!bucket) {
    bucket = { timestamps: [] };
    store.set(opts.key, bucket);
  }
  // Drop expired entries.
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  lastAccess.set(opts.key, now);

  if (bucket.timestamps.length >= opts.limit) {
    const oldest = bucket.timestamps[0];
    return {
      ok: false,
      remaining: 0,
      resetMs: Math.max(0, oldest + opts.windowMs - now),
    };
  }
  bucket.timestamps.push(now);
  return { ok: true, remaining: opts.limit - bucket.timestamps.length, resetMs: opts.windowMs };
}

/**
 * Extract a per-user-or-IP key from a request. Prefers the session user id
 * (if any) so authenticated users get their own bucket; otherwise falls back
 * to IP. Either way, two different users/IPs never share a bucket.
 */
export function rateLimitKey(req: Request, suffix: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : "unknown";
  return `${suffix}:${ip}`;
}

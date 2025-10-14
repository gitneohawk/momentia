// src/lib/rate-limit.ts
/**
 * Very small, dependency-free rate limiter with optional Upstash Redis REST.
 * - If env UPSTASH_REDIS_REST_URL/TOKEN exist, uses Redis (shared, multi-instance safe)
 * - Otherwise falls back to in-memory Map (per-instance, good enough for now)
 *
 * Usage:
 *   const limiter = createRateLimiter({ prefix: 'checkout', limit: 60, windowMs: 60_000 });
 *   const { ok, remaining, resetSec } = await limiter.hit(ipOrKey);
 *   if (!ok) { res.status = 429; res.headers['Retry-After'] = String(resetSec); }
 */

type HitResult = { ok: boolean; remaining: number; resetSec: number };

type Limiter = {
  hit(key: string): Promise<HitResult>;
};

type Options = {
  /** namespace key (route name) */
  prefix: string;
  /** allowed hits per window */
  limit: number;
  /** window size in ms */
  windowMs: number;
};

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;

/* -------------------- Upstash (REST) backend -------------------- */
function createUpstashLimiter(opts: Options): Limiter {
  const base = UPSTASH_URL!;
  const token = UPSTASH_TOKEN!;
  const headers = { Authorization: `Bearer ${token}` };

  async function incrWithTTL(key: string, ttlSec: number) {
    // Use EVAL for atomic get+incr+ttl (works on Upstash)
    // Lua script: local v=redis.call('INCR',KEYS[1]); if v==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return v
    const body = {
      // Upstash EVAL format
      // https://docs.upstash.com/redis/features/transactions#eval
      // Alternatively, pipeline INCR + EXPIRE when v==1 (two requests). EVAL keeps it atomic.
      script:
        "local v=redis.call('INCR',KEYS[1]); if v==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return v",
      keys: [key],
      args: [String(ttlSec)],
    };
    const resp = await fetch(`${base}/eval`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`Upstash eval failed: ${resp.status} ${await resp.text()}`);
    }
    const data = (await resp.json()) as { result: number };
    return data.result ?? 1;
  }

  async function ttl(key: string): Promise<number> {
    const resp = await fetch(`${base}/ttl/${encodeURIComponent(key)}`, { headers });
    if (!resp.ok) return -1;
    const data = (await resp.json()) as { result: number };
    return typeof data.result === "number" ? data.result : -1;
  }

  return {
    async hit(id: string): Promise<HitResult> {
      const ttlSec = Math.ceil(opts.windowMs / 1000);
      const nowKey = `${opts.prefix}:${id}`;
      const count = await incrWithTTL(nowKey, ttlSec);
      const remaining = Math.max(0, opts.limit - count);
      let reset = await ttl(nowKey);
      if (reset < 0) reset = ttlSec; // fallback if TTL unsupported response
      const ok = count <= opts.limit;
      return { ok, remaining, resetSec: reset };
    },
  };
}

/* -------------------- In-memory backend (per instance) -------------------- */
function createMemoryLimiter(opts: Options): Limiter {
  type Rec = { c: number; resetAt: number };
  const cache: Map<string, Rec> =
    (globalThis as any).__momentiaRL__ ?? new Map<string, Rec>();
  (globalThis as any).__momentiaRL__ = cache;

  function now() {
    return Date.now();
  }

  return {
    async hit(id: string): Promise<HitResult> {
      const k = `${opts.prefix}:${id}`;
      const t = now();
      const cur = cache.get(k);
      if (!cur || cur.resetAt <= t) {
        cache.set(k, { c: 1, resetAt: t + opts.windowMs });
        return { ok: true, remaining: opts.limit - 1, resetSec: Math.ceil(opts.windowMs / 1000) };
        }
      cur.c += 1;
      const ok = cur.c <= opts.limit;
      const remaining = Math.max(0, opts.limit - cur.c);
      const resetSec = Math.max(1, Math.ceil((cur.resetAt - t) / 1000));
      return { ok, remaining, resetSec };
    },
  };
}

/* -------------------- public factory -------------------- */
export function createRateLimiter(opts: Options): Limiter {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    return createUpstashLimiter(opts);
  }
  return createMemoryLimiter(opts);
}
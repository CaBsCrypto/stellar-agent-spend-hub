import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { readUpstashConfig } from "./upstashConfig.mjs";

export class PilotRateLimiter {
  constructor({ env = process.env, redis = null, now = () => Date.now() } = {}) {
    this.now = now;
    this.memory = new Map();
    const config = readUpstashConfig(env);
    this.redis = redis || (config.configured ? new Redis({ url: config.url, token: config.token }) : null);
    this.minute = this.redis && new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.fixedWindow(20, "60 s"),
      prefix: "spendhub:pilot:rate:minute",
    });
    this.daily = this.redis && new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.fixedWindow(100, "24 h"),
      prefix: "spendhub:pilot:rate:daily",
    });
  }

  async enforce({ tenantId, ip }) {
    if (!this.redis) return this.enforceMemory({ tenantId, ip });
    const [minute, daily] = await Promise.all([
      this.minute.limit(`${tenantId}:${ip}`),
      this.daily.limit(tenantId),
    ]);
    if (!minute.success || !daily.success) throw rateError(Math.max(minute.reset, daily.reset));
    return {
      remainingMinute: minute.remaining,
      remainingDaily: daily.remaining,
    };
  }

  enforceMemory({ tenantId, ip }) {
    const now = this.now();
    const minute = consume(this.memory, `minute:${tenantId}:${ip}`, 20, 60_000, now);
    const daily = consume(this.memory, `daily:${tenantId}`, 100, 86_400_000, now);
    if (!minute.allowed || !daily.allowed) throw rateError(Math.max(minute.resetAt, daily.resetAt));
    return {
      remainingMinute: minute.remaining,
      remainingDaily: daily.remaining,
    };
  }
}

function consume(store, key, limit, windowMs, now) {
  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + windowMs };
  entry.count += 1;
  store.set(key, entry);
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}

function rateError(resetAt) {
  return Object.assign(new Error("Pilot rate limit exceeded"), {
    status: 429,
    retryAfter: Math.max(1, Math.ceil((Number(resetAt) - Date.now()) / 1000)),
  });
}

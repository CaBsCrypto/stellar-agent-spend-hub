import { Redis } from "@upstash/redis";
import { Store } from "@stellar/mpp/charge/server";

const DEFAULT_PREFIX = "spendhub:mpp:";
const MAX_CAS_ATTEMPTS = 12;
const REDIS_CAS_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if ARGV[1] == "__SPENDHUB_NULL__" then
  if current then return 0 end
elseif current ~= ARGV[1] then
  return 0
end
if ARGV[2] == "set" then
  redis.call("SET", KEYS[1], ARGV[3], "EX", ARGV[4])
elseif ARGV[2] == "delete" then
  redis.call("DEL", KEYS[1])
end
return 1
`;

export function createMppAtomicStore({ env = process.env, redis = null, keyPrefix = DEFAULT_PREFIX } = {}) {
  if (!redis && hasUpstash(env)) {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
      automaticDeserialization: false,
    });
  }
  if (!redis) {
    if (env.NODE_ENV === "production" && env.MPP_STORE_MODE !== "memory") {
      throw httpError(503, "Upstash Redis is required for production MPP replay protection");
    }
    return Store.memory({ keyPrefix });
  }
  return Store.upstash(createAtomicRedisAdapter(redis, {
    ttlSeconds: Number(env.MPP_STORE_TTL_SECONDS || 2_592_000),
  }), { keyPrefix });
}

export function createAtomicRedisAdapter(redis, { ttlSeconds = 2_592_000 } = {}) {
  const ttl = Math.max(600, Math.floor(ttlSeconds));
  return {
    async get(key) {
      return decode(await redis.get(key));
    },
    async set(key, value) {
      await redis.set(key, encode(value), { ex: ttl });
    },
    async del(key) {
      await redis.del(key);
    },
    async update(key, fn) {
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        const currentRaw = await redis.get(key);
        const current = decode(currentRaw);
        const change = fn(current);
        if (change.op === "noop") return change.result;
        const nextRaw = change.op === "set" ? encode(change.value) : "";
        const applied = await redis.eval(
          REDIS_CAS_SCRIPT,
          [key],
          [currentRaw == null ? "__SPENDHUB_NULL__" : String(currentRaw), change.op, nextRaw, String(ttl)],
        );
        if (Number(applied) === 1) return change.result;
      }
      throw httpError(409, "MPP atomic store contention exceeded retry budget");
    },
  };
}

export function mppStoreReadiness(env = process.env) {
  const configured = hasUpstash(env);
  const memoryAllowed = env.NODE_ENV !== "production" || env.MPP_STORE_MODE === "memory";
  return {
    status: configured ? "upstash-atomic" : memoryAllowed ? "memory-local" : "blocked",
    configured,
    atomic: true,
    productionReady: configured,
    detail: configured
      ? "Upstash Redis CAS store configured for MPP replay protection."
      : memoryAllowed
        ? "Atomic in-memory store selected for local development only."
        : "Upstash Redis credentials are required in production.",
  };
}

function hasUpstash(env) {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

function encode(value) {
  return JSON.stringify(value);
}

function decode(value) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}


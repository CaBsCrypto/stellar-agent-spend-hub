import { Redis } from "@upstash/redis";
import { readUpstashConfig } from "./upstashConfig.mjs";

const TTL_SECONDS = 30 * 24 * 60 * 60;
const PREFIX = "spendhub:pilot:";
const CAS_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then return -1 end
local decoded = cjson.decode(current)
if tonumber(decoded.version) ~= tonumber(ARGV[1]) then return 0 end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`;
const CREATE_SCRIPT = `
local existing = redis.call("GET", KEYS[2])
if existing then return existing end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("SET", KEYS[2], ARGV[3], "EX", ARGV[2])
redis.call("LPUSH", KEYS[3], ARGV[3])
redis.call("LTRIM", KEYS[3], 0, 99)
redis.call("EXPIRE", KEYS[3], ARGV[2])
return ARGV[3]
`;

export class PilotRepository {
  constructor({ env = process.env, redis = undefined } = {}) {
    this.redis = redis === undefined ? createRedis(env) : redis;
    this.memory = new Map();
    this.idempotency = new Map();
    this.order = [];
  }

  async create(record) {
    const safe = clone(record);
    if (!this.redis) {
      const index = idemKey(safe.tenantId, safe.idempotencyDigest);
      const existingId = this.idempotency.get(index);
      if (existingId) return this.get(existingId, safe.tenantId);
      this.memory.set(requestKey(safe.tenantId, safe.requestId), safe);
      this.idempotency.set(index, safe.requestId);
      this.order.unshift(safe.requestId);
      return clone(safe);
    }
    const id = await this.redis.eval(
      CREATE_SCRIPT,
      [requestKey(safe.tenantId, safe.requestId), idemKey(safe.tenantId, safe.idempotencyDigest), listKey(safe.tenantId)],
      [JSON.stringify(safe), String(TTL_SECONDS), safe.requestId],
    );
    return this.get(String(id), safe.tenantId);
  }

  async get(requestId, tenantId) {
    const value = this.redis
      ? await this.redis.get(requestKey(tenantId, requestId))
      : this.memory.get(requestKey(tenantId, requestId));
    if (!value) return null;
    return clone(typeof value === "string" ? JSON.parse(value) : value);
  }

  async update(requestId, tenantId, mutate) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.get(requestId, tenantId);
      if (!current) throw httpError(404, "Pilot request not found");
      const next = clone(mutate(clone(current)));
      next.version = current.version + 1;
      next.updatedAt = new Date().toISOString();
      if (!this.redis) {
        const live = this.memory.get(requestKey(tenantId, requestId));
        if (!live || live.version !== current.version) continue;
        this.memory.set(requestKey(tenantId, requestId), next);
        return clone(next);
      }
      const applied = Number(await this.redis.eval(
        CAS_SCRIPT,
        [requestKey(tenantId, requestId)],
        [String(current.version), JSON.stringify(next), String(TTL_SECONDS)],
      ));
      if (applied === 1) return next;
      if (applied === -1) throw httpError(404, "Pilot request not found");
    }
    throw httpError(409, "Pilot request changed concurrently");
  }

  async list(tenantId, limit = 20) {
    if (!this.redis) {
      const values = await Promise.all(this.order.slice(0, limit).map((id) => this.get(id, tenantId)));
      return values.filter(Boolean);
    }
    const ids = await this.redis.lrange(listKey(tenantId), 0, Math.max(0, limit - 1));
    const values = await Promise.all(ids.map((id) => this.get(String(id), tenantId)));
    return values.filter(Boolean);
  }
}

export function pilotRepositoryReadiness(env = process.env) {
  const configured = readUpstashConfig(env).configured;
  return {
    configured,
    status: configured ? "upstash" : env.NODE_ENV === "production" ? "blocked" : "memory-local",
  };
}

function createRedis(env) {
  const config = readUpstashConfig(env);
  if (!config.configured) {
    if (env.NODE_ENV === "production") throw httpError(503, "Upstash is required for the remote MCP pilot");
    return null;
  }
  return new Redis({ url: config.url, token: config.token, automaticDeserialization: false });
}

function requestKey(tenantId, requestId) {
  return `${PREFIX}${tenantId}:request:${requestId}`;
}

function idemKey(tenantId, digest) {
  return `${PREFIX}${tenantId}:idempotency:${digest}`;
}

function listKey(tenantId) {
  return `${PREFIX}${tenantId}:requests`;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

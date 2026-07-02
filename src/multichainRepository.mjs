import { Redis } from "@upstash/redis";
import { readUpstashConfig } from "./upstashConfig.mjs";

const PREFIX = "spendhub:multichain:";
const TTL_SECONDS = 30 * 24 * 60 * 60;
const CAS_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then return -1 end
local decoded = cjson.decode(current)
if tonumber(decoded.version) ~= tonumber(ARGV[1]) then return 0 end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`;

export class MultichainRepository {
  constructor({ env = process.env, redis = undefined } = {}) {
    this.redis = redis === undefined ? createRedis(env) : redis;
    this.memory = new Map();
    this.order = [];
  }

  async create(record) {
    const value = clone(record);
    const key = recordKey(value.kind, value.id);
    if (this.redis) {
      const created = await this.redis.set(key, JSON.stringify(value), { nx: true, ex: TTL_SECONDS });
      if (!created) throw httpError(409, "Multichain record already exists");
      await this.redis.lpush(listKey(value.kind), value.id);
      await this.redis.ltrim(listKey(value.kind), 0, 99);
      await this.redis.expire(listKey(value.kind), TTL_SECONDS);
    } else {
      if (this.memory.has(key)) throw httpError(409, "Multichain record already exists");
      this.memory.set(key, value);
      this.order.unshift({ kind: value.kind, id: value.id });
    }
    return clone(value);
  }

  async get(kind, id) {
    const value = this.redis
      ? await this.redis.get(recordKey(kind, id))
      : this.memory.get(recordKey(kind, id));
    if (!value) return null;
    return clone(typeof value === "string" ? JSON.parse(value) : value);
  }

  async update(kind, id, mutate) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.get(kind, id);
      if (!current) throw httpError(404, "Multichain record not found");
      const next = clone(mutate(clone(current)));
      next.version = current.version + 1;
      next.updatedAt = new Date().toISOString();
      if (!this.redis) {
        const live = this.memory.get(recordKey(kind, id));
        if (!live || live.version !== current.version) continue;
        this.memory.set(recordKey(kind, id), next);
        return clone(next);
      }
      const result = Number(await this.redis.eval(
        CAS_SCRIPT,
        [recordKey(kind, id)],
        [String(current.version), JSON.stringify(next), String(TTL_SECONDS)],
      ));
      if (result === 1) return next;
      if (result === -1) throw httpError(404, "Multichain record not found");
    }
    throw httpError(409, "Multichain record changed concurrently");
  }

  async list(kind, limit = 20) {
    if (!this.redis) {
      const ids = this.order.filter((entry) => entry.kind === kind).slice(0, limit);
      return Promise.all(ids.map((entry) => this.get(kind, entry.id)));
    }
    const ids = await this.redis.lrange(listKey(kind), 0, Math.max(0, limit - 1));
    return (await Promise.all(ids.map((id) => this.get(kind, String(id))))).filter(Boolean);
  }
}

export function multichainRepositoryReadiness(env = process.env) {
  const configured = readUpstashConfig(env).configured;
  return {
    configured,
    status: configured ? "upstash" : env.NODE_ENV === "production" ? "blocked" : "memory-local",
  };
}

function createRedis(env) {
  const config = readUpstashConfig(env);
  if (!config.configured) return null;
  return new Redis({ url: config.url, token: config.token, automaticDeserialization: false });
}

function recordKey(kind, id) {
  return `${PREFIX}${kind}:${id}`;
}

function listKey(kind) {
  return `${PREFIX}${kind}:order`;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

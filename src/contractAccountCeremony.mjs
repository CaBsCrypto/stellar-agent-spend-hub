import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { validateRegistration } from "./adminContractAccountDeploy.mjs";
import { readUpstashConfig } from "./upstashConfig.mjs";

export const CONTRACT_ACCOUNT_CEREMONY_TTL_SECONDS = 600;
export const CONTRACT_ACCOUNT_RP_ID = "agente-pagos-stellar.vercel.app";
export const CONTRACT_ACCOUNT_ORIGIN = `https://${CONTRACT_ACCOUNT_RP_ID}`;

const CLAIM_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return nil end
local value = cjson.decode(raw)
if value.status ~= "pending" then return "__REPLAY__" end
if value.expiresAt <= ARGV[1] then return "__EXPIRED__" end
value.status = "claimed"
value.claimedAt = ARGV[1]
redis.call("SET", KEYS[1], cjson.encode(value), "EX", ARGV[2])
return raw
`;

export class ContractAccountCeremonyService {
  constructor({
    env = process.env,
    repository = null,
    now = () => new Date(),
    idFactory = randomUUID,
    rateLimiter = null,
  } = {}) {
    this.env = env;
    this.repository = repository || new ContractAccountCeremonyRepository({ env });
    this.now = now;
    this.idFactory = idFactory;
    this.rateLimiter = rateLimiter || createRateLimiter(env);
  }

  async register(body = {}, { ip = "local" } = {}) {
    await this.enforceRateLimit(ip);
    rejectPrivateCeremonyFields(body);
    if (body.rpId !== CONTRACT_ACCOUNT_RP_ID) throw httpError(409, "Passkey RP ID is not allowed");
    const registration = validateRegistration({
      ownerPublicKeyHex: body.ownerPublicKeyHex || body.publicKey,
      credentialIdHash: body.credentialIdHash,
      rpIdHash: body.rpIdHash,
      originHash: body.originHash,
    });
    if (!registration.ownerPublicKeyHex.startsWith("04")) {
      throw httpError(400, "Passkey public key must be uncompressed P-256");
    }
    if (registration.rpIdHash !== sha256Hex(CONTRACT_ACCOUNT_RP_ID)) {
      throw httpError(409, "Passkey RP ID hash does not match production");
    }
    if (registration.originHash !== sha256Hex(CONTRACT_ACCOUNT_ORIGIN)) {
      throw httpError(409, "Passkey origin does not match production");
    }
    const createdAt = this.now();
    const record = {
      ceremonyId: this.idFactory(),
      status: "pending",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + CONTRACT_ACCOUNT_CEREMONY_TTL_SECONDS * 1_000).toISOString(),
      rpId: CONTRACT_ACCOUNT_RP_ID,
      ownerKeyFingerprint: sha256Hex(Buffer.from(registration.ownerPublicKeyHex, "hex")).slice(0, 16),
      registration,
    };
    await this.repository.save(record);
    return publicCeremony(record);
  }

  async status(ceremonyId) {
    validateCeremonyId(ceremonyId);
    const record = await this.repository.get(ceremonyId);
    if (!record) throw httpError(404, "Passkey ceremony not found or expired");
    const status = record.status === "pending" && record.expiresAt <= this.now().toISOString()
      ? "expired"
      : record.status;
    return publicCeremony({ ...record, status });
  }

  async claim(ceremonyId) {
    validateCeremonyId(ceremonyId);
    return this.repository.claim(ceremonyId, this.now());
  }

  async complete(ceremonyId, result) {
    return this.repository.complete(ceremonyId, result, this.now());
  }

  async fail(ceremonyId) {
    return this.repository.fail(ceremonyId, this.now());
  }

  async enforceRateLimit(ip) {
    if (!this.rateLimiter) return;
    const result = await this.rateLimiter.limit(`contract-account-ceremony:${ip}`);
    if (!result.success) throw httpError(429, "Passkey ceremony rate limit exceeded");
  }
}

export class ContractAccountCeremonyRepository {
  constructor({ env = process.env, redis = null } = {}) {
    this.env = env;
    this.redis = redis || createRedis(env);
    this.records = new Map();
  }

  async save(record) {
    this.assertProductionStore();
    if (this.redis) {
      await this.redis.set(ceremonyKey(record.ceremonyId), record, { ex: CONTRACT_ACCOUNT_CEREMONY_TTL_SECONDS });
    } else {
      this.records.set(record.ceremonyId, structuredClone(record));
    }
    return record;
  }

  async get(ceremonyId) {
    this.assertProductionStore();
    if (this.redis) return this.redis.get(ceremonyKey(ceremonyId));
    return this.records.get(ceremonyId) || null;
  }

  async claim(ceremonyId, now = new Date()) {
    this.assertProductionStore();
    if (this.redis) {
      const raw = await this.redis.eval(
        CLAIM_SCRIPT,
        [ceremonyKey(ceremonyId)],
        [now.toISOString(), String(CONTRACT_ACCOUNT_CEREMONY_TTL_SECONDS)],
      );
      if (raw === "__REPLAY__") throw httpError(409, "Passkey ceremony already consumed");
      if (raw === "__EXPIRED__") throw httpError(410, "Passkey ceremony expired");
      if (!raw) throw httpError(404, "Passkey ceremony not found or expired");
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    const record = this.records.get(ceremonyId);
    if (!record) throw httpError(404, "Passkey ceremony not found or expired");
    if (record.status !== "pending") throw httpError(409, "Passkey ceremony already consumed");
    if (record.expiresAt <= now.toISOString()) throw httpError(410, "Passkey ceremony expired");
    this.records.set(ceremonyId, { ...record, status: "claimed", claimedAt: now.toISOString() });
    return structuredClone(record);
  }

  async complete(ceremonyId, result, now = new Date()) {
    return this.update(ceremonyId, {
      status: "deployed",
      deployedAt: now.toISOString(),
      contractId: result.contractId,
      transactionHash: result.transactionHash,
    });
  }

  async fail(ceremonyId, now = new Date()) {
    return this.update(ceremonyId, { status: "failed", failedAt: now.toISOString() });
  }

  async update(ceremonyId, patch) {
    const current = await this.get(ceremonyId);
    if (!current) return null;
    const next = { ...current, ...patch };
    if (this.redis) {
      await this.redis.set(ceremonyKey(ceremonyId), next, { ex: CONTRACT_ACCOUNT_CEREMONY_TTL_SECONDS });
    } else {
      this.records.set(ceremonyId, next);
    }
    return next;
  }

  assertProductionStore() {
    const production = this.env.VERCEL === "1" || this.env.NODE_ENV === "production";
    if (production && !this.redis) throw httpError(503, "Passkey ceremony store is unavailable");
  }
}

function publicCeremony(record) {
  return {
    ceremonyId: record.ceremonyId,
    status: record.status,
    rpId: record.rpId,
    ownerKeyFingerprint: record.ownerKeyFingerprint,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    contractId: record.status === "deployed" ? record.contractId || null : null,
    transactionHash: record.status === "deployed" ? publicHash(record.transactionHash) : null,
  };
}

function rejectPrivateCeremonyFields(value, path = "registration") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      ["credentialid", "rawid", "assertion", "signature", "xdr", "secret", "token", "authenticatordata", "clientdatajson"].includes(normalized)
    ) {
      throw httpError(400, `Private passkey field is not allowed: ${path}.${key}`);
    }
    rejectPrivateCeremonyFields(child, `${path}.${key}`);
  }
}

function validateCeremonyId(value) {
  if (!/^[0-9a-f-]{36}$/i.test(value || "")) throw httpError(400, "Invalid ceremonyId");
}

function ceremonyKey(ceremonyId) {
  return `spendhub:account:ceremony:${ceremonyId}`;
}

function createRedis(env) {
  const upstash = readUpstashConfig(env);
  return upstash.configured ? new Redis({ url: upstash.url, token: upstash.token }) : null;
}

function createRateLimiter(env) {
  const upstash = readUpstashConfig(env);
  if (!upstash.configured) return null;
  const redis = new Redis({ url: upstash.url, token: upstash.token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "spendhub:account:ceremony-rate",
    analytics: false,
  });
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function publicHash(value) {
  return /^[a-f0-9]{64}$/i.test(value || "") ? value.toLowerCase() : null;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

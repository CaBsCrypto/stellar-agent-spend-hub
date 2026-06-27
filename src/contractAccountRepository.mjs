import { Redis } from "@upstash/redis";

const REQUEST_TTL_SECONDS = 600;
const RECEIPT_TTL_SECONDS = 2_592_000;
const CONSUME_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return nil end
local value = cjson.decode(raw)
if value.status ~= "prepared" then return "__REPLAY__" end
value.status = "submitting"
value.consumedAt = ARGV[1]
redis.call("SET", KEYS[1], cjson.encode(value), "EX", ARGV[2])
return raw
`;

export class ContractAccountRepository {
  constructor({ env = process.env, redis = null } = {}) {
    this.redis = redis || createRedis(env);
    this.requests = new Map();
    this.receipts = [];
  }

  async saveRequest(value) {
    if (this.redis) {
      await this.redis.set(requestKey(value.requestId), value, { ex: REQUEST_TTL_SECONDS });
    } else {
      this.requests.set(value.requestId, value);
    }
    return value;
  }

  async getRequest(requestId) {
    if (this.redis) return this.redis.get(requestKey(requestId));
    return this.requests.get(requestId) || null;
  }

  async consumeRequest(requestId, now = new Date()) {
    if (this.redis) {
      const raw = await this.redis.eval(
        CONSUME_SCRIPT,
        [requestKey(requestId)],
        [now.toISOString(), String(REQUEST_TTL_SECONDS)],
      );
      if (raw === "__REPLAY__") throw httpError(409, "Contract account request already consumed");
      if (!raw) throw httpError(404, "Contract account request not found or expired");
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    const current = this.requests.get(requestId);
    if (!current) throw httpError(404, "Contract account request not found or expired");
    if (current.status !== "prepared") throw httpError(409, "Contract account request already consumed");
    this.requests.set(requestId, { ...current, status: "submitting", consumedAt: now.toISOString() });
    return current;
  }

  async markFailed(requestId, errorCode) {
    const current = await this.getRequest(requestId);
    if (!current) return;
    const next = { ...current, status: "failed", errorCode };
    if (this.redis) await this.redis.set(requestKey(requestId), next, { ex: REQUEST_TTL_SECONDS });
    else this.requests.set(requestId, next);
  }

  async saveReceipt(receipt) {
    const safe = sanitizeContractAccountReceipt(receipt);
    if (this.redis) {
      await this.redis.set(`spendhub:account:receipt:${safe.transactionHash}`, safe, {
        ex: RECEIPT_TTL_SECONDS,
      });
      await this.redis.lpush("spendhub:account:receipts", safe.transactionHash);
      await this.redis.ltrim("spendhub:account:receipts", 0, 99);
      await this.redis.expire("spendhub:account:receipts", RECEIPT_TTL_SECONDS);
    } else {
      this.receipts = [safe, ...this.receipts.filter((item) => item.transactionHash !== safe.transactionHash)].slice(0, 100);
    }
    return safe;
  }

  async listReceipts(limit = 20) {
    const safeLimit = Math.min(20, Math.max(1, Number(limit) || 20));
    if (!this.redis) return this.receipts.slice(0, safeLimit);
    const hashes = await this.redis.lrange("spendhub:account:receipts", 0, safeLimit - 1);
    if (!hashes.length) return [];
    const values = await Promise.all(
      hashes.map((hashValue) => this.redis.get(`spendhub:account:receipt:${hashValue}`)),
    );
    return values.filter(Boolean);
  }
}

export function sanitizeContractAccountReceipt(receipt) {
  return {
    protocol: "soroban-contract-account-v1",
    status: "settled",
    network: "stellar:testnet",
    transactionHash: /^[a-f0-9]{64}$/i.test(receipt.transactionHash || "")
      ? receipt.transactionHash.toLowerCase()
      : null,
    contractId: receipt.contractId,
    action: receipt.action,
    assetContractId: receipt.assetContractId || null,
    destination: receipt.destination || null,
    amount: receipt.amount == null ? null : String(receipt.amount),
    policyDecision: "allow",
    signerType: receipt.signerType,
    settledAt: receipt.settledAt,
  };
}

function createRedis(env) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function requestKey(requestId) {
  return `spendhub:account:request:${requestId}`;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

import { Redis } from "@upstash/redis";
import { readUpstashConfig } from "./upstashConfig.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

const RECEIPT_TTL_SECONDS = 2_592_000;

export class MppReceiptRepository {
  constructor({ env = process.env, redis = null } = {}) {
    this.env = env;
    this.redis = redis || createRedis(env);
    this.memoryReceipts = [];
    this.reportCache = new Map();
  }

  async cacheRiskReport(report, ttlSeconds = 600) {
    assertSafe(report, "mppRiskReportCache");
    if (!this.redis) {
      this.reportCache.set(report.transactionHash, report);
      return;
    }
    await this.redis.set(`spendhub:risk:${report.transactionHash}`, report, { ex: ttlSeconds });
  }

  async getRiskReport(transactionHash) {
    if (!this.redis) return this.reportCache.get(transactionHash) || null;
    return this.redis.get(`spendhub:risk:${transactionHash}`);
  }

  async saveReceipt(receipt) {
    const safeReceipt = sanitizeReceipt(receipt);
    assertSafe(safeReceipt, "mppPublicReceipt");
    if (!this.redis) {
      this.memoryReceipts = [safeReceipt, ...this.memoryReceipts.filter((item) => item.id !== safeReceipt.id)].slice(0, 100);
      return safeReceipt;
    }
    const key = `spendhub:mpp:public:${safeReceipt.id}`;
    await this.redis.set(key, safeReceipt, { ex: RECEIPT_TTL_SECONDS });
    await this.redis.lpush("spendhub:mpp:receipts", safeReceipt.id);
    await this.redis.ltrim("spendhub:mpp:receipts", 0, 99);
    await this.redis.expire("spendhub:mpp:receipts", RECEIPT_TTL_SECONDS);
    return safeReceipt;
  }

  async listReceipts(limit = 20) {
    const safeLimit = Math.min(20, Math.max(1, Number(limit) || 20));
    if (!this.redis) return this.memoryReceipts.slice(0, safeLimit);
    const ids = await this.redis.lrange("spendhub:mpp:receipts", 0, safeLimit - 1);
    if (!ids.length) return [];
    const receipts = await Promise.all(ids.map((id) => this.redis.get(`spendhub:mpp:public:${id}`)));
    return receipts.filter(Boolean);
  }
}

export function sanitizeReceipt(receipt) {
  return {
    id: String(receipt.id || receipt.transactionHash || "").slice(0, 128),
    protocol: "mpp/stellar-charge@0.7",
    transactionHash: /^[a-f0-9]{64}$/i.test(receipt.transactionHash || "") ? receipt.transactionHash.toLowerCase() : null,
    network: "stellar:testnet",
    asset: "USDC",
    assetContractId: receipt.assetContractId,
    amount: String(receipt.amount),
    recipient: receipt.recipient,
    resourceHash: receipt.resourceHash,
    analyzedTransactionHash: receipt.analyzedTransactionHash,
    settledAt: receipt.settledAt,
    status: "settled",
  };
}

function createRedis(env) {
  const upstash = readUpstashConfig(env);
  if (!upstash.configured) return null;
  return new Redis({
    url: upstash.url,
    token: upstash.token,
  });
}

function assertSafe(value, label) {
  const scan = assertNoSensitiveData(value, label);
  if (!scan.allowed) throw Object.assign(new Error(scan.reasons.join("; ")), { status: 500 });
}


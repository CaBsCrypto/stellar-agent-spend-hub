import { Mppx, Store, stellar } from "@stellar/mpp/charge/server";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { Receipt } from "mppx";
import { StrKey } from "@stellar/stellar-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { buildStellarRiskReport, validateTransactionHash } from "./stellarRiskService.mjs";
import { createMppAtomicStore, mppStoreReadiness } from "./mppStore.mjs";
import { MppReceiptRepository } from "./mppReceiptRepository.mjs";
import { readUpstashConfig } from "./upstashConfig.mjs";

export const MPP_PRICE_USDC = "0.01";
export const MPP_NETWORK = "stellar:testnet";
export const MPP_PROTOCOL = "mpp/stellar-charge@0.7";

export class MppChargeService {
  constructor({
    env = process.env,
    store = null,
    repository = null,
    fetchImpl = globalThis.fetch,
    runtime = null,
    rateLimiter = undefined,
    now = () => new Date(),
  } = {}) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.repository = repository || new MppReceiptRepository({ env });
    this.store = store || createMppAtomicStore({ env });
    this.config = validateMppConfig(env);
    this.runtime = runtime || createOfficialRuntime({ config: this.config, store: this.store });
    this.rateLimiter = rateLimiter === undefined ? createRateLimiter(env) : rateLimiter;
  }

  async handleRiskRequest(request, transactionHash) {
    if (request.method !== "GET") throw httpError(405, "Method not allowed");
    await this.enforceRateLimit(request);
    const hash = validateTransactionHash(transactionHash);
    let report = await this.repository.getRiskReport(hash);
    if (!report) {
      report = await buildStellarRiskReport(hash, {
        fetchImpl: this.fetchImpl,
        horizonUrl: this.config.horizonUrl,
        now: this.now,
      });
      await this.repository.cacheRiskReport(report, 600);
    }

    const result = await this.runtime.charge({
      amount: MPP_PRICE_USDC,
      description: "Stellar transaction heuristic risk report",
      expires: new Date(this.now().getTime() + 10 * 60 * 1000),
      scope: `stellar-risk:${hash}`,
      meta: { resourceHash: report.resourceHash },
    })(request);
    if (result.status === 402) return result.challenge;

    const paidResponse = result.withReceipt(Response.json({
      report,
      payment: {
        protocol: MPP_PROTOCOL,
        status: "settled",
        receiptHeader: "Payment-Receipt",
      },
    }));
    let auditStatus = "recorded";
    try {
      const protocolReceipt = Receipt.fromResponse(paidResponse);
      await this.repository.saveReceipt({
        id: protocolReceipt.reference,
        transactionHash: protocolReceipt.reference,
        assetContractId: USDC_SAC_TESTNET,
        amount: MPP_PRICE_USDC,
        recipient: this.config.recipient,
        resourceHash: report.resourceHash,
        analyzedTransactionHash: hash,
        settledAt: protocolReceipt.timestamp,
      });
    } catch {
      auditStatus = "degraded";
    }
    const headers = new Headers(paidResponse.headers);
    headers.set("X-Spend-Hub-Audit", auditStatus);
    return new Response(paidResponse.body, {
      status: paidResponse.status,
      statusText: paidResponse.statusText,
      headers,
    });
  }

  async listReceipts(limit = 20) {
    return this.repository.listReceipts(limit);
  }

  async enforceRateLimit(request) {
    if (!this.rateLimiter) return;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "local";
    const result = await this.rateLimiter.limit(`stellar-risk:${ip}`);
    if (!result.success) {
      const error = httpError(429, "Rate limit exceeded");
      error.headers = { "Retry-After": String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))) };
      throw error;
    }
  }
}

export function mppChargeReadiness(env = process.env) {
  const store = mppStoreReadiness(env);
  const recipientValid = StrKey.isValidEd25519PublicKey(env.MPP_STELLAR_RECIPIENT || "");
  const enabled = String(env.MPP_ENABLED || "").toLowerCase() === "true";
  const secretConfigured = String(env.MPP_SECRET_KEY || "").length >= 32;
  const testnetOnly = (env.MPP_NETWORK || MPP_NETWORK) === MPP_NETWORK;
  const priceValid = (env.MPP_PRICE_USDC || MPP_PRICE_USDC) === MPP_PRICE_USDC;
  const ready = enabled && recipientValid && secretConfigured && testnetOnly && priceValid && store.productionReady;
  return {
    status: ready ? "ready-testnet-usdc" : enabled ? "blocked" : "disabled",
    enabled,
    ready,
    network: MPP_NETWORK,
    price: MPP_PRICE_USDC,
    assetContractId: USDC_SAC_TESTNET,
    recipient: recipientValid ? env.MPP_STELLAR_RECIPIENT : null,
    store,
    missing: [
      !recipientValid && "MPP_STELLAR_RECIPIENT",
      !secretConfigured && "MPP_SECRET_KEY",
      !store.productionReady && "UPSTASH_OR_KV_REST_API_CREDENTIALS",
    ].filter(Boolean),
  };
}

export function validateMppConfig(env = process.env) {
  if (String(env.MPP_ENABLED || "").toLowerCase() !== "true") {
    throw httpError(503, "MPP Charge is disabled");
  }
  const network = env.MPP_NETWORK || MPP_NETWORK;
  if (network !== MPP_NETWORK) throw httpError(409, "Only Stellar testnet MPP is allowed");
  const price = env.MPP_PRICE_USDC || MPP_PRICE_USDC;
  if (price !== MPP_PRICE_USDC) throw httpError(409, "MPP price must remain exactly 0.01 USDC");
  const recipient = env.MPP_STELLAR_RECIPIENT || "";
  if (!StrKey.isValidEd25519PublicKey(recipient)) {
    throw httpError(503, "MPP_STELLAR_RECIPIENT must be a valid Stellar G address");
  }
  if (String(env.MPP_SECRET_KEY || "").length < 32) {
    throw httpError(503, "MPP_SECRET_KEY must contain at least 32 characters");
  }
  return {
    recipient,
    secretKey: env.MPP_SECRET_KEY,
    network,
    price,
    assetContractId: USDC_SAC_TESTNET,
    horizonUrl: env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
    rpcUrl: env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  };
}

function createOfficialRuntime({ config, store }) {
  return Mppx.create({
    secretKey: config.secretKey,
    methods: [
      stellar.charge({
        recipient: config.recipient,
        currency: USDC_SAC_TESTNET,
        network: MPP_NETWORK,
        rpcUrl: config.rpcUrl,
        store: store || Store.memory(),
        allowUnsignedPush: false,
      }),
    ],
  });
}

function createRateLimiter(env) {
  const upstash = readUpstashConfig(env);
  if (!upstash.configured) return null;
  const redis = new Redis({
    url: upstash.url,
    token: upstash.token,
  });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "spendhub:mpp:rate",
    analytics: false,
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}


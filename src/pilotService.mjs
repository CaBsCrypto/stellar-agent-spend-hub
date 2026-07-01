import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Address, xdr } from "@stellar/stellar-sdk";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";
import { PILOT_TENANT_ID } from "./pilotAuth.mjs";
import {
  MERCHANT_LAB_PROVIDER_ID,
  PILOT_AMOUNT_USDC,
  PILOT_NETWORK,
  createPilotProviderRegistry,
  publicPilotProvider,
} from "./pilotProvider.mjs";
import { PilotRepository } from "./pilotRepository.mjs";

const APPROVAL_TTL_MS = 10 * 60 * 1000;
const CLAIM_TTL_MS = 2 * 60 * 1000;
const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

export class PilotService {
  constructor({
    env = process.env,
    repository = null,
    providers = null,
    now = () => new Date(),
    settlementVerifier = null,
  } = {}) {
    this.env = env;
    this.repository = repository || new PilotRepository({ env });
    this.providers = providers || createPilotProviderRegistry(env);
    this.now = now;
    this.settlementVerifier = settlementVerifier || ((input) => verifyPilotSettlement(input, { env }));
  }

  discoverProviders() {
    return [...this.providers.values()].map(publicPilotProvider);
  }

  async createDraft({ tenantId = PILOT_TENANT_ID, providerId, resourceId, amount, idempotencyKey }) {
    const provider = this.requireProvider(providerId);
    const normalized = {
      providerId: provider.providerId,
      resourceId: validateResourceId(resourceId),
      amount: validateAmount(amount),
      idempotencyKey: validateIdempotencyKey(idempotencyKey),
    };
    const payloadHash = digest(JSON.stringify(normalized));
    const idempotencyDigest = digest(`${tenantId}:${normalized.idempotencyKey}`);
    const now = this.now().toISOString();
    const record = {
      version: 1,
      requestId: randomUUID(),
      tenantId,
      providerId: provider.providerId,
      providerName: provider.name,
      resourceId: normalized.resourceId,
      resourceUrl: `${provider.endpoint}?resource=${encodeURIComponent(normalized.resourceId)}`,
      amount: PILOT_AMOUNT_USDC,
      amountBaseUnits: "100000",
      asset: provider.asset,
      assetContractId: provider.assetContractId,
      network: provider.network,
      recipient: provider.recipient,
      idempotencyDigest,
      payloadHash,
      status: "created",
      approvalTokenHash: null,
      approvalExpiresAt: null,
      approvedAt: null,
      claimIdHash: null,
      claimExpiresAt: null,
      transactionHash: null,
      receipt: null,
      createdAt: now,
      updatedAt: now,
      settledAt: null,
    };
    const saved = await this.repository.create(record);
    if (saved.payloadHash !== payloadHash) throw httpError(409, "Idempotency key conflicts with another request");
    return publicRequest(saved);
  }

  async prepare(requestId, tenantId = PILOT_TENANT_ID) {
    const existing = await this.requireRequest(requestId, tenantId);
    if (!["created", "prepared"].includes(existing.status)) {
      throw httpError(409, `Pilot request cannot be prepared from ${existing.status}`);
    }
    const expiresAt = existing.approvalExpiresAt && Date.parse(existing.approvalExpiresAt) > this.now().getTime()
      ? existing.approvalExpiresAt
      : new Date(this.now().getTime() + APPROVAL_TTL_MS).toISOString();
    const token = approvalToken(this.secret(), requestId, expiresAt);
    const updated = await this.repository.update(requestId, tenantId, (record) => {
      if (!["created", "prepared"].includes(record.status)) {
        throw httpError(409, `Pilot request cannot be prepared from ${record.status}`);
      }
      record.status = "prepared";
      record.approvalExpiresAt = expiresAt;
      record.approvalTokenHash = digest(token);
      return record;
    });
    const baseUrl = String(this.env.MCP_APP_BASE_URL || "https://agente-pagos-stellar.vercel.app").replace(/\/+$/, "");
    return {
      request: publicRequest(updated),
      approvalUrl: `${baseUrl}/spend?pilot=${encodeURIComponent(requestId)}#approval=${encodeURIComponent(token)}`,
      expiresAt,
      requiresHumanConfirmation: true,
    };
  }

  async getPublicRequest(requestId) {
    const record = await this.requireRequest(requestId, PILOT_TENANT_ID);
    return publicRequest(record);
  }

  async approve(requestId, token) {
    const existing = await this.requireRequest(requestId, PILOT_TENANT_ID);
    if (existing.status !== "prepared") throw httpError(409, "Pilot request is not awaiting approval");
    if (Date.parse(existing.approvalExpiresAt || "") <= this.now().getTime()) {
      await this.repository.update(requestId, existing.tenantId, (record) => ({ ...record, status: "expired" }));
      throw httpError(410, "Pilot approval expired");
    }
    if (!safeDigestEqual(existing.approvalTokenHash, digest(String(token || "")))) {
      throw httpError(403, "Pilot approval token is invalid");
    }
    const updated = await this.repository.update(requestId, existing.tenantId, (record) => {
      if (record.status !== "prepared") throw httpError(409, "Pilot approval was already consumed");
      record.status = "approved";
      record.approvedAt = this.now().toISOString();
      record.approvalTokenHash = null;
      return record;
    });
    return publicRequest(updated);
  }

  async claim(requestId, tenantId = PILOT_TENANT_ID) {
    const claimId = randomUUID();
    const claimExpiresAt = new Date(this.now().getTime() + CLAIM_TTL_MS).toISOString();
    const updated = await this.repository.update(requestId, tenantId, (record) => {
      const leaseExpired = record.status === "settling"
        && Date.parse(record.claimExpiresAt || "") <= this.now().getTime();
      if (record.status !== "approved" && !leaseExpired) {
        throw httpError(409, `Pilot request cannot be claimed from ${record.status}`);
      }
      record.status = "settling";
      record.claimIdHash = digest(claimId);
      record.claimExpiresAt = claimExpiresAt;
      return record;
    });
    return {
      claimId,
      claimExpiresAt,
      request: buyerRequest(updated),
    };
  }

  async complete(requestId, input, tenantId = PILOT_TENANT_ID) {
    const existing = await this.requireRequest(requestId, tenantId);
    if (existing.status !== "settling") throw httpError(409, "Pilot request is not settling");
    if (Date.parse(existing.claimExpiresAt || "") <= this.now().getTime()) throw httpError(410, "Pilot claim expired");
    if (!safeDigestEqual(existing.claimIdHash, digest(String(input.claimId || "")))) {
      throw httpError(403, "Pilot claim is invalid");
    }
    const verified = await this.settlementVerifier({ request: existing, completion: input });
    const updated = await this.repository.update(requestId, tenantId, (record) => {
      if (record.status !== "settling") throw httpError(409, "Pilot settlement was already completed");
      if (!safeDigestEqual(record.claimIdHash, digest(String(input.claimId || "")))) {
        throw httpError(403, "Pilot claim is invalid");
      }
      record.status = "settled";
      record.transactionHash = verified.transactionHash;
      record.receipt = verified.receipt;
      record.settledAt = verified.settledAt;
      record.claimIdHash = null;
      return record;
    });
    return publicRequest(updated);
  }

  async getStatus(requestId, tenantId = PILOT_TENANT_ID) {
    return publicRequest(await this.requireRequest(requestId, tenantId));
  }

  async getReceipt(requestId, tenantId = PILOT_TENANT_ID) {
    const record = await this.requireRequest(requestId, tenantId);
    if (record.status !== "settled" || !record.receipt) throw httpError(404, "Pilot receipt not found");
    return structuredClone(record.receipt);
  }

  async evidence() {
    const records = await this.repository.list(PILOT_TENANT_ID, 20);
    return {
      version: "provider-pilot-evidence-v1",
      generatedAt: this.now().toISOString(),
      network: PILOT_NETWORK,
      executionAllowed: false,
      evidence: records.filter((record) => record.status === "settled").map(publicEvidence),
    };
  }

  requireProvider(providerId) {
    const provider = this.providers.get(String(providerId || ""));
    if (!provider || provider.providerId !== MERCHANT_LAB_PROVIDER_ID) throw httpError(403, "Provider is not allowlisted");
    return provider;
  }

  async requireRequest(requestId, tenantId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(requestId || ""))) throw httpError(400, "Invalid pilot requestId");
    const record = await this.repository.get(requestId, tenantId);
    if (!record) throw httpError(404, "Pilot request not found");
    return record;
  }

  secret() {
    const secret = String(this.env.MCP_PILOT_APPROVAL_SECRET || "");
    if (secret.length < 32) throw httpError(503, "Pilot approval secret is not configured");
    return secret;
  }
}

export async function verifyPilotSettlement({ request, completion }, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const transactionHash = String(completion.transactionHash || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(transactionHash)) throw httpError(400, "Invalid settlement transaction hash");
  const receipt = {
    protocol: "mpp/stellar-charge@0.7",
    status: String(completion.paymentStatus || ""),
    transactionHash,
    network: String(completion.network || ""),
    asset: String(completion.asset || ""),
    assetContractId: String(completion.assetContractId || ""),
    amount: String(completion.amount || ""),
    recipient: String(completion.recipient || ""),
    providerId: request.providerId,
    resourceId: request.resourceId,
    settledAt: String(completion.settledAt || new Date().toISOString()),
  };
  if (!["success", "settled"].includes(receipt.status)) throw httpError(409, "MPP receipt is not settled");
  for (const field of ["network", "asset", "assetContractId", "amount", "recipient"]) {
    const expected = field === "amount" ? request.amount : request[field];
    if (receipt[field] !== expected) throw httpError(409, `MPP receipt ${field} mismatch`);
  }
  const rpcUrl = String(env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
  if (new URL(rpcUrl).origin !== "https://soroban-testnet.stellar.org") throw httpError(409, "Only official testnet RPC is allowed");
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: { hash: transactionHash } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw httpError(503, "Stellar RPC transaction verification is unavailable");
  const payload = await response.json();
  if (payload.error || payload.result?.status !== "SUCCESS") throw httpError(409, "Settlement is not successful on Stellar testnet");
  const horizonUrl = `https://horizon-testnet.stellar.org/transactions/${transactionHash}/operations`;
  const operationsResponse = await fetchImpl(horizonUrl, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!operationsResponse.ok) throw httpError(503, "Horizon operation verification is unavailable");
  const operations = await operationsResponse.json();
  const records = operations?._embedded?.records || [];
  const verifiedTransfer = records.some((operation) => verifyTransferOperation(operation, {
    transactionHash,
    assetContractId: request.assetContractId,
    recipient: request.recipient,
    amount: request.amount,
  }));
  if (!verifiedTransfer) throw httpError(409, "Transaction does not contain the approved USDC transfer");
  const scan = assertNoSensitiveData(receipt, "pilotReceipt");
  if (!scan.allowed) throw httpError(400, scan.reasons.join("; "));
  return { transactionHash, receipt, settledAt: receipt.settledAt };
}

function verifyTransferOperation(operation, expected) {
  if (
    operation?.transaction_successful !== true
    || operation?.transaction_hash !== expected.transactionHash
    || operation?.type !== "invoke_host_function"
  ) return false;
  const contractId = decodeContractAddress(operation.parameters?.[0]);
  if (contractId !== expected.assetContractId) return false;
  return (operation.asset_balance_changes || []).some((change) => (
    change?.type === "transfer"
    && change?.asset_code === "USDC"
    && change?.to === expected.recipient
    && decimalToBaseUnits(change.amount) === decimalToBaseUnits(expected.amount)
  ));
}

function decodeContractAddress(parameter) {
  if (parameter?.type !== "Address" || typeof parameter.value !== "string") return null;
  try {
    return Address.fromScVal(xdr.ScVal.fromXDR(parameter.value, "base64")).toString();
  } catch {
    return null;
  }
}

function decimalToBaseUnits(value) {
  if (!/^\d+(\.\d{1,7})?$/.test(String(value || ""))) return null;
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}

function publicRequest(record) {
  return {
    requestId: record.requestId,
    providerId: record.providerId,
    providerName: record.providerName,
    resourceId: record.resourceId,
    amount: record.amount,
    amountBaseUnits: record.amountBaseUnits,
    asset: record.asset,
    assetContractId: record.assetContractId,
    network: record.network,
    recipient: record.recipient,
    status: record.status,
    requiresHumanConfirmation: !["approved", "settling", "settled"].includes(record.status),
    approvalExpiresAt: record.approvalExpiresAt,
    approvedAt: record.approvedAt,
    transactionHash: record.transactionHash,
    explorerUrl: record.transactionHash ? `${EXPLORER}/${record.transactionHash}` : null,
    createdAt: record.createdAt,
    settledAt: record.settledAt,
  };
}

function buyerRequest(record) {
  return {
    ...publicRequest(record),
    resourceUrl: record.resourceUrl,
  };
}

function publicEvidence(record) {
  return {
    evidenceType: "provider-pilot",
    verificationStatus: "verified",
    providerId: record.providerId,
    resourceId: record.resourceId,
    amount: record.amount,
    amountBaseUnits: record.amountBaseUnits,
    asset: record.asset,
    assetContractId: record.assetContractId,
    network: record.network,
    recipient: record.recipient,
    transactionHash: record.transactionHash,
    explorerUrl: `${EXPLORER}/${record.transactionHash}`,
    verifiedAt: record.settledAt,
  };
}

function approvalToken(secret, requestId, expiresAt) {
  return createHmac("sha256", secret).update(`${requestId}.${expiresAt}`).digest("base64url");
}

function validateResourceId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) throw httpError(400, "Invalid pilot resourceId");
  if (id !== "stellar-risk-snapshot") throw httpError(403, "Pilot resource is not allowlisted");
  return id;
}

function validateAmount(value) {
  if (String(value) !== PILOT_AMOUNT_USDC && Number(value) !== Number(PILOT_AMOUNT_USDC)) {
    throw httpError(409, "Pilot amount must be exactly 0.01 USDC");
  }
  return PILOT_AMOUNT_USDC;
}

function validateIdempotencyKey(value) {
  const key = String(value || "");
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(key)) throw httpError(400, "Invalid idempotencyKey");
  return key;
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeDigestEqual(expected, actual) {
  if (!/^[a-f0-9]{64}$/.test(String(expected || "")) || !/^[a-f0-9]{64}$/.test(String(actual || ""))) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

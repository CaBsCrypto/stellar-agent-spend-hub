import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";
import { MppReceiptRepository } from "./mppReceiptRepository.mjs";
import { ContractAccountRepository } from "./contractAccountRepository.mjs";
import { mppChargeReadiness } from "./mppChargeService.mjs";
import { contractAccountReadiness } from "./contractAccountRelayer.mjs";
import { readUpstashConfig } from "./upstashConfig.mjs";
import {
  PUBLIC_EVIDENCE_VERSION,
  VERIFIED_FOUNDATIONS,
  assertEvidenceInvariant,
  contractAccountLifecycle,
  pendingContractAccountEvidence,
  pendingMppEvidence,
  verifiedRuntimeEvidence,
} from "./publicEvidenceCatalog.mjs";

export class PublicEvidenceService {
  constructor({
    env = process.env,
    mppRepository = null,
    accountRepository = null,
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
  } = {}) {
    this.env = env;
    this.mppRepository = mppRepository || new MppReceiptRepository({ env });
    this.accountRepository = accountRepository || new ContractAccountRepository({ env });
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async manifest({ mode = "live" } = {}) {
    const safeMode = mode === "replay" ? "replay" : "live";
    const [mppReceipts, accountReceipts] = await Promise.all([
      this.mppRepository.listReceipts(20),
      this.accountRepository.listReceipts(20),
    ]);
    const mpp = mppReceipts.map(mppEvidence);
    const contractAccount = accountReceipts.map(accountEvidence);
    const accountReadiness = contractAccountReadiness(this.env);
    const payload = {
      version: PUBLIC_EVIDENCE_VERSION,
      generatedAt: this.now().toISOString(),
      mode: safeMode,
      executionAllowed: false,
      network: "stellar:testnet",
      evidence: [...mpp, ...contractAccount, ...VERIFIED_FOUNDATIONS],
      verifiedFoundations: VERIFIED_FOUNDATIONS,
      coordinatedDemo: {
        mpp: mpp[0] || pendingMppEvidence(this.env),
        contractAccount: contractAccount.find((item) => item.action === "transfer")
          || pendingContractAccountEvidence(this.env),
      },
      contractAccountLifecycle: contractAccountLifecycle({
        receipts: accountReceipts,
        submitEnabled: accountReadiness.submitEnabled,
      }),
    };
    payload.evidence.forEach(assertEvidenceInvariant);
    Object.values(payload.coordinatedDemo).forEach(assertEvidenceInvariant);
    assertPublic(payload);
    return payload;
  }

  async diagnostics() {
    const [horizon, rpc, upstash] = await Promise.all([
      probeHttp(this.fetchImpl, this.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org"),
      probeRpc(this.fetchImpl, this.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"),
      probeUpstash(this.fetchImpl, this.env),
    ]);
    return {
      checkedAt: this.now().toISOString(),
      network: "stellar:testnet",
      dependencies: { horizon, rpc, upstash },
      mpp: publicReadiness(mppChargeReadiness(this.env)),
      contractAccount: publicReadiness(contractAccountReadiness(this.env)),
    };
  }
}

function mppEvidence(receipt) {
  return verifiedRuntimeEvidence({
    id: `mpp:${receipt.transactionHash}`,
    evidenceType: "mpp-charge",
    label: "Official MPP Stellar Charge",
    protocol: receipt.protocol,
    network: receipt.network,
    asset: receipt.asset,
    assetContractId: receipt.assetContractId,
    amount: receipt.amount,
    recipient: receipt.recipient,
    transactionHash: receipt.transactionHash,
    verifiedAt: receipt.settledAt,
    settledAt: receipt.settledAt,
    policy: {
      authorization: "local-human-confirmation",
      price: `${receipt.amount} ${receipt.asset}`,
      replayProtection: "atomic-consumption",
    },
  });
}

function accountEvidence(receipt) {
  const isTransfer = receipt.action === "transfer";
  return verifiedRuntimeEvidence({
    id: `ca:${receipt.transactionHash}`,
    evidenceType: "contract-account",
    label: "Passkey-managed contract account",
    protocol: receipt.protocol,
    network: receipt.network,
    asset: "USDC",
    assetContractId: receipt.assetContractId,
    amount: isTransfer ? formatUsdcAmount(receipt.amount) : null,
    amountBaseUnits: isTransfer ? receipt.amount : null,
    recipient: receipt.destination,
    contractId: receipt.contractId,
    action: receipt.action,
    policyDecision: receipt.policyDecision,
    signerType: receipt.signerType,
    transactionHash: receipt.transactionHash,
    verifiedAt: receipt.settledAt,
    settledAt: receipt.settledAt,
    policy: {
      owner: "passkey",
      sessionSigner: receipt.signerType,
      decision: receipt.policyDecision || "allowed",
    },
  });
}

function formatUsdcAmount(baseUnits) {
  if (!/^\d+$/.test(baseUnits || "")) return null;
  const value = BigInt(baseUnits);
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function publicReadiness(value) {
  return {
    status: value.status,
    enabled: Boolean(value.enabled),
    ready: Boolean(value.ready || value.status?.startsWith("ready")),
    network: value.network,
  };
}

async function probeHttp(fetchImpl, url) {
  return probe(async (signal) => {
    const response = await fetchImpl(url, { method: "GET", signal });
    return response.ok;
  });
}

async function probeRpc(fetchImpl, url) {
  return probe(async (signal) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal,
    });
    return response.ok;
  });
}

async function probeUpstash(fetchImpl, env) {
  const upstash = readUpstashConfig(env);
  if (!upstash.configured) return "not-configured";
  return probe(async (signal) => {
    const response = await fetchImpl(`${upstash.url.replace(/\/$/, "")}/ping`, {
      headers: { Authorization: `Bearer ${upstash.token}` },
      signal,
    });
    return response.ok;
  });
}

async function probe(check) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_500);
  try {
    return await check(controller.signal) ? "reachable" : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}

function assertPublic(value) {
  const scan = assertNoSensitiveData(value, "publicEvidence");
  if (!scan.allowed) throw Object.assign(new Error(scan.reasons.join("; ")), { status: 500 });
}

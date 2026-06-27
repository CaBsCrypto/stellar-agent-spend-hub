import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";
import { MppReceiptRepository } from "./mppReceiptRepository.mjs";
import { ContractAccountRepository } from "./contractAccountRepository.mjs";
import { mppChargeReadiness } from "./mppChargeService.mjs";
import { contractAccountReadiness } from "./contractAccountRelayer.mjs";
import { readUpstashConfig } from "./upstashConfig.mjs";

const EXPLORER = "https://stellar.expert/explorer/testnet";
const KNOWN_EVIDENCE = Object.freeze([
  {
    id: "direct-stellar-testnet",
    kind: "direct-payment",
    label: "First direct Stellar testnet payment",
    status: "verified",
    network: "stellar:testnet",
    asset: "XLM",
    amount: "0.0000010",
    transactionHash: "4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb",
  },
  {
    id: "policy-sac-transfer",
    kind: "policy-transfer",
    label: "First policy-controlled SAC transfer",
    status: "verified",
    network: "stellar:testnet",
    asset: "XLM",
    amount: "tiny",
    transactionHash: "8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f",
  },
  {
    id: "guarded-runtime-settlement",
    kind: "guarded-runtime",
    label: "First guarded Soroban runtime settlement",
    status: "verified",
    network: "stellar:testnet",
    asset: "XLM",
    amount: "tiny",
    transactionHash: "cb9bf9fcef3a79d045285b9c82a2633d8e78f36e9625fd6fb46ab799aae7152e",
  },
]);

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
    const payload = {
      version: "sprint-12-evidence-v1",
      generatedAt: this.now().toISOString(),
      mode: safeMode,
      executionAllowed: false,
      network: "stellar:testnet",
      evidence: [...mpp, ...contractAccount, ...KNOWN_EVIDENCE.map(withExplorer)],
      coordinatedDemo: {
        mpp: mpp[0] || pendingMpp(this.env),
        contractAccount: contractAccount.find((item) => item.action === "transfer")
          || pendingContractAccount(this.env),
      },
    };
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
  return withExplorer({
    id: `mpp:${receipt.transactionHash}`,
    kind: "mpp-charge",
    label: "Official MPP Stellar Charge",
    status: "verified",
    protocol: receipt.protocol,
    network: receipt.network,
    asset: receipt.asset,
    assetContractId: receipt.assetContractId,
    amount: receipt.amount,
    recipient: receipt.recipient,
    transactionHash: receipt.transactionHash,
    settledAt: receipt.settledAt,
  });
}

function accountEvidence(receipt) {
  return withExplorer({
    id: `ca:${receipt.transactionHash}`,
    kind: "contract-account",
    label: "Passkey-managed contract account",
    status: "verified",
    protocol: receipt.protocol,
    network: receipt.network,
    asset: "USDC",
    assetContractId: receipt.assetContractId,
    amount: receipt.amount,
    recipient: receipt.destination,
    contractId: receipt.contractId,
    action: receipt.action,
    policyDecision: receipt.policyDecision,
    signerType: receipt.signerType,
    transactionHash: receipt.transactionHash,
    settledAt: receipt.settledAt,
  });
}

function pendingMpp(env) {
  return {
    id: "mpp:pending",
    kind: "mpp-charge",
    label: "Official MPP Stellar Charge",
    status: "pending",
    network: "stellar:testnet",
    asset: "USDC",
    amount: "0.01",
    recipient: env.MPP_STELLAR_RECIPIENT || null,
    transactionHash: null,
    explorerUrl: null,
  };
}

function pendingContractAccount(env) {
  return {
    id: "ca:pending",
    kind: "contract-account",
    label: "Passkey-managed contract account",
    status: "pending",
    network: "stellar:testnet",
    asset: "USDC",
    amount: "0.01",
    recipient: env.CONTRACT_ACCOUNT_MERCHANT || null,
    contractId: env.CONTRACT_ACCOUNT_ID || null,
    transactionHash: null,
    explorerUrl: null,
  };
}

function withExplorer(item) {
  return {
    ...item,
    explorerUrl: item.transactionHash ? `${EXPLORER}/tx/${item.transactionHash}` : null,
  };
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

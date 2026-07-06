import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { connectorReadiness } from "./connectorReadiness.mjs";
import { CryptoActionAdapter } from "./cryptoActionAdapter.mjs";
import { DeFindexAdapter } from "./defindexAdapter.mjs";
import { evaluatePaymentIntent, IntentType, RiskLevel } from "./domain.mjs";
import { LegalContextAdapter } from "./legalContextAdapter.mjs";
import { LinkAgentWalletAdapter } from "./linkAgentWalletAdapter.mjs";
import { MachinePaymentAdapter } from "./machinePaymentAdapter.mjs";
import {
  legalContextRegistry,
  paymentIntents,
  providerDirectory,
  receipts,
  roadmapAccounts,
  spendingPolicy,
} from "./mockData.mjs";
import { StellarTestnetAdapter } from "./paymentRailAdapter.mjs";
import { StellarTestnetRealAdapter } from "./stellarTestnetRealAdapter.mjs";
import { SorobanSmartWalletAdapter } from "./sorobanSmartWalletAdapter.mjs";
import { PaymentExecutionMode, resolvePaymentExecutionMode } from "./paymentRuntime.mjs";
import { PrivacyVaultAdapter } from "./privacyVaultAdapter.mjs";
import { ProviderDirectoryAdapter } from "./providerDirectoryAdapter.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";
import { ZkCommitmentAdapter } from "./zkCommitmentAdapter.mjs";

const defaultState = () => ({
  intents: paymentIntents.map((intent) => ({ ...intent, status: intent.status || "created" })),
  receipts,
  proofs: {},
  vaultRecords: {},
  spendRequests: {},
  machineChallenges: {},
  idempotencyKeys: {},
  sorobanExecutions: {},
});

export class SpendHubService {
  constructor({ statePath = null, seedState = null, env = {} } = {}) {
    this.statePath = statePath;
    this.state = normalizeState(seedState || defaultState());
    this.env = env;
    this.policy = spendingPolicy;
    this.legalAdapter = new LegalContextAdapter({ registry: legalContextRegistry });
    this.directoryAdapter = new ProviderDirectoryAdapter({ providers: providerDirectory });
    this.zkAdapter = new ZkCommitmentAdapter();
    this.vaultAdapter = new PrivacyVaultAdapter();
    this.cryptoAdapter = new CryptoActionAdapter();
    this.defindexAdapter = new DeFindexAdapter();
    this.paymentAdapter = new StellarTestnetAdapter();
    this.realPaymentAdapter = new StellarTestnetRealAdapter({ env });
    this.sorobanSmartWalletAdapter = new SorobanSmartWalletAdapter({ env });
    this.linkAdapter = new LinkAgentWalletAdapter({ env });
    this.machinePaymentAdapter = new MachinePaymentAdapter();
  }

  async load() {
    if (!this.statePath) return this;
    try {
      this.state = normalizeState(JSON.parse(await readFile(this.statePath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.save();
    }
    return this;
  }

  async save() {
    if (!this.statePath) return;
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2));
  }

  async getState() {
    const evaluations = await this.evaluateAll();
    return {
      policy: this.policy,
      providers: providerDirectory,
      roadmapAccounts,
      intents: this.state.intents,
      receipts: this.state.receipts,
      proofs: this.state.proofs,
      spendRequests: this.state.spendRequests,
      machineChallenges: this.state.machineChallenges,
      evaluations,
      summary: this.summary(evaluations),
      readiness: await this.readiness(),
    };
  }

  async getSpendView() {
    const evaluations = await this.evaluateAll();
    return {
      policy: this.policy,
      intents: this.state.intents,
      receipts: this.state.receipts,
      proofs: this.state.proofs,
      spendRequests: this.state.spendRequests,
      evaluations,
      summary: this.summary(evaluations),
      readiness: await this.readiness(),
    };
  }

  getProvidersView() {
    return { providers: providerDirectory };
  }

  getProvider(providerId) {
    return this.directoryAdapter.get(providerId);
  }

  searchProviders({ query = "", category = "" } = {}) {
    return this.directoryAdapter.search({ query, category: category || undefined });
  }

  async createIntent({ providerId, amount, intentType, asset = "USDC", idempotencyKey = null }) {
    if (idempotencyKey && this.state.idempotencyKeys[idempotencyKey]) {
      return this.findIntent(this.state.idempotencyKeys[idempotencyKey]);
    }
    const provider = this.directoryAdapter.get(providerId);
    if (!provider) throw httpError(404, "Provider not found");

    const numericAmount = Number(amount || suggestedAmount(provider.category));
    const type = intentType || provider.category;
    const isLink = isLinkProvider(provider);
    const intent = {
      id: `intent-${providerId}-${Date.now().toString(36)}`,
      idempotencyKey,
      status: "created",
      intentType: type,
      providerId: provider.providerId,
      providerName: provider.name,
      category: provider.category,
      amount: numericAmount,
      currency: isLink ? "USD" : "USDC",
      dueDate: new Date().toISOString().slice(0, 10),
      sourceOfFunds: isLink ? "link-agent-wallet" : "stellar-smart-wallet-usdc",
      riskLevel: type === IntentType.buyCrypto || type === IntentType.defiAllocate ? RiskLevel.medium : RiskLevel.low,
      destinationAddress: isLink ? `link://merchant/${provider.providerId}` : `GCL${provider.providerId.replace(/[^a-z0-9]/gi, "").toUpperCase()}SIMULATED`,
      legalContextUrl: provider.legalContextUrl,
      termsUrl: null,
      privacyRequirement: provider.privacyRequirement,
      proofRequired: provider.privacyRequirement === "zk-required",
      proofStatus: provider.privacyRequirement === "zk-required" ? "missing" : "not-required",
      autopilotRequested: false,
      paymentMethod: provider.paymentMethod,
      linkPaymentMode: isLink ? "shared_payment_token" : undefined,
      publicMetadata: { endpoint: provider.endpoint, directory: isLink ? "link-agent-wallet-pattern" : "provider-directory" },
      agentReason: reasonForProvider(provider, type),
    };

    if (type === IntentType.buyCrypto) {
      intent.cryptoAction = { asset, side: "buy", slippageBps: 45, risk: "medium" };
    }

    if (type === IntentType.defiAllocate) {
      intent.defiAllocation = { protocol: "defindex", strategy: "stable-yield-demo", risk: "medium", slippageBps: 60 };
    }

    const scan = assertNoSensitiveData(intent, "intent");
    if (!scan.allowed) throw httpError(400, scan.reasons.join("; "));

    this.state.intents = [intent, ...this.state.intents];
    if (idempotencyKey) this.state.idempotencyKeys[idempotencyKey] = intent.id;
    await this.save();
    return intent;
  }

  async generateProof({ intentId, secretRef = "secret:demo", salt = "demo-salt" }) {
    const intent = this.findIntent(intentId);
    if (!intent.proofRequired) throw httpError(400, "Intent does not require proof");

    const vaultRecord = await this.vaultAdapter.storeSecret({
      secretRef,
      plaintext: `private-ref:${intent.providerId}:${intent.id}`,
      purpose: intent.intentType,
      providerId: intent.providerId,
    });
    const proof = await this.zkAdapter.createProof({ providerId: intent.providerId, secretRef, salt, purpose: intent.intentType });
    intent.secretRefCommitment = proof.commitment;
    intent.proofStatus = "valid";
    intent.status = "proof_verified";
    this.state.proofs[intentId] = proof;
    this.state.vaultRecords[secretRef] = vaultRecord;
    await this.save();
    return { intent, proof, vaultRecord };
  }

  async prepareIntent(intentId) {
    const intent = this.findIntent(intentId);
    const evaluation = await this.evaluateIntent(intent);
    if (isLinkIntent(intent)) {
      const spendRequest = await this.createLinkSpendRequest(intentId, evaluation);
      intent.status = evaluation.allowed ? "approval_required" : "blocked";
      intent.lastPreparedAt = new Date().toISOString();
      intent.lastPreparedMemo = spendRequest.id;
      await this.save();
      return spendRequest;
    }

    const prepared = await this.activePaymentAdapter(intent).preparePayment(intent, evaluation);
    intent.status = evaluation.allowed ? "requires_confirmation" : "blocked";
    intent.lastPreparedAt = new Date().toISOString();
    intent.lastPreparedMemo = prepared.memo;
    await this.save();
    return prepared;
  }

  async approveIntent(intentId, approvedBy = "user-passkey") {
    const intent = this.findIntent(intentId);
    const existingReceipt = this.state.receipts.find(
      (receipt) => receipt.intentId === intentId && receipt.status !== "blocked",
    );
    if (existingReceipt) return { ...existingReceipt, idempotentReplay: true };
    const evaluation = await this.evaluateIntent(intent);
    if (!evaluation.allowed) throw httpError(409, evaluation.reasons.join("; "));

    if (isLinkIntent(intent)) {
      const receipt = await this.approveLinkSpendRequest(intentId, approvedBy, evaluation);
      return receipt;
    }

    const receipt = await this.activePaymentAdapter(intent).settlePayment(intent, evaluation, approvedBy);
    const scan = assertNoSensitiveData(receipt, "receipt");
    if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
    intent.status = receipt.status === "settled" ? "settled" : "approved_preview";
    intent.settledReceiptId = receipt.id;
    this.state.receipts = [receipt, ...this.state.receipts];
    await this.save();
    return receipt;
  }

  async dismissIntent(intentId, dismissedBy = "user") {
    const intent = this.findIntent(intentId);
    if (["settled", "approved_preview"].includes(intent.status)) {
      throw httpError(409, "A settled intent cannot be dismissed");
    }
    intent.status = "dismissed";
    intent.dismissedBy = dismissedBy;
    intent.dismissedAt = new Date().toISOString();
    await this.save();
    return intent;
  }

  async createLinkSpendRequest(intentId, evaluation = null) {
    const intent = this.findIntent(intentId);
    const decision = evaluation || (await this.evaluateIntent(intent));
    const provider = this.directoryAdapter.get(intent.providerId);
    const spendRequest = await this.linkAdapter.createSpendRequest(intent, {
      merchantUrl: provider?.endpoint || null,
      requestApproval: true,
    });
    this.state.spendRequests[intentId] = {
      ...spendRequest,
      policyAllowedAtCreation: decision.allowed,
      policyReasons: decision.allowed ? [] : decision.reasons,
    };
    return this.state.spendRequests[intentId];
  }

  async approveLinkSpendRequest(intentId, approvedBy = "link-biometric-simulated", evaluation = null) {
    const intent = this.findIntent(intentId);
    const decision = evaluation || (await this.evaluateIntent(intent));
    if (!decision.allowed) throw httpError(409, decision.reasons.join("; "));
    const existing = this.state.spendRequests[intentId] || (await this.createLinkSpendRequest(intentId, decision));
    const approvedSpendRequest = await this.linkAdapter.approveSpendRequest(existing, approvedBy);
    this.state.spendRequests[intentId] = approvedSpendRequest;
    const receipt = await this.linkAdapter.settlePayment(intent, decision, approvedSpendRequest, approvedBy);
    const scan = assertNoSensitiveData(receipt, "receipt");
    if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
    intent.status = receipt.status === "settled" ? "settled" : "approved_preview";
    intent.settledReceiptId = receipt.id;
    this.state.receipts = [receipt, ...this.state.receipts];
    await this.save();
    return receipt;
  }

  async denyLinkSpendRequest(intentId, deniedBy = "user") {
    const existing = this.state.spendRequests[intentId];
    if (!existing) throw httpError(404, "Link spend request not found");
    const denied = await this.linkAdapter.denySpendRequest(existing, deniedBy);
    this.state.spendRequests[intentId] = denied;
    this.findIntent(intentId).status = "denied";
    await this.save();
    return denied;
  }


  async requestMachineResource({ providerId, resourceId = "agent-resource", credential = null, amount = null }) {
    const provider = this.directoryAdapter.get(providerId);
    if (!provider) throw httpError(404, "Provider not found");

    if (credential) {
      const verification = this.machinePaymentAdapter.verifyCredential({
        credential,
        receipts: this.state.receipts,
        providerId,
      });
      if (verification.allowed) {
        return this.machinePaymentAdapter.deliverResource({ provider, resourceId, verification });
      }
    }

    const intent = await this.createIntent({
      providerId,
      amount,
      intentType: provider.category,
      idempotencyKey: `machine:${providerId}:${resourceId}`,
    });
    const challenge = this.machinePaymentAdapter.createChallenge({ provider, intent, resourceId });
    this.state.machineChallenges[challenge.challengeId] = challenge;
    await this.save();
    return {
      status: 402,
      error: credential ? "Payment credential rejected" : "Payment required",
      challenge,
    };
  }
  async evaluateAll() {
    const entries = await Promise.all(this.state.intents.map(async (intent) => [intent.id, await this.evaluateIntent(intent)]));
    return Object.fromEntries(entries);
  }

  async evaluateIntent(intent) {
    const legalDecision = await this.safeLegalDecision(intent);
    const privacyDecision = this.zkAdapter.evaluate(intent, this.state.proofs[intent.id] || null);
    const cryptoDecision = this.cryptoAdapter.evaluate(intent, this.policy);
    const defiDecision = this.defindexAdapter.evaluate(intent, this.policy);
    const directoryResult = this.directoryAdapter.get(intent.providerId);
    return evaluatePaymentIntent(intent, this.policy, this.state.receipts, {
      legalDecision,
      privacyDecision,
      cryptoDecision,
      defiDecision,
      directoryResult,
    });
  }

  async safeLegalDecision(intent) {
    try {
      return await this.legalAdapter.evaluate(intent, this.policy);
    } catch (error) {
      return {
        allowed: false,
        requiresSignature: false,
        reasons: [`Legal context error: ${error.message}`],
        evidence: [],
        snapshot: null,
        termsHash: null,
        trustLevel: 0,
      };
    }
  }

  findIntent(intentId) {
    const intent = this.state.intents.find((item) => item.id === intentId);
    if (!intent) throw httpError(404, "Intent not found");
    return intent;
  }

  activePaymentAdapter(intent = null) {
    const mode = resolvePaymentExecutionMode(this.env);
    if (
      (mode === PaymentExecutionMode.sorobanDryRun || mode === PaymentExecutionMode.sorobanTestnetSubmit) &&
      !isLinkIntent(intent || {})
    ) {
      return this.sorobanSmartWalletAdapter;
    }
    if (mode === PaymentExecutionMode.stellarTestnetDirect && !isLinkIntent(intent || {})) {
      return this.realPaymentAdapter;
    }
    return this.paymentAdapter;
  }
  async readiness(env = this.env) {
    return connectorReadiness({ env, stellarAdapter: this.realPaymentAdapter, sorobanSmartWalletAdapter: this.sorobanSmartWalletAdapter });
  }

  async linkDiagnostics() {
    return this.linkAdapter.readiness(this.env);
  }

  async railDiagnostics() {
    const readiness = await this.readiness();
    return {
      activeRail: this.activePaymentAdapter().name,
      activeRailMode: resolvePaymentExecutionMode(this.env),
      simulated: this.paymentAdapter.constructor.name,
      testnet: await this.realPaymentAdapter.readiness(),
      linkAgentWallet: await this.linkAdapter.readiness(this.env),
      sorobanSmartWallet: this.sorobanSmartWalletAdapter.readiness(),
      paymentRuntime: readiness.connectors.paymentRuntime,
      mpp: readiness.connectors.mpp,
    };
  }

  getSorobanExecution(idempotencyKey) {
    return this.state.sorobanExecutions[idempotencyKey] || null;
  }

  async recordSorobanExecution(idempotencyKey, report) {
    this.state.sorobanExecutions[idempotencyKey] = report;
    await this.save();
    return report;
  }

  summary(evaluations) {
    const values = Object.values(evaluations);
    return {
      ready: values.filter((evaluation) => evaluation.allowed).length,
      blocked: values.filter((evaluation) => !evaluation.allowed).length,
      receipts: this.state.receipts.length,
      providers: providerDirectory.length,
    };
  }
}

function normalizeState(state) {
  const normalized = {
    intents: state.intents || [],
    receipts: state.receipts || [],
    proofs: state.proofs || {},
    vaultRecords: state.vaultRecords || {},
    spendRequests: state.spendRequests || {},
    machineChallenges: state.machineChallenges || {},
    idempotencyKeys: state.idempotencyKeys || {},
    sorobanExecutions: state.sorobanExecutions || {},
  };
  normalized.intents = normalized.intents.map((intent) => ({ ...intent, status: intent.status || "created" }));
  return normalized;
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isLinkProvider(provider) {
  return provider.paymentMethod === "link-agent-wallet-simulated";
}

function isLinkIntent(intent) {
  return intent.paymentMethod === "link-agent-wallet-simulated" || intent.sourceOfFunds === "link-agent-wallet";
}

function suggestedAmount(category) {
  if (category === IntentType.buyCrypto) return 25;
  if (category === IntentType.defiAllocate) return 35;
  if (category === IntentType.billPay) return 40;
  return 12;
}

function reasonForProvider(provider, type) {
  if (isLinkProvider(provider)) return `Iniciar compra con ${provider.name}; el usuario aprueba antes de emitir una credencial tokenizada.`;
  if (type === IntentType.buyCrypto) return `Buy crypto allowed by policy using ${provider.name}.`;
  if (type === IntentType.defiAllocate) return `Prepare a DeFi allocation on ${provider.name}; blocked unless risk is low.`;
  if (type === IntentType.billPay) return `Prepare privacy-first bill pay with a required proof for ${provider.name}.`;
  return `Buy the ${provider.name} service discovered via directory and confirm before paying.`;
}

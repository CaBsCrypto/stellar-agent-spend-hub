import { createReceipt } from "./domain.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export const DEFAULT_SMART_WALLET_POLICY = Object.freeze({
  ownerPublicKey: "GOWNERSMARTWALLETDEMO00000000000000000000000000000001",
  sessionPublicKey: "GSESSIONAGENTDEMO000000000000000000000000000000001",
  allowedProviders: ["browserbase-mcp", "exa-api"],
  allowedDestinations: ["GCLMCPPAYMENTSIMULATED001", "GCLAPIPAYMENTSIMULATED001"],
  allowedAssets: [],
  perPaymentLimit: 25,
  expiresAt: "2026-12-31T23:59:59.000Z",
  revoked: false,
});

export class SorobanSmartWalletAdapter {
  constructor({ env = {}, sessionPolicy = DEFAULT_SMART_WALLET_POLICY, now = () => new Date() } = {}) {
    this.name = "Soroban Smart Wallet";
    this.network = "stellar:testnet";
    this.asset = "XLM";
    this.env = env;
    this.sessionPolicy = {
      ...sessionPolicy,
      ownerPublicKey: env.SOROBAN_OWNER_PUBLIC_KEY || sessionPolicy.ownerPublicKey,
      sessionPublicKey: env.SOROBAN_SESSION_PUBLIC_KEY || sessionPolicy.sessionPublicKey,
      allowedAssets: env.SOROBAN_NATIVE_ASSET_CONTRACT_ID
        ? [...new Set([...(sessionPolicy.allowedAssets || []), env.SOROBAN_NATIVE_ASSET_CONTRACT_ID])]
        : sessionPolicy.allowedAssets || [],
    };
    this.now = now;
  }

  readiness() {
    const contractId = this.contractId();
    const assetContractId = this.assetContractId();
    return {
      status: assetContractId ? "asset-contract-configured" : contractId ? "contract-configured" : "scaffold-ready",
      contractId: contractId || null,
      assetContractId,
      ownerPublicKey: this.sessionPolicy.ownerPublicKey,
      sessionPublicKey: this.sessionPolicy.sessionPublicKey,
      allowedProviders: this.sessionPolicy.allowedProviders,
      allowedDestinations: this.sessionPolicy.allowedDestinations,
      allowedAssets: this.sessionPolicy.allowedAssets || [],
      perPaymentLimit: this.sessionPolicy.perPaymentLimit,
      expiresAt: this.sessionPolicy.expiresAt,
      revoked: Boolean(this.sessionPolicy.revoked),
      detail: assetContractId
        ? "Soroban smart wallet and native SAC asset contract configured; keep v1 confirmation required."
        : contractId
          ? "Soroban smart wallet contract id configured; keep v1 confirmation required."
          : "Soroban smart wallet contract MVP scaffold is ready; deploy testnet only after local contract QA.",
    };
  }

  evaluateSession(intent, evaluation, sessionPolicy = this.sessionPolicy) {
    const reasons = [];
    const evidence = [];
    const policy = { ...sessionPolicy };

    const scan = assertNoSensitiveData({ intent: publicIntent(intent), sessionPolicy: publicSessionPolicy(policy) }, "sorobanSmartWalletPolicy");
    if (!scan.allowed) reasons.push(...scan.reasons);

    if (!evaluation.allowed) reasons.push("Payment policy must allow intent before Soroban session can execute");
    else evidence.push("Off-chain payment policy allowed intent");

    if (!policy.ownerPublicKey) reasons.push("Smart wallet owner is missing");
    else evidence.push("Smart wallet owner configured");

    if (!policy.sessionPublicKey) reasons.push("Agent session signer is missing");
    else evidence.push("Agent session signer configured");

    if (policy.revoked) reasons.push("Agent session signer is revoked");
    else evidence.push("Agent session signer is not revoked");

    const expiresAt = new Date(policy.expiresAt || 0);
    if (!policy.expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= this.now()) {
      reasons.push("Agent session signer is expired");
    } else {
      evidence.push("Agent session signer is not expired");
    }

    const providerAllowed = Array.isArray(policy.allowedProviders) && policy.allowedProviders.includes(intent.providerId);
    const destinationAllowed = Array.isArray(policy.allowedDestinations) && policy.allowedDestinations.includes(intent.destinationAddress);
    if (!providerAllowed && !destinationAllowed) reasons.push("Destination/provider outside Soroban allowlist");
    else evidence.push("Destination/provider inside Soroban allowlist");

    if (Number(intent.amount) > Number(policy.perPaymentLimit || 0)) reasons.push("Amount exceeds Soroban per-payment limit");
    else evidence.push("Amount inside Soroban per-payment limit");

    const assetContractId = this.assetContractId();
    if (assetContractId) {
      if (!Array.isArray(policy.allowedAssets) || !policy.allowedAssets.includes(assetContractId)) {
        reasons.push("Asset contract outside Soroban allowlist");
      } else {
        evidence.push("Asset contract inside Soroban allowlist");
      }
    }

    return {
      allowed: reasons.length === 0,
      requiresConfirmation: true,
      reasons,
      evidence,
      contractId: this.contractId(),
      assetContractId,
      ownerPublicKey: policy.ownerPublicKey,
      sessionPublicKey: policy.sessionPublicKey,
      expiresAt: policy.expiresAt,
      perPaymentLimit: policy.perPaymentLimit,
      allowlist: {
        providers: policy.allowedProviders || [],
        destinations: policy.allowedDestinations || [],
        assets: policy.allowedAssets || [],
      },
    };
  }

  async preparePayment(intent, evaluation, { sessionPolicy = this.sessionPolicy } = {}) {
    const sessionDecision = this.evaluateSession(intent, evaluation, sessionPolicy);
    return {
      rail: this.name,
      network: this.network,
      asset: this.assetContractId() ? this.asset : intent.currency || this.asset,
      canSubmit: false,
      submitMode: this.assetContractId() ? "sac-transfer-ready-dry-run" : "contract-scaffold-only",
      memo: safeMemo(intent),
      destination: intent.destinationAddress,
      amount: String(intent.amount),
      authModel: "owner + agent session signer + allowlist + asset allowlist + limit + expiry + revoke",
      contractId: sessionDecision.contractId,
      assetContractId: sessionDecision.assetContractId,
      ownerPublicKey: sessionDecision.ownerPublicKey,
      sessionPublicKey: sessionDecision.sessionPublicKey,
      sessionDecision,
      simulatedSorobanInvocation: {
        contract: sessionDecision.contractId || "soroban-smart-wallet-pending",
        method: this.assetContractId() ? "execute_allowed_transfer" : "execute_allowed_payment",
        amount: intent.amount,
        destination: intent.destinationAddress,
        providerId: intent.providerId,
        assetContract: this.assetContractId(),
      },
    };
  }

  async settlePayment(intent, evaluation, approvedBy = "user-passkey", options = {}) {
    const prepared = await this.preparePayment(intent, evaluation, options);
    const allowed = evaluation.allowed && prepared.sessionDecision.allowed;
    const mergedEvaluation = {
      ...evaluation,
      allowed,
      reasons: allowed ? evaluation.reasons : [...evaluation.reasons, ...prepared.sessionDecision.reasons],
      evidence: allowed ? [...evaluation.evidence, ...prepared.sessionDecision.evidence] : evaluation.evidence,
      requiresConfirmation: true,
    };
    const receipt = createReceipt({
      intent,
      evaluation: mergedEvaluation,
      approvedBy,
      railResult: {
        transactionHash: allowed ? `soroban_policy_${intent.id}_${Date.now().toString(36)}` : null,
        rail: this.name,
        network: this.network,
        asset: this.assetContractId() ? this.asset : intent.currency || this.asset,
        finality: allowed ? "soroban-policy-simulated" : "blocked-before-soroban-submit",
      },
    });
    const enriched = {
      ...receipt,
      contractId: prepared.contractId,
      assetContractId: prepared.assetContractId,
      sessionSigner: prepared.sessionPublicKey,
      sessionExpiresAt: prepared.sessionDecision.expiresAt,
      smartWalletDecision: prepared.sessionDecision,
    };
    const scan = assertNoSensitiveData(enriched, "sorobanSmartWalletReceipt");
    if (!scan.allowed) throw new Error(scan.reasons.join("; "));
    return enriched;
  }

  contractId() {
    return this.env.SOROBAN_SMART_WALLET_CONTRACT_ID || null;
  }

  assetContractId() {
    return this.env.SOROBAN_NATIVE_ASSET_CONTRACT_ID || null;
  }
}

export function publicSessionPolicy(policy) {
  return {
    ownerPublicKey: policy.ownerPublicKey,
    sessionPublicKey: policy.sessionPublicKey,
    allowedProviders: policy.allowedProviders || [],
    allowedDestinations: policy.allowedDestinations || [],
    allowedAssets: policy.allowedAssets || [],
    perPaymentLimit: policy.perPaymentLimit,
    expiresAt: policy.expiresAt,
    revoked: Boolean(policy.revoked),
  };
}

function publicIntent(intent) {
  return {
    id: intent.id,
    providerId: intent.providerId,
    destinationAddress: intent.destinationAddress,
    amount: intent.amount,
    currency: intent.currency,
  };
}

function safeMemo(intent) {
  const id = String(intent.id || "intent").replace(/[^a-zA-Z0-9]/g, "");
  return `soroban:${id.slice(-18)}`.slice(0, 28);
}
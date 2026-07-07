import { IntentType, RiskLevel } from "./domain.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export function buildSpendIntent({ provider, amount, intentType, asset = "USDC", idempotencyKey = null, now = new Date() }) {
  const numericAmount = Number(amount || suggestedAmount(provider.category));
  const type = intentType || provider.category;
  const isLink = isLinkProvider(provider);
  const intent = {
    id: `intent-${provider.providerId}-${now.getTime().toString(36)}`,
    idempotencyKey,
    status: "created",
    intentType: type,
    providerId: provider.providerId,
    providerName: provider.name,
    category: provider.category,
    amount: numericAmount,
    currency: isLink ? "USD" : "USDC",
    dueDate: now.toISOString().slice(0, 10),
    sourceOfFunds: isLink ? "link-agent-wallet" : "stellar-smart-wallet-usdc",
    riskLevel: type === IntentType.buyCrypto || type === IntentType.defiAllocate
      ? RiskLevel.medium
      : RiskLevel.low,
    destinationAddress: isLink
      ? `link://merchant/${provider.providerId}`
      : `GCL${provider.providerId.replace(/[^a-z0-9]/gi, "").toUpperCase()}SIMULATED`,
    legalContextUrl: provider.legalContextUrl,
    termsUrl: null,
    privacyRequirement: provider.privacyRequirement,
    proofRequired: provider.privacyRequirement === "zk-required",
    proofStatus: provider.privacyRequirement === "zk-required" ? "missing" : "not-required",
    autopilotRequested: false,
    paymentMethod: provider.paymentMethod,
    linkPaymentMode: isLink ? "shared_payment_token" : undefined,
    publicMetadata: {
      endpoint: provider.endpoint,
      directory: isLink ? "link-agent-wallet-pattern" : "provider-directory",
    },
    agentReason: reasonForProvider(provider, type),
  };

  if (type === IntentType.buyCrypto) {
    intent.cryptoAction = { asset, side: "buy", slippageBps: 45, risk: "medium" };
  }

  if (type === IntentType.defiAllocate) {
    intent.defiAllocation = {
      protocol: "defindex",
      strategy: "stable-yield-demo",
      risk: "medium",
      slippageBps: 60,
    };
  }

  const scan = assertNoSensitiveData(intent, "intent");
  if (!scan.allowed) throw httpError(400, scan.reasons.join("; "));
  return intent;
}

export function isLinkProvider(provider) {
  return provider.paymentMethod === "link-agent-wallet-simulated";
}

export function isLinkIntent(intent) {
  return intent.paymentMethod === "link-agent-wallet-simulated" || intent.sourceOfFunds === "link-agent-wallet";
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function suggestedAmount(category) {
  if (category === IntentType.buyCrypto) return 25;
  if (category === IntentType.defiAllocate) return 35;
  if (category === IntentType.billPay) return 40;
  return 12;
}

function reasonForProvider(provider, type) {
  if (isLinkProvider(provider)) {
    return `Iniciar compra con ${provider.name}; el usuario aprueba antes de emitir una credencial tokenizada.`;
  }
  if (type === IntentType.buyCrypto) return `Buy crypto allowed by policy using ${provider.name}.`;
  if (type === IntentType.defiAllocate) return `Prepare a DeFi allocation on ${provider.name}; blocked unless risk is low.`;
  if (type === IntentType.billPay) return `Prepare privacy-first bill pay with a required proof for ${provider.name}.`;
  return `Buy the ${provider.name} service discovered via directory and confirm before paying.`;
}

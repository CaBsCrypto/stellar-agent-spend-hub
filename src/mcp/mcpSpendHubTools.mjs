import { assertNoSensitiveData } from "../sensitiveDataGuard.mjs";

const MAX_MCP_PAYMENT_USDC = 0.01;
const PUBLIC_ERROR_CODES = new Set(["INVALID_AMOUNT", "IDEMPOTENCY_REQUIRED", "IDEMPOTENCY_CONFLICT", "PROVIDER_NOT_SUPPORTED", "INTENT_NOT_FOUND", "INTENT_NOT_OWNED", "RECEIPT_NOT_FOUND", "SENSITIVE_DATA_BLOCKED"]);

export class McpSpendHubTools {
  constructor({ service, appBaseUrl = "http://localhost:4179" }) {
    if (!service) throw new Error("SpendHubService is required");
    this.service = service;
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, "");
  }

  discoverProviders({ query = "", category = "" } = {}) {
    const providers = this.service.searchProviders({ query, category }).map(publicProvider);
    return safeResult({
      providers,
      count: providers.length,
      paymentFlow: "create -> prepare -> human approval in Spend Hub -> status/receipt",
    });
  }

  async createPaymentIntent({ providerId, amount, idempotencyKey }) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > MAX_MCP_PAYMENT_USDC) {
      throw toolError("INVALID_AMOUNT", `MCP demo amount must be greater than 0 and at most ${MAX_MCP_PAYMENT_USDC} USDC`);
    }
    if (!idempotencyKey || String(idempotencyKey).length < 8) {
      throw toolError("IDEMPOTENCY_REQUIRED", "idempotencyKey must contain at least 8 characters");
    }
    const provider = this.service.directoryAdapter.get(providerId);
    if (!provider || provider.category !== "pay_service" || !String(provider.paymentMethod).startsWith("stellar-")) {
      throw toolError("PROVIDER_NOT_SUPPORTED", "MCP v1 supports Stellar-native digital-service providers only");
    }

    const intent = await this.service.createIntent({
      providerId,
      amount: numericAmount,
      intentType: "pay_service",
      asset: "USDC",
      idempotencyKey: `mcp:${idempotencyKey}`,
    });
    if (intent.providerId !== providerId || Number(intent.amount) !== numericAmount || intent.currency !== "USDC") {
      throw toolError("IDEMPOTENCY_CONFLICT", "idempotencyKey was already used for a different payment request");
    }
    const evaluation = await this.service.evaluateIntent(intent);

    return safeResult({
      intent: publicIntent(intent),
      policy: publicPolicy(evaluation),
      confirmation: confirmationBoundary(this.appBaseUrl, intent.id),
    });
  }

  async preparePayment({ intentId }) {
    const intent = this.service.findIntent(intentId);
    assertMcpIntent(intent);
    const evaluation = await this.service.evaluateIntent(intent);
    const prepared = await this.service.prepareIntent(intentId);

    return safeResult({
      intent: publicIntent(intent),
      policy: publicPolicy(evaluation),
      prepared: publicPreparation(prepared),
      confirmation: confirmationBoundary(this.appBaseUrl, intent.id),
    });
  }

  async getPaymentStatus({ intentId }) {
    const state = await this.service.getState();
    const intent = state.intents.find((item) => item.id === intentId);
    if (!intent) throw toolError("INTENT_NOT_FOUND", "Payment intent not found");
    assertMcpIntent(intent);
    const receipt = state.receipts.find((item) => item.intentId === intentId);

    return safeResult({
      intent: publicIntent(intent),
      policy: publicPolicy(state.evaluations[intentId]),
      settlement: receipt ? publicReceipt(receipt) : null,
      confirmation: receipt ? null : confirmationBoundary(this.appBaseUrl, intent.id),
    });
  }

  async getReceipt({ intentId }) {
    const state = await this.service.getState();
    const receipt = state.receipts.find((item) => item.intentId === intentId || item.id === intentId);
    if (!receipt) throw toolError("RECEIPT_NOT_FOUND", "No public receipt exists for this intent");
    const intent = state.intents.find((item) => item.id === receipt.intentId);
    if (!intent) throw toolError("INTENT_NOT_FOUND", "Payment intent not found");
    assertMcpIntent(intent);
    return safeResult({ receipt: publicReceipt(receipt) });
  }
}

export function toMcpToolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

export function toMcpToolError(error) {
  const code = PUBLIC_ERROR_CODES.has(error?.code) ? error.code : "TOOL_ERROR";
  const message = publicErrorMessage(error);
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code, message } }) }],
    structuredContent: { ok: false, error: { code, message } },
    isError: true,
  };
}

function publicProvider(provider) {
  return {
    providerId: provider.providerId,
    name: provider.name,
    category: provider.category,
    endpoint: provider.endpoint,
    paymentMethod: provider.paymentMethod,
    legalContextUrl: provider.legalContextUrl,
    privacyRequirement: provider.privacyRequirement,
  };
}

function publicIntent(intent) {
  return {
    id: intent.id,
    providerId: intent.providerId,
    providerName: intent.providerName,
    intentType: intent.intentType,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
  };
}

function publicPolicy(evaluation = {}) {
  return {
    allowed: Boolean(evaluation.allowed),
    requiresConfirmation: true,
    reasons: Array.isArray(evaluation.reasons) ? evaluation.reasons : [],
    riskLevel: evaluation.riskLevel || null,
  };
}

function publicPreparation(prepared = {}) {
  return {
    rail: prepared.rail || null,
    network: prepared.network || "stellar:testnet",
    asset: prepared.asset || null,
    amount: prepared.amount == null ? null : String(prepared.amount),
    destination: prepared.destination || null,
    canSubmit: false,
    status: "prepared-awaiting-human-confirmation",
  };
}

function publicReceipt(receipt) {
  return {
    id: receipt.id,
    intentId: receipt.intentId,
    status: receipt.status,
    rail: receipt.rail,
    network: receipt.network,
    asset: receipt.asset,
    amount: receipt.amount,
    transactionHash: receipt.transactionHash || null,
    policyDecision: receipt.policyDecision,
    createdAt: receipt.createdAt || receipt.timestamp || null,
  };
}

function assertMcpIntent(intent) {
  if (!String(intent.idempotencyKey || "").startsWith("mcp:")) {
    throw toolError("INTENT_NOT_OWNED", "This intent was not created through the MCP payment boundary");
  }
  if (intent.intentType !== "pay_service" || intent.currency !== "USDC" || Number(intent.amount) > MAX_MCP_PAYMENT_USDC) {
    throw toolError("INTENT_NOT_OWNED", "This intent is outside the MCP v1 payment policy");
  }
}
function confirmationBoundary(appBaseUrl, intentId) {
  return {
    required: true,
    channel: "spend-hub-ui",
    approvalUrl: `${appBaseUrl}/spend?intent=${encodeURIComponent(intentId)}`,
    executeToolAvailable: false,
    reason: "MCP agents may prepare payments, but v1 settlement requires explicit human approval in Spend Hub.",
  };
}

function safeResult(payload) {
  const result = { ok: true, ...payload };
  const scan = assertNoSensitiveData(result, "mcp-result");
  if (!scan.allowed) throw toolError("SENSITIVE_DATA_BLOCKED", "MCP response failed the privacy firewall");
  return result;
}

function publicErrorMessage(error) {
  if (PUBLIC_ERROR_CODES.has(error?.code) && typeof error.message === "string") return error.message;
  if (error?.status === 404) return "Requested resource was not found";
  if (error?.status === 409) return "Payment policy rejected this operation";
  return "The MCP tool could not complete the request";
}

function toolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

import { IntentType, RiskLevel } from "./domain.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";
import { StellarTestnetRealAdapter } from "./stellarTestnetRealAdapter.mjs";

export async function runAdminTestnetPayment({ request, env = process.env, service, adapter = null, approvedBy = "admin-vercel-testnet" }) {
  try {
    const auth = request?.headers?.authorization || request?.headers?.Authorization || "";
    authorizeAdmin({ auth, env });

    if (String(env.STELLAR_SUBMIT_ENABLED || "").trim().toLowerCase() !== "true") {
      throw httpError(409, "STELLAR_SUBMIT_ENABLED must be true for supervised testnet submit");
    }

    const activeAdapter = adapter || new StellarTestnetRealAdapter({ env });
    const intent = buildAdminTestnetIntent(env);
    const evaluation = service ? await service.evaluateIntent(intent) : buildMinimalAllowedEvaluation();
    const prepared = await activeAdapter.preparePayment(intent, evaluation);

    if (!evaluation.allowed) throw httpError(409, evaluation.reasons.join("; "));
    if (!prepared.canSubmit) throw httpError(409, "Prepared payment cannot submit. Check testnet readiness and submit gate.");

    const receipt = await activeAdapter.settlePayment(intent, evaluation, approvedBy);
    const report = sanitizeAdminPaymentReport({ intent, prepared, receipt });
    const scan = assertNoSensitiveData(report, "adminTestnetPaymentReport");
    if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
    return report;
  } catch (error) {
    throw httpError(error.status || 500, redactEnvSecrets(error.message || "Admin testnet payment failed", env));
  }
}

export function buildAdminTestnetIntent(env = process.env) {
  return {
    id: `intent-admin-testnet-${Date.now().toString(36)}`,
    intentType: IntentType.payService,
    providerId: "browserbase-mcp",
    providerName: "Browserbase MCP",
    category: "pay_service",
    amount: Number(env.STELLAR_TEST_AMOUNT_XLM || "0.000001"),
    currency: "XLM",
    dueDate: new Date().toISOString().slice(0, 10),
    sourceOfFunds: "stellar-testnet-admin-key",
    riskLevel: RiskLevel.low,
    destinationAddress: env.STELLAR_TEST_DESTINATION,
    legalContextUrl: "https://browserbase.example/.well-known/legal-context.json",
    termsUrl: "https://browserbase.example/terms/mpp-v1.md",
    privacyRequirement: "no-pii",
    proofRequired: false,
    proofStatus: "not-required",
    autopilotRequested: false,
    publicMetadata: { purpose: "vercel-testnet-tiny-payment", directory: "admin-testnet" },
    agentReason: "Pago tiny testnet supervisado para validar settlement Stellar desde Vercel.",
  };
}

export function sanitizeAdminPaymentReport({ intent, prepared, receipt }) {
  return {
    ok: receipt.status === "settled",
    status: receipt.status,
    transactionHash: receipt.transactionHash,
    amount: prepared.amount,
    currency: intent.currency,
    rail: receipt.rail,
    network: receipt.network,
    asset: receipt.asset,
    finality: receipt.finality,
    providerId: receipt.providerId,
    intentId: receipt.intentId,
    receiptId: receipt.id,
    destination: prepared.destination,
    memo: prepared.memo,
    timestamp: receipt.timestamp,
    policyDecision: receipt.policyDecision,
  };
}

export function authorizeAdmin({ auth, env = process.env }) {
  const expected = env.TESTNET_PAYMENT_ADMIN_TOKEN;
  if (!expected) throw httpError(500, "TESTNET_PAYMENT_ADMIN_TOKEN is not configured");
  if (!auth.startsWith("Bearer ")) throw httpError(401, "Missing bearer token");
  const actual = auth.slice("Bearer ".length).trim();
  if (!timingSafeEqualString(actual, expected)) throw httpError(403, "Invalid bearer token");
}

function buildMinimalAllowedEvaluation() {
  return {
    allowed: true,
    requiresConfirmation: true,
    reasons: [],
    evidence: ["Admin token verified", "Supervised testnet submit enabled", "No PII in admin testnet intent"],
    legalDecision: { snapshot: null, termsHash: null },
    privacyDecision: { proofHash: null, commitment: null, privacyLevel: "no-pii" },
    policyDecision: { allowed: true, requiresConfirmation: true, reasons: [] },
  };
}

function timingSafeEqualString(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

function redactEnvSecrets(message, env) {
  let redacted = message;
  for (const [key, value] of Object.entries(env || {})) {
    if (!value || typeof value !== "string") continue;
    if (key.includes("SECRET") || key.includes("TOKEN")) redacted = redacted.replaceAll(value, "[REDACTED]");
  }
  return redacted;
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}


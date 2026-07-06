import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export const RiskLevel = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high",
});

export const ReceiptStatus = Object.freeze({
  settled: "settled",
  blocked: "blocked",
  pending: "pending",
});

export const IntentType = Object.freeze({
  payService: "pay_service",
  buyCrypto: "buy_crypto",
  defiAllocate: "defi_allocate",
  billPay: "bill_pay",
});

export const TrustStage = Object.freeze({
  discover: "Discover",
  privacyProof: "Privacy Proof",
  policyCheck: "Policy Check",
  userConfirm: "User Confirm",
  stellarSettle: "Stellar Settle",
});

export function money(amount, currency = "USDC") {
  return `${new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

export function evaluatePaymentIntent(intent, policy, receipts = [], options = new Date()) {
  const now = options instanceof Date ? options : options.now || new Date();
  const legalDecision = options instanceof Date ? null : options.legalDecision || null;
  const privacyDecision = options instanceof Date ? null : options.privacyDecision || null;
  const cryptoDecision = options instanceof Date ? null : options.cryptoDecision || null;
  const defiDecision = options instanceof Date ? null : options.defiDecision || null;
  const directoryResult = options instanceof Date ? null : options.directoryResult || null;
  const reasons = [];
  const evidence = [];
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);

  const spentToday = receipts
    .filter((receipt) => receipt.status === ReceiptStatus.settled && receipt.timestamp.startsWith(dayKey))
    .reduce((total, receipt) => total + receipt.amount, 0);
  const spentThisMonth = receipts
    .filter((receipt) => receipt.status === ReceiptStatus.settled && receipt.timestamp.startsWith(monthKey))
    .reduce((total, receipt) => total + receipt.amount, 0);

  const sensitiveScan = assertNoSensitiveData(publicIntentPayload(intent), "intent");
  if (!sensitiveScan.allowed) {
    reasons.push(...sensitiveScan.reasons);
  } else {
    evidence.push("No PII in the public intent payload");
  }

  if (!policy.allowlistedProviders.includes(intent.providerId)) {
    reasons.push("Provider is outside the allowlist");
  } else {
    evidence.push("Provider verified in allowlist");
  }

  if (intent.amount > policy.perPaymentLimit) {
    reasons.push("Amount exceeds the per-payment limit");
  } else {
    evidence.push("Amount within the per-payment limit");
  }

  if (spentToday + intent.amount > policy.dailyLimit) {
    reasons.push("Amount exceeds the daily limit");
  } else {
    evidence.push("Sufficient daily budget remaining");
  }

  if (spentThisMonth + intent.amount > policy.monthlyLimit) {
    reasons.push("Amount exceeds the monthly limit");
  } else {
    evidence.push("Sufficient monthly budget remaining");
  }

  if (intent.autopilotRequested || policy.autopilotEnabled) {
    reasons.push("Autopilot is disabled in Training Mode v1");
  } else {
    evidence.push("Training Mode: the user confirms before money moves");
  }

  if (intent.riskLevel === RiskLevel.high) {
    reasons.push("High risk requires extended manual review");
  }

  if (directoryResult) {
    evidence.push(`Provider discovered via directory: ${directoryResult.name}`);
  }

  if (policy.requireLegalContext && !legalDecision) {
    reasons.push("Legal context required before paying");
  }

  mergeDecision({ decision: legalDecision, reasons, evidence });
  mergeDecision({ decision: privacyDecision, reasons, evidence });
  mergeDecision({ decision: cryptoDecision, reasons, evidence });
  mergeDecision({ decision: defiDecision, reasons, evidence });

  if (intent.proofRequired && !privacyDecision) {
    reasons.push("ZK proof required before paying");
  }

  const trustFlow = buildTrustFlow({ reasons, legalDecision, privacyDecision, policy });

  return {
    allowed: reasons.length === 0,
    requiresConfirmation: true,
    reasons,
    evidence,
    spentToday,
    spentThisMonth,
    remainingDaily: Math.max(0, policy.dailyLimit - spentToday),
    remainingMonthly: Math.max(0, policy.monthlyLimit - spentThisMonth),
    legalDecision,
    privacyDecision,
    cryptoDecision,
    defiDecision,
    directoryResult,
    trustFlow,
  };
}

export function createReceipt({ intent, evaluation, railResult, approvedBy }) {
  const acceptedAt = evaluation.requiresConfirmation ? new Date().toISOString() : null;
  const executionStatus = railResult?.executionStatus || (railResult?.transactionHash ? "settled" : "simulated");
  const status = !evaluation.allowed
    ? ReceiptStatus.blocked
    : executionStatus === "preview" || executionStatus === "submitted"
      ? ReceiptStatus.pending
      : ReceiptStatus.settled;
  const receipt = {
    id: `receipt-${cryptoSafeId()}`,
    intentId: intent.id,
    providerId: intent.providerId,
    providerName: intent.providerName,
    intentType: intent.intentType,
    category: intent.category,
    amount: intent.amount,
    currency: intent.currency,
    status,
    timestamp: new Date().toISOString(),
    transactionHash: railResult?.transactionHash || null,
    rail: railResult?.rail || null,
    network: railResult?.network || null,
    asset: railResult?.asset || intent.currency,
    finality: railResult?.finality || null,
    executionStatus,
    reason: intent.agentReason,
    evidence: evaluation.allowed ? evaluation.evidence : evaluation.reasons,
    approvedBy,
    acceptedBy: evaluation.requiresConfirmation ? approvedBy : null,
    acceptedAt,
    legalContextSnapshot: evaluation.legalDecision?.snapshot || null,
    termsHash: evaluation.legalDecision?.termsHash || null,
    proofHash: evaluation.privacyDecision?.proofHash || null,
    commitment: evaluation.privacyDecision?.commitment || null,
    privacyLevel: evaluation.privacyDecision?.privacyLevel || intent.privacyRequirement || "standard",
    policyDecision: {
      allowed: evaluation.allowed,
      requiresConfirmation: evaluation.requiresConfirmation,
      reasons: evaluation.reasons,
    },
  };

  const scan = assertNoSensitiveData(receipt, "receipt");
  if (!scan.allowed) {
    return {
      ...receipt,
      status: ReceiptStatus.blocked,
      transactionHash: null,
      evidence: scan.reasons,
      policyDecision: {
        allowed: false,
        requiresConfirmation: true,
        reasons: scan.reasons,
      },
    };
  }

  return receipt;
}

export function buildTrustFlow({ reasons, legalDecision, privacyDecision, policy }) {
  const hasPolicyFailure = reasons.some(
    (reason) =>
      reason.includes("limite") ||
      reason.includes("allowlist") ||
      reason.includes("Activo") ||
      reason.includes("Slippage") ||
      reason.includes("Autopilot"),
  );
  const hasLegalFailure = legalDecision && !legalDecision.allowed;
  const hasPrivacyFailure = privacyDecision && !privacyDecision.allowed;
  const missingLegalContext = policy.requireLegalContext && !legalDecision;

  return [
    {
      stage: TrustStage.discover,
      status: hasLegalFailure || missingLegalContext ? "blocked" : "ready",
      label: "Directory, provider, price, endpoint and LCP",
    },
    {
      stage: TrustStage.privacyProof,
      status: hasPrivacyFailure ? "blocked" : "ready",
      label: "Commitments/proofs without revealing PII",
    },
    {
      stage: TrustStage.policyCheck,
      status: hasPolicyFailure ? "blocked" : "ready",
      label: "Spending, assets, slippage y risk policy",
    },
    {
      stage: TrustStage.userConfirm,
      status: reasons.length === 0 ? "pending" : "blocked",
      label: "Training Mode exige passkey del usuario",
    },
    {
      stage: TrustStage.stellarSettle,
      status: reasons.length === 0 ? "pending" : "blocked",
      label: "Stellar settlement and PII-free receipt",
    },
  ];
}

function mergeDecision({ decision, reasons, evidence }) {
  if (!decision) return;
  if (!decision.allowed) {
    reasons.push(...decision.reasons);
  } else {
    evidence.push(...decision.evidence);
  }
}

function publicIntentPayload(intent) {
  return {
    id: intent.id,
    providerId: intent.providerId,
    providerName: intent.providerName,
    intentType: intent.intentType,
    category: intent.category,
    amount: intent.amount,
    currency: intent.currency,
    agentReason: intent.agentReason,
    publicMetadata: intent.publicMetadata || {},
    railMemo: intent.railMemo || null,
    legalContextUrl: intent.legalContextUrl,
    termsUrl: intent.termsUrl,
    secretRefCommitment: intent.secretRefCommitment,
  };
}

export function cryptoSafeId() {
  const source =
    globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return source.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
}

import { cryptoSafeId } from "./domain.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export class MachinePaymentAdapter {
  constructor({ baseUrl = "/api" } = {}) {
    this.baseUrl = baseUrl;
    this.protocol = "mpp-402-demo";
  }

  createChallenge({ provider, intent, resourceId = "agent-resource" }) {
    const challenge = {
      status: 402,
      protocol: this.protocol,
      challengeId: `mpp_ch_${cryptoSafeId()}`,
      providerId: provider.providerId,
      providerName: provider.name,
      resourceId,
      amount: intent.amount,
      currency: intent.currency,
      paymentMethods: [provider.paymentMethod],
      paymentRequest: {
        intentId: intent.id,
        prepareUrl: `${this.baseUrl}/intents/${intent.id}/prepare`,
        approveUrl: `${this.baseUrl}/intents/${intent.id}/approve`,
        retryHeader: "X-Payment-Credential",
        credentialFormat: "receipt:<receiptId>",
      },
      settlementPolicy: {
        humanConfirmationRequired: true,
        autopilot: "disabled-v1",
        piiInMetadata: "forbidden",
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    assertClean(challenge, "machinePaymentChallenge");
    return challenge;
  }

  verifyCredential({ credential, receipts, providerId }) {
    const receiptId = parseReceiptCredential(credential);
    if (!receiptId) {
      return { allowed: false, reason: "Missing or invalid receipt credential" };
    }
    const receipt = receipts.find((item) => item.id === receiptId && item.providerId === providerId && item.status === "settled");
    if (!receipt) {
      return { allowed: false, reason: "Receipt not settled for this provider" };
    }
    const scan = assertNoSensitiveData(receipt, "machinePaymentReceipt");
    if (!scan.allowed) {
      return { allowed: false, reason: scan.reasons.join("; ") };
    }
    return {
      allowed: true,
      receipt,
      evidence: ["Receipt settled", "Provider matches challenge", "Receipt contains no sensitive payload"],
    };
  }

  deliverResource({ provider, resourceId, verification }) {
    if (!verification.allowed) {
      return {
        status: 402,
        error: verification.reason,
      };
    }
    const payload = {
      status: 200,
      protocol: this.protocol,
      resource: {
        id: resourceId,
        providerId: provider.providerId,
        providerName: provider.name,
        deliveredAt: new Date().toISOString(),
        content: `Paid machine resource from ${provider.name}`,
      },
      receipt: {
        id: verification.receipt.id,
        rail: verification.receipt.rail,
        network: verification.receipt.network,
        amount: verification.receipt.amount,
        currency: verification.receipt.currency,
        privacyLevel: verification.receipt.privacyLevel,
      },
      evidence: verification.evidence,
    };
    assertClean(payload, "machinePaymentResource");
    return payload;
  }
}

export function parseReceiptCredential(credential) {
  if (!credential || typeof credential !== "string") return null;
  const trimmed = credential.trim();
  if (!trimmed.startsWith("receipt:")) return null;
  const id = trimmed.slice("receipt:".length);
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}

function assertClean(value, label) {
  const scan = assertNoSensitiveData(value, label);
  if (!scan.allowed) throw new Error(scan.reasons.join("; "));
}

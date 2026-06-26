import { createReceipt, cryptoSafeId } from "./domain.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export class LinkAgentWalletAdapter {
  constructor({ env = {} } = {}) {
    this.env = env;
    this.name = "Link Agent Wallet";
    this.network = "fiat:link-simulated";
  }

  async readiness(env = this.env) {
    const enabled = env.LINK_AGENT_WALLET_ENABLED === "true";
    return {
      status: enabled ? "simulated-configured" : "simulated",
      realAvailability: "US-only-real-link",
      credentialTypes: ["shared_payment_token", "one_time_credential"],
      approvalModel: "push-or-biometric-approval-simulated",
      detail:
        "Local mode simulates Link spend requests, user approval, SPTs and one-time credentials without exposing card data.",
    };
  }

  async createSpendRequest(intent, { merchantUrl = null, lineItems = [], requestApproval = true } = {}) {
    const credentialType = intent.linkPaymentMode === "one_time_credential" ? "one_time_credential" : "shared_payment_token";
    const spendRequest = {
      id: `link_sr_${cryptoSafeId()}`,
      intentId: intent.id,
      providerId: intent.providerId,
      merchantName: intent.providerName,
      merchantUrl,
      amount: intent.amount,
      currency: intent.currency,
      status: requestApproval ? "approval_required" : "created",
      credentialType,
      requestApproval,
      approvalChannel: "link-push-simulated",
      lineItems: lineItems.length
        ? lineItems
        : [{ label: `${intent.providerName} agent purchase`, amount: intent.amount, currency: intent.currency }],
      totals: { amount: intent.amount, currency: intent.currency },
      createdAt: new Date().toISOString(),
    };
    assertClean(spendRequest, "linkSpendRequest");
    return spendRequest;
  }

  async approveSpendRequest(spendRequest, approvedBy = "link-biometric-simulated") {
    const approved = {
      ...spendRequest,
      status: "approved",
      approvedBy,
      approvedAt: new Date().toISOString(),
      paymentCredential: {
        type: spendRequest.credentialType,
        id: `${spendRequest.credentialType === "shared_payment_token" ? "spt" : "otc"}_demo_${cryptoSafeId()}`,
        piiExposed: false,
        reusable: false,
      },
    };
    assertClean(approved, "approvedLinkSpendRequest");
    return approved;
  }

  async denySpendRequest(spendRequest, deniedBy = "user") {
    const denied = {
      ...spendRequest,
      status: "denied",
      deniedBy,
      deniedAt: new Date().toISOString(),
      paymentCredential: null,
    };
    assertClean(denied, "deniedLinkSpendRequest");
    return denied;
  }

  async settlePayment(intent, evaluation, spendRequest, approvedBy = "link-biometric-simulated") {
    const approved = spendRequest.status === "approved" ? spendRequest : await this.approveSpendRequest(spendRequest, approvedBy);
    const railResult = {
      transactionHash: approved.paymentCredential.id,
      rail: this.name,
      network: this.network,
      asset: intent.currency,
      finality: "approval-gated-simulated",
    };
    return createReceipt({ intent, evaluation, railResult, approvedBy });
  }
}

function assertClean(value, label) {
  const scan = assertNoSensitiveData(value, label);
  if (!scan.allowed) {
    throw new Error(scan.reasons.join("; "));
  }
}

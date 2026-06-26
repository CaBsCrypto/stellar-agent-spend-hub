import { createReceipt } from "./domain.mjs";

export class PaymentRailAdapter {
  constructor({ name, network, asset }) {
    this.name = name;
    this.network = network;
    this.asset = asset;
  }

  async preparePayment() {
    throw new Error("preparePayment must be implemented by a concrete adapter");
  }

  async settlePayment() {
    throw new Error("settlePayment must be implemented by a concrete adapter");
  }
}

export class StellarTestnetAdapter extends PaymentRailAdapter {
  constructor() {
    super({
      name: "Stellar Smart Wallet",
      network: "stellar:testnet",
      asset: "USDC",
    });
  }

  async preparePayment(intent, evaluation) {
    return {
      rail: this.name,
      network: this.network,
      asset: this.asset,
      canSubmit: evaluation.allowed && evaluation.requiresConfirmation,
      authModel: "passkey + session key + policy signer",
      memo: `spend:${intent.intentType || intent.category}:${intent.providerId}:${intent.id}`,
      simulatedSorobanInvocation: {
        contract: "smart-wallet-policy",
        method: "approve_transfer",
        amount: intent.amount,
        destination: intent.destinationAddress,
      },
    };
  }

  async settlePayment(intent, evaluation, approvedBy = "user-passkey") {
    const railResult = evaluation.allowed
      ? {
          transactionHash: `stellar_${intent.id}_${Date.now().toString(36)}`,
          rail: this.name,
          network: this.network,
          asset: this.asset,
          finality: "simulated",
        }
      : {
          transactionHash: null,
          rail: this.name,
          network: this.network,
          asset: this.asset,
          finality: "blocked-before-submit",
        };

    return createReceipt({ intent, evaluation, railResult, approvedBy });
  }
}

import { PaymentRailAdapter } from "./paymentRailAdapter.mjs";

export class TempoAdapter extends PaymentRailAdapter {
  constructor() {
    super({
      name: "Tempo Secondary Rail",
      network: "tempo:testnet-placeholder",
      asset: "USDC",
    });
    this.status = "benchmark-only";
  }

  async preparePayment() {
    throw new Error("TempoAdapter is a benchmark placeholder for v1, not an executable rail.");
  }

  static benchmark() {
    return [
      { criterion: "Stablecoin fees", stellar: "low", tempo: "sub-cent target" },
      { criterion: "Metadata/memos", stellar: "memo/auth context", tempo: "structured payment memos" },
      { criterion: "Agent wallets", stellar: "Soroban smart wallets", tempo: "Tempo Wallet/Accounts SDK" },
      { criterion: "MPP", stellar: "MPP on Stellar available", tempo: "MPP core positioning" },
      { criterion: "Payment lanes", stellar: "general Stellar settlement", tempo: "dedicated payment lanes" },
      { criterion: "Scheduled payments", stellar: "policy/session-key roadmap", tempo: "native transaction feature" },
    ];
  }
}
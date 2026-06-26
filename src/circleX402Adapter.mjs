export class CircleX402Adapter {
  constructor({ env = {} } = {}) {
    this.env = env;
    this.name = "Circle x402 USDC Benchmark";
    this.status = "benchmark-only";
  }

  readiness(env = this.env) {
    const configured = env.CIRCLE_X402_ENABLED === "true";
    return {
      status: configured ? "simulated-configured" : "benchmark-only",
      dependency: "@circle-fin/x402-batching",
      detail:
        "Circle Agents validates USDC/x402 demand. Keep as future adapter until credentials, supported chain, and production risk are reviewed.",
      useNow: "Benchmark against our local HTTP 402 flow; do not route funds through Circle in v1.",
    };
  }

  async preparePayment() {
    throw new Error("CircleX402Adapter is a benchmark placeholder for v1, not an executable rail.");
  }

  static benchmark() {
    return [
      { criterion: "x402 seller middleware", ourHub: "local 402 challenge endpoint", circle: "@circle-fin/x402-batching" },
      { criterion: "Settlement asset", ourHub: "Stellar USDC simulated", circle: "USDC" },
      { criterion: "Buyer control", ourHub: "policy + human confirmation", circle: "agent wallet funding" },
      { criterion: "Privacy layer", ourHub: "PII guard + ZK roadmap", circle: "payment-as-auth benchmark" },
      { criterion: "Differentiator", ourHub: "Stellar + policy receipts + LatAm roadmap", circle: "USDC agent marketplace" },
    ];
  }
}

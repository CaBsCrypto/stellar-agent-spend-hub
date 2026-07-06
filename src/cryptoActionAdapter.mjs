export class CryptoActionAdapter {
  evaluate(intent, policy) {
    if (!intent.cryptoAction) {
      return { allowed: true, reasons: [], evidence: ["No additional crypto action"] };
    }

    const reasons = [];
    const evidence = [];
    const { asset, slippageBps = 0, risk = "low" } = intent.cryptoAction;

    if (!policy.allowedAssets.includes(asset)) {
      reasons.push(`Activo ${asset} no esta allowlisted`);
    } else {
      evidence.push(`Asset ${asset} allowed`);
    }

    if (intent.amount > policy.maxPortfolioActionAmount) {
      reasons.push("Crypto action exceeds the maximum amount");
    } else {
      evidence.push("Crypto amount within the limit");
    }

    if (slippageBps > policy.maxSlippageBps) {
      reasons.push("Slippage supera policy");
    } else {
      evidence.push("Slippage dentro de policy");
    }

    if (risk === "high") {
      reasons.push("Riesgo crypto alto requiere bloqueo v1");
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      evidence,
      action: intent.cryptoAction,
    };
  }

  async prepare(intent) {
    return {
      actionType: intent.intentType,
      asset: intent.cryptoAction?.asset || intent.currency,
      route: "stellar-dex-simulated",
      slippageBps: intent.cryptoAction?.slippageBps || 0,
      status: "prepared-for-user-confirmation",
    };
  }
}
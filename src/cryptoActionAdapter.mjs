export class CryptoActionAdapter {
  evaluate(intent, policy) {
    if (!intent.cryptoAction) {
      return { allowed: true, reasons: [], evidence: ["Sin accion crypto adicional"] };
    }

    const reasons = [];
    const evidence = [];
    const { asset, slippageBps = 0, risk = "low" } = intent.cryptoAction;

    if (!policy.allowedAssets.includes(asset)) {
      reasons.push(`Activo ${asset} no esta allowlisted`);
    } else {
      evidence.push(`Activo ${asset} permitido`);
    }

    if (intent.amount > policy.maxPortfolioActionAmount) {
      reasons.push("Accion crypto supera monto maximo");
    } else {
      evidence.push("Monto crypto dentro del limite");
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
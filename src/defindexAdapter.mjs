export class DeFindexAdapter {
  constructor() {
    this.status = "placeholder-until-contracts-verified";
  }

  evaluate(intent, policy) {
    if (intent.intentType !== "defi_allocate") {
      return { allowed: true, reasons: [], evidence: ["No DeFindex allocation requested"] };
    }

    const reasons = [];
    const evidence = [];
    const allocation = intent.defiAllocation || {};

    if (!policy.allowedDefiProtocols.includes("defindex")) {
      reasons.push("DeFindex no esta allowlisted");
    } else {
      evidence.push("DeFindex allowlisted como placeholder");
    }

    if (intent.amount > policy.maxPortfolioActionAmount) {
      reasons.push("La asignacion DeFi supera el monto maximo");
    } else {
      evidence.push("El monto DeFi esta dentro del limite");
    }

    if ((allocation.risk || "medium") !== "low") {
      reasons.push("Asignacion DeFi de riesgo no bajo bloqueada en v1");
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      evidence,
      allocation,
      status: this.status,
    };
  }
}
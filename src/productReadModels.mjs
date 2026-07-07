const PRODUCT_EXCLUDED_CATEGORIES = ["buy_crypto", "defi_allocate", "bill_pay"];

export function isProductIntent(intent) {
  return (intent.currency || "USDC") === "USDC"
    && !PRODUCT_EXCLUDED_CATEGORIES.includes(intent.category)
    && intent.status !== "dismissed";
}

export function isProductProvider(provider) {
  return !PRODUCT_EXCLUDED_CATEGORIES.includes(provider.category);
}

export async function productSpendView(service) {
  const spend = await service.getSpendView();
  const intents = (spend.intents || []).filter(isProductIntent);
  const ready = intents.filter((intent) => spend.evaluations?.[intent.id]?.allowed).length;
  return {
    ...spend,
    intents,
    summary: {
      ...spend.summary,
      ready,
      blocked: intents.length - ready,
    },
  };
}

export async function productHomeView({ service, publicEvidence }) {
  const [spend, evidence] = await Promise.all([
    service.getSpendView(),
    publicEvidence.manifest({ mode: "live" }),
  ]);
  const providers = service.getProvidersView().providers.filter((provider) =>
    provider.paymentMethod?.includes("stellar") || provider.providerId === "stellar-agent-merchant-lab"
  );
  const verified = (evidence.evidence || []).filter((item) => item.verificationStatus === "verified");
  const productIntents = (spend.intents || []).filter(isProductIntent);
  const ready = productIntents.filter((intent) => spend.evaluations?.[intent.id]?.allowed).length;

  return {
    agent: { mode: "Supervised", network: "stellar:testnet", asset: "USDC" },
    policy: spend.policy,
    summary: {
      ...spend.summary,
      ready,
      blocked: productIntents.length - ready,
      verifiedPayments: verified.length,
    },
    recommendations: providers.filter(isProductProvider).slice(0, 3).map((provider) => ({
      ...provider,
      categoryLabel: "API / MCP",
      status: provider.paymentMethod === "stellar-mpp-usdc" ? "pilot-ready" : "sandbox",
    })),
    proposals: spend.intents
      .filter((intent) => isProductIntent(intent) && spend.evaluations[intent.id]?.allowed)
      .slice(0, 3)
      .map((intent) => ({ ...intent, status: "ready" })),
    recentActivity: verified.slice(0, 3).map((item) => ({
      id: item.id,
      label: item.label,
      network: item.network,
      asset: item.asset,
      amount: item.amount,
      status: item.verificationStatus,
      transactionHash: item.transactionHash,
      explorerUrl: item.explorerUrl,
    })),
  };
}

export async function productActivityView({ service, publicEvidence }) {
  const [spend, evidence] = await Promise.all([
    service.getSpendView(),
    publicEvidence.manifest({ mode: "live" }),
  ]);
  const verified = (evidence.evidence || []).filter((item) => item.verificationStatus === "verified");
  const evidenceItems = verified.map((item) => ({
    id: item.id,
    label: item.label,
    kindLabel: item.evidenceType || "On-chain evidence",
    network: item.network,
    asset: item.asset,
    amount: item.amount,
    status: "verified",
    timestamp: item.verifiedAt,
    transactionHash: item.transactionHash,
    explorerUrl: item.explorerUrl,
  }));
  const receiptItems = (spend.receipts || []).map((receipt) => {
    const simulated = String(receipt.finality || "").includes("simulated");
    return {
      id: receipt.id,
      label: receipt.providerName || receipt.providerId || "Agent payment",
      kindLabel: simulated ? "Agent receipt (simulated)" : "Agent receipt",
      network: receipt.network || "stellar:testnet",
      asset: receipt.asset || receipt.currency,
      amount: String(receipt.amount || ""),
      status: simulated ? "simulated" : receipt.status || "settled",
      timestamp: receipt.timestamp,
      transactionHash: receipt.transactionHash,
      explorerUrl: null,
    };
  });
  const items = [...evidenceItems, ...receiptItems]
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  return {
    items,
    summary: { verified: verified.length, receipts: (spend.receipts || []).length },
  };
}

export function providersView(service, { query = "", category = "" } = {}) {
  return query || category
    ? { providers: service.searchProviders({ query, category }) }
    : service.getProvidersView();
}

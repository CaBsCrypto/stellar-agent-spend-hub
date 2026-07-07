export const spendingPolicy = {
  dailyLimit: 120,
  monthlyLimit: 620,
  perPaymentLimit: 90,
  currency: "USDC",
  requireHumanConfirmation: true,
  autopilotEnabled: false,
  requireLegalContext: true,
  minLegalTrustLevel: 2,
  allowedAssets: ["USDC", "XLM"],
  allowedDefiProtocols: ["defindex"],
  maxPortfolioActionAmount: 75,
  maxSlippageBps: 80,
  allowlistedProviders: ["stellar-agent-merchant-lab", "browserbase-mcp", "exa-api", "link-commerce-demo", "stellar-swap", "defindex-vault", "enel-cl"],
  categoryRules: {
    pay_service: { autopay: false, maxAmount: 60 },
    buy_crypto: { autopay: false, maxAmount: 75 },
    defi_allocate: { autopay: false, maxAmount: 40 },
    bill_pay: { autopay: false, maxAmount: 70, proofRequired: true },
  },
};

export const legalContextRegistry = {
  "https://stellar-agent-merchant-lab.vercel.app/.well-known/legal-context.json": {
    termsText: "Stellar Agent Merchant Lab terms v1: testnet-only machine purchases, maximum price 0.01 USDC, explicit buyer confirmation, no personal data in payment metadata, and no claim that simulated receipts represent on-chain settlement.",
    legalContext: {
      terms: "https://stellar-agent-merchant-lab.vercel.app/terms/mpp-sandbox-v1.md",
      atrHash: "0xd3ec2999621a6b61f49e72c8057a2ee8162ac78c6a032a24abc5b7a596526b48",
      acceptanceRequired: false,
      trustLevel: 2,
      disputeResolution: { method: "public-receipt-review", jurisdiction: "testnet-sandbox" },
    },
  },
  "https://browserbase.example/.well-known/legal-context.json": {
    termsText: "Browserbase MCP demo terms: pay-per-call browser sessions, no personal data in payment metadata.",
    legalContext: {
      terms: "https://browserbase.example/terms/mpp-v1.md",
      atrHash: "0xf0dbe47fedc2156a9753404207fb03f61abe334b3c30c75c57662ea2c1bfe530",
      acceptanceRequired: true,
      trustLevel: 3,
      disputeResolution: { method: "usage-log-review", jurisdiction: "US" },
    },
  },
  "https://exa.example/.well-known/legal-context.json": {
    termsText: "Exa API demo terms: search credits for agent workflows, no secrets or account identifiers in request memos.",
    legalContext: {
      terms: "https://exa.example/terms/api-credits-v1.md",
      atrHash: "0x529dfe27e582d96399bc786007db40b816115920d2b03064d5f1e4f969881c7c",
      acceptanceRequired: false,
      trustLevel: 2,
      disputeResolution: { method: "api-usage-ticket", jurisdiction: "US" },
    },
  },
  "https://link-commerce.example/.well-known/legal-context.json": {
    termsText: "Link commerce demo terms: delegated wallet spend requests require human approval and never expose payment credentials to agents.",
    legalContext: {
      terms: "https://link-commerce.example/terms/agent-wallet-v1.md",
      atrHash: "0x8f2faee6d048fbb5004e90d6cf7c49232f545f8405d4f794b05c699f4f0e129e",
      acceptanceRequired: true,
      trustLevel: 3,
      disputeResolution: { method: "approval-log-review", jurisdiction: "US" },
    },
  },
  "https://stellar-swap.example/.well-known/legal-context.json": {
    termsText: "Stellar swap demo terms: simulated crypto purchase, user confirms all portfolio actions.",
    legalContext: {
      terms: "https://stellar-swap.example/terms/swap-v1.md",
      atrHash: "0x2ff4bab86967049db35d13b88d36feb1c07142a4f514f92d99b2afe94fc7efd1",
      acceptanceRequired: true,
      trustLevel: 3,
      disputeResolution: { method: "wallet-receipt-review", jurisdiction: "protocol" },
    },
  },
  "https://defindex.example/.well-known/legal-context.json": {
    termsText: "DeFindex placeholder terms: strategy not executable until contracts and risks are verified.",
    legalContext: {
      terms: "https://defindex.example/terms/placeholder-v1.md",
      atrHash: "0x6a134aef194f9a08dd5e56ca56b87911ecec6f306d8a5ebca63f170d6007bf21",
      acceptanceRequired: true,
      trustLevel: 3,
      disputeResolution: { method: "not-live", jurisdiction: "protocol" },
    },
  },
  "https://enel.example/.well-known/legal-context.json": {
    termsText: "Enel Chile roadmap terms: bill payment requires a valid ZK commitment proof and no raw account identifiers.",
    legalContext: {
      terms: "https://enel.example/terms/privacy-billpay-v1.md",
      atrHash: "0xca7fc1a964ba2dbad2ca94d978de23585c128acbaa049bd1f0c07cec34ebb545",
      acceptanceRequired: true,
      trustLevel: 3,
      disputeResolution: { method: "consumer-support", jurisdiction: "CL" },
    },
  },
};

export const demoProofs = {
  "intent-enel-private": {
    proofStatus: "missing",
    commitment: "0xcommitment_pending_demo",
    proofHash: null,
    privacyLevel: "zk-required",
  },
};

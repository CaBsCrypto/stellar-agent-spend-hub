import { paymentRuntimeReadiness } from "./paymentRuntime.mjs";

export async function connectorReadiness({ env = {}, stellarAdapter = null, sorobanSmartWalletAdapter = null } = {}) {
  const stellarMissing = requiredMissing(env, ["STELLAR_SECRET_KEY", "STELLAR_PUBLIC_KEY", "STELLAR_HORIZON_URL"]);
  const mppMissing = requiredMissing(env, ["MPP_CLIENT_ID"]);
  const linkEnabled = env.LINK_AGENT_WALLET_ENABLED === "true";
  const circleEnabled = env.CIRCLE_X402_ENABLED === "true";
  const stellarReal = stellarAdapter ? await stellarAdapter.readiness() : null;
  const stellarReady = stellarReal?.status === "ready";
  const sorobanSmartWallet = sorobanSmartWalletAdapter ? sorobanSmartWalletAdapter.readiness() : null;
  const paymentRuntime = paymentRuntimeReadiness(env);

  return {
    status: paymentRuntime.submitCapable ? "ready-for-soroban-testnet-submit" : stellarReady ? "ready-for-testnet" : "simulated",
    connectors: {
      localApi: {
        status: "ready",
        detail: "Local intents, proofs, receipts and directory are functional.",
      },
      stellarSimulated: {
        status: "ready",
        detail: "Simulated Stellar receipts remain available until testnet is configured.",
      },
      sorobanSmartWallet: {
        status: sorobanSmartWallet?.status || "scaffold-ready",
        contractId: sorobanSmartWallet?.contractId || null,
        ownerPublicKey: sorobanSmartWallet?.ownerPublicKey || null,
        sessionPublicKey: sorobanSmartWallet?.sessionPublicKey || null,
        perPaymentLimit: sorobanSmartWallet?.perPaymentLimit || null,
        expiresAt: sorobanSmartWallet?.expiresAt || null,
        revoked: Boolean(sorobanSmartWallet?.revoked),
        detail: sorobanSmartWallet?.detail || "Soroban smart wallet scaffold for Sprint 03.",
      },
      paymentRuntime,
      stellarTestnet: {
        status: stellarReal?.status || (stellarMissing.length === 0 ? "env-configured" : "missing-env"),
        missing: stellarReal?.missing || stellarMissing,
        publicKey: stellarReal?.publicKey || null,
        horizonUrl: stellarReal?.horizonUrl || env.STELLAR_HORIZON_URL || null,
        detail: stellarReal?.reason || "Requires Stellar keys, Horizon URL, and @stellar/stellar-sdk before real testnet submission.",
      },
      mpp: {
        status: mppMissing.length === 0 ? "configured" : "not-configured",
        missing: mppMissing,
        detail: "MPP remains a discovery/payment benchmark until credentials and a live service are configured.",
      },
      linkAgentWallet: {
        status: linkEnabled ? "simulated-configured" : "simulated",
        missing: [],
        realAvailability: "US-only-real-link",
        detail: "Simulates Link spend requests, approval-gated SPTs and one-time credentials without exposing payment details.",
      },
      circleX402: {
        status: circleEnabled ? "simulated-configured" : "benchmark-only",
        dependency: "@circle-fin/x402-batching",
        detail: "Circle Agents validates USDC/x402 demand; keep as benchmark/future adapter while Stellar remains primary.",
      },
      defindex: {
        status: "blocked-placeholder",
        detail: "Contracts and strategy risks must be verified before enabling allocations.",
      },
    },
  };
}

function requiredMissing(env, names) {
  return names.filter((name) => !env[name]);
}

export const PaymentExecutionMode = Object.freeze({
  simulated: "simulated",
  stellarTestnetDirect: "stellar-testnet-direct",
  sorobanDryRun: "soroban-dry-run",
  sorobanTestnetSubmit: "soroban-testnet-submit",
});

const SOROBAN_SUBMIT_ENV = [
  "SOROBAN_SUBMIT_ADMIN_TOKEN",
  "SOROBAN_SMART_WALLET_CONTRACT_ID",
  "SOROBAN_NATIVE_ASSET_CONTRACT_ID",
  "SOROBAN_SESSION_PUBLIC_KEY",
  "SOROBAN_TEST_DESTINATION",
];

export function resolvePaymentExecutionMode(env = {}) {
  const configured = String(env.SPEND_HUB_PAYMENT_RAIL || "").trim().toLowerCase();
  if (configured === "stellar-testnet-direct") return PaymentExecutionMode.stellarTestnetDirect;
  if (configured === "soroban-testnet-submit") return PaymentExecutionMode.sorobanTestnetSubmit;
  if (configured === "soroban" || configured === "soroban-dry-run") return PaymentExecutionMode.sorobanDryRun;
  return PaymentExecutionMode.simulated;
}

export function paymentRuntimeReadiness(env = {}) {
  const mode = resolvePaymentExecutionMode(env);
  const submitEnabled = String(env.SOROBAN_SUBMIT_ENABLED || "").trim().toLowerCase() === "true";
  const executionDriver = env.SOROBAN_EXECUTION_DRIVER || "dry-run";
  const missing = SOROBAN_SUBMIT_ENV.filter((name) => !env[name]);
  const testnetOnly = !env.SOROBAN_NETWORK || env.SOROBAN_NETWORK === "testnet";
  const nativeAssetOnly = !env.SOROBAN_ASSET || env.SOROBAN_ASSET === "native";
  const submitCapable =
    mode === PaymentExecutionMode.sorobanTestnetSubmit &&
    submitEnabled &&
    executionDriver === "stellar-cli" &&
    missing.length === 0 &&
    testnetOnly &&
    nativeAssetOnly;

  return {
    mode,
    submitEnabled,
    executionDriver,
    adminEndpoint: "/api/admin/soroban-transfer",
    adminTokenConfigured: Boolean(env.SOROBAN_SUBMIT_ADMIN_TOKEN),
    missing,
    testnetOnly,
    nativeAssetOnly,
    submitCapable,
    detail: submitCapable
      ? "Guarded Soroban testnet submit is fully configured. Keep the gate open only during a supervised window."
      : mode === PaymentExecutionMode.sorobanTestnetSubmit
        ? "Soroban submit mode selected; admin auth, public contract config, testnet lock, submit gate and stellar-cli driver are required."
        : mode === PaymentExecutionMode.sorobanDryRun
          ? "Soroban dry-run selected; app approvals create preview receipts without a transaction hash."
          : mode === PaymentExecutionMode.stellarTestnetDirect
            ? "Direct Stellar testnet rail selected; its independent submit gate remains authoritative."
            : "Local simulated rail selected.",
  };
}

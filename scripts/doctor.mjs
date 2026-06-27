import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SpendHubService } from "../src/spendHubService.mjs";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

if (isCliEntrypoint()) {
  const report = await runDoctor({ root: process.cwd(), env: process.env });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

export async function runDoctor({ root = process.cwd(), env = process.env, statePath = join(root, "data", "runtime-state.json") } = {}) {
  const service = await new SpendHubService({ statePath, env }).load();
  const state = await service.getState();
  const diagnostics = await service.railDiagnostics();
  const runtimeStateScan = await scanRuntimeState(statePath);
  return buildDoctorReport({ state, diagnostics, runtimeStateScan });
}

export function buildDoctorReport({ state, diagnostics, runtimeStateScan }) {
  const circleX402 = diagnostics.circleX402 || { status: "benchmark-only", detail: "Circle x402 benchmark not configured.", dependency: "@circle-fin/x402-batching" };
  const sorobanSmartWallet = diagnostics.sorobanSmartWallet || { status: "scaffold-ready", detail: "Soroban smart wallet scaffold is ready.", contractId: null, perPaymentLimit: null };
  const paymentRuntime = diagnostics.paymentRuntime || { mode: "simulated", submitEnabled: false, submitCapable: false, detail: "Local simulated rail selected." };
  const mpp = diagnostics.mpp || { status: "disabled", enabled: false, ready: false, detail: "Official Stellar MPP Charge is disabled." };
  const checks = [
    {
      id: "local_api",
      ok: state.readiness.connectors.localApi.status === "ready",
      status: state.readiness.connectors.localApi.status,
      detail: state.readiness.connectors.localApi.detail,
    },
    {
      id: "provider_directory",
      ok: state.providers.length > 0,
      status: `${state.providers.length} providers`,
      detail: "Provider discovery is populated.",
    },
    {
      id: "machine_payments",
      ok: !mpp.enabled || mpp.ready,
      status: mpp.status,
      detail: mpp.detail,
      network: mpp.network,
      assetContractId: mpp.assetContractId,
      store: mpp.store?.status,
    },
    {
      id: "privacy_runtime_state",
      ok: runtimeStateScan.allowed,
      status: runtimeStateScan.allowed ? "clean" : "blocked",
      detail: runtimeStateScan.allowed ? "No sensitive values found in runtime state." : runtimeStateScan.reasons.join("; "),
    },
    {
      id: "soroban_smart_wallet",
      ok: ["scaffold-ready", "contract-configured", "asset-contract-configured"].includes(sorobanSmartWallet.status),
      status: sorobanSmartWallet.status,
      detail: sorobanSmartWallet.detail,
      contractId: sorobanSmartWallet.contractId || null,
      perPaymentLimit: sorobanSmartWallet.perPaymentLimit || null,
      requiredForRealFunds: false,
    },
    {
      id: "soroban_payment_runtime",
      ok: !paymentRuntime.submitEnabled || paymentRuntime.submitCapable,
      status: paymentRuntime.mode,
      detail: paymentRuntime.detail,
      submitEnabled: paymentRuntime.submitEnabled,
      submitCapable: paymentRuntime.submitCapable,
      adminEndpoint: paymentRuntime.adminEndpoint,
    },
    {
      id: "stellar_testnet",
      ok: diagnostics.testnet.status === "ready",
      status: diagnostics.testnet.status,
      detail: diagnostics.testnet.reason || diagnostics.testnet.detail,
      requiredForRealFunds: true,
      missing: diagnostics.testnet.missing || [],
      publicKey: diagnostics.testnet.publicKey || null,
      horizonUrl: diagnostics.testnet.horizonUrl || null,
    },
    {
      id: "link_agent_wallet",
      ok: diagnostics.linkAgentWallet.status === "simulated" || diagnostics.linkAgentWallet.status === "simulated-configured",
      status: diagnostics.linkAgentWallet.status,
      detail: diagnostics.linkAgentWallet.detail,
      simulated: true,
    },
    {
      id: "circle_x402",
      ok: circleX402.status === "benchmark-only" || circleX402.status === "simulated-configured",
      status: circleX402.status,
      detail: circleX402.detail,
      dependency: circleX402.dependency,
      benchmarkOnly: true,
    },
  ];

  const blockingFailures = checks.filter((check) => !check.ok && !check.requiredForRealFunds);
  const sorobanSubmitReady = Boolean(paymentRuntime.submitCapable);
  const realRailReady = diagnostics.testnet.status === "ready" || sorobanSubmitReady;

  return {
    ok: blockingFailures.length === 0,
    mode: sorobanSubmitReady ? "ready-for-soroban-testnet-submit" : realRailReady ? "ready-for-testnet-dry-run" : "local-functional-simulated",
    summary: {
      intents: state.intents.length,
      receipts: state.receipts.length,
      providers: state.providers.length,
      readyIntents: state.summary.ready,
      blockedIntents: state.summary.blocked,
    },
    checks,
    nextSteps: realRailReady
      ? [sorobanSubmitReady ? "Run only a supervised tiny Soroban testnet submit, then close the gate." : "Run a guarded testnet dry-run submit path before enabling real value movement."]
      : [
          "Set STELLAR_SECRET_KEY, STELLAR_PUBLIC_KEY and STELLAR_HORIZON_URL as environment variables.",
          "Run npm run setup:testnet after setting env vars; SDK readiness is checked there.",
          "Keep all real secrets out of files and runtime-state.json.",
        ],
  };
}

async function scanRuntimeState(path) {
  try {
    const content = await readFile(path, "utf8");
    return assertNoSensitiveData(JSON.parse(content), "runtimeState");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { allowed: true, findings: [], reasons: [] };
    }
    throw error;
  }
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}

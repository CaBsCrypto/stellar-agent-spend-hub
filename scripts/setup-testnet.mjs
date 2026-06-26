import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";
import { StellarTestnetRealAdapter } from "../src/stellarTestnetRealAdapter.mjs";

if (isCliEntrypoint()) {
  const report = await setupTestnet({ root: process.cwd(), env: process.env });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

export async function setupTestnet({ root = process.cwd(), env = process.env, statePath = join(root, "data", "runtime-state.json") } = {}) {
  const adapter = new StellarTestnetRealAdapter({ env });
  const readiness = await adapter.readiness({ checkHorizon: false });
  const runtimeStateScan = await scanRuntimeState(statePath);
  const ok = readiness.status === "ready" && runtimeStateScan.allowed;

  return {
    ok,
    status: readiness.status,
    mode: readiness.submitEnabled ? "submit-enabled" : "dry-run-only",
    diagnostics: readiness,
    runtimeStatePrivacy: {
      ok: runtimeStateScan.allowed,
      findings: runtimeStateScan.findings || [],
      reasons: runtimeStateScan.reasons || [],
    },
    nextSteps: nextSteps(readiness, runtimeStateScan),
  };
}

async function scanRuntimeState(path) {
  try {
    const content = await readFile(path, "utf8");
    return assertNoSensitiveData(JSON.parse(content), "runtimeState");
  } catch (error) {
    if (error.code === "ENOENT") return { allowed: true, findings: [], reasons: [] };
    throw error;
  }
}

function nextSteps(readiness, runtimeStateScan) {
  if (!runtimeStateScan.allowed) return ["Remove sensitive values from data/runtime-state.json before any real rail testing."];
  if (readiness.status === "not-ready") return ["Set STELLAR_SECRET_KEY, STELLAR_PUBLIC_KEY and STELLAR_HORIZON_URL in your shell or local .env.", "Run npm run testnet:doctor again."];
  if (readiness.status === "sdk-missing") return ["Install @stellar/stellar-sdk before using the real testnet boundary."];
  if (readiness.status === "invalid-keypair") return ["Fix STELLAR_SECRET_KEY or STELLAR_PUBLIC_KEY; the public key must match the secret key."];
  if (readiness.status === "horizon-unreachable") return ["Check STELLAR_HORIZON_URL and network access to Horizon testnet."];
  if (!readiness.submitEnabled) return ["Ready for guarded dry-run. Set STELLAR_SUBMIT_ENABLED=true only for a tiny controlled testnet transfer."];
  return ["Ready for a tiny controlled testnet transfer. Confirm destination, amount and policy before submitting."];
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}

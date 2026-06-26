import { join } from "node:path";
import { SpendHubService } from "../src/spendHubService.mjs";
import { StellarTestnetRealAdapter } from "../src/stellarTestnetRealAdapter.mjs";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const providerId = valueArg("--provider") || "browserbase-mcp";
const intentIdArg = valueArg("--intent");

const service = await new SpendHubService({
  statePath: join(process.cwd(), "data", "runtime-state.json"),
  env: process.env,
}).load();

const adapter = new StellarTestnetRealAdapter({ env: process.env });
const state = await service.getState();
const intent = intentIdArg
  ? state.intents.find((item) => item.id === intentIdArg)
  : state.intents.find((item) => item.providerId === providerId && item.status !== "settled");

if (!intent) {
  console.error(JSON.stringify({ ok: false, error: "No matching intent found", providerId, intentId: intentIdArg || null }, null, 2));
  process.exit(1);
}

const evaluation = await service.evaluateIntent(intent);
const prepared = await adapter.preparePayment(intent, evaluation);
const report = {
  ok: evaluation.allowed && prepared.readiness.status === "ready",
  executeRequested: execute,
  mode: execute ? "execute-requested" : "dry-run",
  intent: {
    id: intent.id,
    providerId: intent.providerId,
    amount: intent.amount,
    currency: intent.currency,
  },
  policy: {
    allowed: evaluation.allowed,
    reasons: evaluation.reasons,
    requiresConfirmation: evaluation.requiresConfirmation,
  },
  prepared: {
    rail: prepared.rail,
    network: prepared.network,
    asset: prepared.asset,
    amount: prepared.amount,
    destination: prepared.destination,
    memo: prepared.memo,
    canSubmit: prepared.canSubmit,
    submitMode: prepared.submitMode,
    readiness: prepared.readiness,
  },
};

if (!execute) {
  printSafe({ ...report, nextStep: "Set STELLAR_SUBMIT_ENABLED=true and rerun with --execute only for a tiny supervised testnet payment." });
  process.exit(report.ok ? 0 : 1);
}

if (process.env.STELLAR_SUBMIT_ENABLED !== "true") {
  printSafe({ ...report, ok: false, error: "Execution requires STELLAR_SUBMIT_ENABLED=true." });
  process.exit(1);
}

if (!prepared.canSubmit) {
  printSafe({ ...report, ok: false, error: "Prepared payment cannot submit. Check readiness and policy." });
  process.exit(1);
}

const receipt = await adapter.settlePayment(intent, evaluation, "user-passkey-testnet-cli");
printSafe({ ...report, ok: receipt.status === "settled", receipt });

function valueArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function printSafe(value) {
  const scan = assertNoSensitiveData(value, "testnetPaymentReport");
  const payload = scan.allowed
    ? value
    : {
        ok: false,
        error: "Sensitive data blocked from testnet payment report.",
        findings: scan.findings,
      };
  console.log(JSON.stringify(payload, null, 2));
}

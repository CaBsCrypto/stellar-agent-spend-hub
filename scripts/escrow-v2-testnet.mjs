import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_WASM = "target\\wasm32v1-none\\release\\policy_escrow_v2.wasm";

if (isCliEntrypoint()) {
  const action = readArg(process.argv, "--action") || "plan";
  try {
    const report = await runEscrowV2Testnet({
      action,
      env: process.env,
      execute: process.argv.includes("--execute"),
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: redact(error.message || String(error), process.env) }, null, 2));
    process.exitCode = 1;
  }
}

export async function runEscrowV2Testnet({
  action = "plan",
  env = process.env,
  execute = false,
  runner = execFileAsync,
} = {}) {
  if (action === "plan") {
    return safe({
      ok: true,
      mode: "plan",
      steps: ["build", "deploy", "grant", "fund", "transfer", "read"],
      assetContractId: USDC_SAC_TESTNET,
      network: "stellar:testnet",
      legacyContractFunded: false,
    });
  }
  const command = buildEscrowV2Command({ action, env });
  if (!execute) return safe({ ok: true, mode: "dry-run", action, command: command.redacted });
  const result = await runner(command.bin, command.args, { cwd: process.cwd(), env });
  return safe({
    ok: true,
    mode: "executed",
    action,
    command: command.redacted,
    stdout: redact(result.stdout || "", env),
    stderr: redact(result.stderr || "", env),
  });
}

export function buildEscrowV2Command({ action, env = process.env }) {
  const ownerIdentity = env.ESCROW_V2_OWNER_IDENTITY || "spendhub-owner";
  const sessionIdentity = env.ESCROW_V2_SESSION_IDENTITY || "spendhub-session";
  const owner = required(env.ESCROW_V2_OWNER_PUBLIC_KEY, "ESCROW_V2_OWNER_PUBLIC_KEY");
  const session = required(env.ESCROW_V2_SESSION_PUBLIC_KEY, "ESCROW_V2_SESSION_PUBLIC_KEY");
  const destination = env.ESCROW_V2_DESTINATION || session;
  const contractId = env.ESCROW_V2_CONTRACT_ID || "CCONTRACT_ID_REQUIRED";
  const asset = env.ESCROW_V2_ASSET_CONTRACT_ID || USDC_SAC_TESTNET;
  if (asset !== USDC_SAC_TESTNET) throw new Error("Policy Escrow V2 only allows testnet USDC in Sprint 09");
  const amount = env.ESCROW_V2_AMOUNT || "1";
  const perPaymentLimit = env.ESCROW_V2_PER_PAYMENT_LIMIT || "1";
  const totalLimit = env.ESCROW_V2_TOTAL_LIMIT || "2";
  const nonce = env.ESCROW_V2_NONCE || "1";
  const expiresAt = env.ESCROW_V2_EXPIRES_AT || String(Math.floor(Date.now() / 1000) + 604800);
  const paymentReference = env.ESCROW_V2_PAYMENT_REFERENCE
    || createHash("sha256").update(`escrow-v2:${nonce}:${destination}`).digest("hex");
  const network = ["--network", "testnet"];
  let args;

  if (action === "deploy") {
    args = [
      "contract", "deploy",
      "--wasm", env.ESCROW_V2_WASM_PATH || DEFAULT_WASM,
      "--source-account", ownerIdentity,
      ...network,
      "--",
      "--owner", owner,
    ];
  } else if (action === "grant") {
    args = invoke({
      contractId,
      source: ownerIdentity,
      network,
      fn: "grant_session",
      fnArgs: [
        "--owner_auth", owner,
        "--session_signer", session,
        "--allowed_destinations", JSON.stringify([destination]),
        "--allowed_assets", JSON.stringify([asset]),
        "--per_payment_limit", perPaymentLimit,
        "--total_limit", totalLimit,
        "--expires_at", expiresAt,
      ],
    });
  } else if (action === "fund") {
    args = invoke({
      contractId: asset,
      source: ownerIdentity,
      network,
      fn: "transfer",
      fnArgs: ["--from", owner, "--to", contractId, "--amount", amount],
    });
  } else if (action === "transfer") {
    args = invoke({
      contractId,
      source: sessionIdentity,
      network,
      fn: "execute_allowed_transfer",
      fnArgs: [
        "--session_signer", session,
        "--destination", destination,
        "--asset_contract", asset,
        "--amount", amount,
        "--payment_reference", paymentReference,
        "--nonce", nonce,
      ],
    });
  } else if (action === "read") {
    args = invoke({
      contractId,
      source: ownerIdentity,
      network,
      send: "no",
      fn: "read_session",
      fnArgs: ["--session_signer", session],
    });
  } else {
    throw new Error(`Unsupported Policy Escrow V2 action: ${action}`);
  }
  return {
    bin: "stellar",
    args,
    redacted: ["stellar", ...args].join(" "),
  };
}

function invoke({ contractId, source, network, fn, fnArgs, send = "yes" }) {
  return [
    "contract", "invoke",
    "--id", contractId,
    "--source-account", source,
    "--send", send,
    ...network,
    "--",
    fn,
    ...fnArgs,
  ];
}

function safe(value) {
  const scan = assertNoSensitiveData(value, "escrowV2TestnetReport");
  if (!scan.allowed) return { ok: false, error: "Sensitive data blocked from Escrow V2 report." };
  return value;
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readArg(argv, name) {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  return inline?.split("=")[1] || null;
}

function redact(value, env) {
  let output = String(value);
  for (const [key, secret] of Object.entries(env || {})) {
    if (!secret || !/(SECRET|TOKEN|SEED|MNEMONIC|PRIVATE)/i.test(key)) continue;
    output = output.split(secret).join("[REDACTED]");
  }
  return output.replace(/\bS[A-Z2-7]{55}\b/g, "[REDACTED_STELLAR_SECRET]");
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const DEFAULT_WASM = "target\\wasm32v1-none\\release\\soroban_smart_wallet.wasm";

if (isCliEntrypoint()) {
  const action = parseAction(process.argv);
  try {
    const report = await runSorobanTestnetDemo({ action, env: process.env, execute: process.argv.includes("--execute") });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: redact(String(error.message || error), process.env) }, null, 2));
    process.exitCode = 1;
  }
}

export async function runSorobanTestnetDemo({ action = "plan", env = process.env, execute = false, runner = execFileAsync } = {}) {
  const plan = buildSorobanTestnetPlan({ env });
  if (action === "plan") return safeReport({ ok: true, mode: "plan", execute: false, plan });

  const command = buildSorobanCommand({ action, env });
  if (!execute) {
    return safeReport({
      ok: true,
      mode: "dry-run",
      execute: false,
      action,
      command: command.redacted,
      nextStep: "Re-run with --execute only after QA and secret audit pass.",
    });
  }

  const result = await runner(command.bin, command.args, { cwd: process.cwd(), env });
  return safeReport({
    ok: true,
    mode: "executed",
    execute: true,
    action,
    command: command.redacted,
    stdout: redact(result.stdout || "", env),
    stderr: redact(result.stderr || "", env),
  });
}

export function buildSorobanTestnetPlan({ env = process.env, now = () => new Date() } = {}) {
  const expiresAt = Math.floor(now().getTime() / 1000) + Number(env.SOROBAN_SESSION_TTL_SECONDS || 604800);
  return [
    {
      step: "build",
      command: "npm run contract:build",
      storesSecrets: false,
    },
    {
      step: "asset",
      command: buildSorobanCommand({ action: "asset", env }).redacted,
      storesSecrets: false,
      expectedOutput: "native asset contract id C...",
    },
    {
      step: "deploy",
      command: buildSorobanCommand({ action: "deploy", env }).redacted,
      storesSecrets: false,
      expectedOutput: "contract id C...",
    },
    {
      step: "init",
      command: buildSorobanCommand({ action: "init", env }).redacted,
      requires: ["SOROBAN_SMART_WALLET_CONTRACT_ID", "SOROBAN_OWNER_PUBLIC_KEY"],
    },
    {
      step: "grant",
      command: buildSorobanCommand({ action: "grant", env: { ...env, SOROBAN_SESSION_EXPIRES_AT: String(expiresAt) } }).redacted,
      requires: ["SOROBAN_OWNER_PUBLIC_KEY", "SOROBAN_SESSION_PUBLIC_KEY", "SOROBAN_TEST_DESTINATION", "SOROBAN_NATIVE_ASSET_CONTRACT_ID"],
    },
    {
      step: "fund-contract",
      command: buildSorobanCommand({ action: "fund-contract", env }).redacted,
      requires: ["SOROBAN_SMART_WALLET_CONTRACT_ID", "SOROBAN_OWNER_PUBLIC_KEY", "SOROBAN_NATIVE_ASSET_CONTRACT_ID"],
    },
    {
      step: "execute",
      command: buildSorobanCommand({ action: "execute", env }).redacted,
      requires: ["SOROBAN_SESSION_PUBLIC_KEY", "SOROBAN_TEST_DESTINATION"],
    },
    {
      step: "transfer",
      command: buildSorobanCommand({ action: "transfer", env }).redacted,
      requires: ["SOROBAN_SMART_WALLET_CONTRACT_ID", "SOROBAN_SESSION_PUBLIC_KEY", "SOROBAN_TEST_DESTINATION", "SOROBAN_NATIVE_ASSET_CONTRACT_ID"],
    },
    {
      step: "read",
      command: buildSorobanCommand({ action: "read", env }).redacted,
      requires: ["SOROBAN_SMART_WALLET_CONTRACT_ID", "SOROBAN_SESSION_PUBLIC_KEY"],
    },
  ];
}

export function buildSorobanCommand({ action, env = process.env } = {}) {
  const common = networkArgs(env);
  const ownerIdentity = env.SOROBAN_OWNER_IDENTITY || "spendhub-owner";
  const sessionIdentity = env.SOROBAN_SESSION_IDENTITY || "spendhub-session";
  const ownerPublicKey = env.SOROBAN_OWNER_PUBLIC_KEY || "GOWNER_PUBLIC_KEY_REQUIRED";
  const sessionPublicKey = env.SOROBAN_SESSION_PUBLIC_KEY || "GSESSION_PUBLIC_KEY_REQUIRED";
  const destination = env.SOROBAN_TEST_DESTINATION || sessionPublicKey;
  const providerId = env.SOROBAN_PROVIDER_ID || "api-mcp";
  const amount = env.SOROBAN_TEST_AMOUNT || "1";
  const nonce = action === "transfer" ? env.SOROBAN_TRANSFER_NONCE || env.SOROBAN_TEST_NONCE || "2" : env.SOROBAN_TEST_NONCE || "1";
  const expiresAt = env.SOROBAN_SESSION_EXPIRES_AT || String(Math.floor(Date.now() / 1000) + 604800);
  const contractId = env.SOROBAN_SMART_WALLET_CONTRACT_ID || "CCONTRACT_ID_REQUIRED";
  const assetContractId = env.SOROBAN_NATIVE_ASSET_CONTRACT_ID || "CASSET_CONTRACT_ID_REQUIRED";

  let args;
  if (action === "asset") {
    args = ["contract", "id", "asset", "--asset", env.SOROBAN_ASSET || "native", ...common];
  } else if (action === "deploy") {
    args = ["contract", "deploy", "--wasm", env.SOROBAN_WASM_PATH || DEFAULT_WASM, "--source-account", ownerIdentity, ...common];
  } else if (action === "init") {
    args = invokeArgs({ contractId, source: ownerIdentity, common, fn: "init", fnArgs: ["--owner", ownerPublicKey] });
  } else if (action === "grant") {
    args = invokeArgs({
      contractId,
      source: ownerIdentity,
      common,
      fn: "grant_session",
      fnArgs: [
        "--owner_auth",
        ownerPublicKey,
        "--session_signer",
        sessionPublicKey,
        "--allowed_destinations",
        vec([destination]),
        "--allowed_providers",
        vec([providerId]),
        "--allowed_assets",
        vec([assetContractId]),
        "--per_payment_limit",
        amount,
        "--expires_at",
        expiresAt,
      ],
    });
  } else if (action === "fund-contract") {
    args = invokeArgs({
      contractId: assetContractId,
      source: ownerIdentity,
      common,
      fn: "transfer",
      fnArgs: ["--from", ownerPublicKey, "--to", contractId, "--amount", amount],
    });
  } else if (action === "execute") {
    args = invokeArgs({
      contractId,
      source: sessionIdentity,
      common,
      fn: "execute_allowed_payment",
      fnArgs: [
        "--session_signer",
        sessionPublicKey,
        "--destination",
        destination,
        "--amount",
        amount,
        "--provider_id",
        providerId,
        "--nonce",
        nonce,
      ],
    });
  } else if (action === "transfer") {
    args = invokeArgs({
      contractId,
      source: sessionIdentity,
      common,
      fn: "execute_allowed_transfer",
      fnArgs: [
        "--session_signer",
        sessionPublicKey,
        "--destination",
        destination,
        "--asset_contract",
        assetContractId,
        "--amount",
        amount,
        "--provider_id",
        providerId,
        "--nonce",
        nonce,
      ],
    });
  } else if (action === "read") {
    args = invokeArgs({
      contractId,
      source: ownerIdentity,
      common,
      send: "no",
      fn: "read_session",
      fnArgs: ["--session_signer", sessionPublicKey],
    });
  } else {
    throw new Error(`Unsupported Soroban action: ${action}`);
  }

  const redacted = ["stellar", ...args.map((item) => redact(item, env))].join(" ");
  return { bin: "stellar", args, redacted };
}

function invokeArgs({ contractId, source, common, fn, fnArgs, send = "yes" }) {
  return ["contract", "invoke", "--id", contractId, "--source-account", source, "--send", send, ...common, "--", fn, ...fnArgs];
}

function networkArgs(env) {
  if (env.SOROBAN_NETWORK) return ["--network", env.SOROBAN_NETWORK];
  return [
    "--rpc-url",
    env.SOROBAN_RPC_URL || DEFAULT_RPC_URL,
    "--network-passphrase",
    env.SOROBAN_NETWORK_PASSPHRASE || TESTNET_PASSPHRASE,
  ];
}

function vec(items) {
  return JSON.stringify(items);
}

function safeReport(value) {
  const scan = assertNoSensitiveData(value, "sorobanTestnetDemo");
  if (!scan.allowed) {
    return { ok: false, error: "Sensitive data blocked from Soroban testnet report.", findings: scan.findings || [] };
  }
  return value;
}

function redact(value, env) {
  let output = String(value);
  for (const [key, secret] of Object.entries(env || {})) {
    if (!secret || typeof secret !== "string") continue;
    if (!/(SECRET|TOKEN|SEED|MNEMONIC|PRIVATE)/i.test(key)) continue;
    output = output.split(secret).join("[REDACTED]");
  }
  output = output.replace(/\bS[A-Z2-7]{55}\b/g, "[REDACTED_STELLAR_SECRET]");
  return output;
}

function parseAction(argv) {
  const action = argv.find((item) => item.startsWith("--action="))?.split("=")[1];
  return action || "plan";
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}
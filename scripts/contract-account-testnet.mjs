import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_WASM = "target\\wasm32v1-none\\release\\spend_account_v1.wasm";

if (isCliEntrypoint()) {
  const action = readArg(process.argv, "--action") || "plan";
  runContractAccountTestnet({ action, env: process.env, execute: process.argv.includes("--execute") })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: redact(error.message || String(error), process.env) }));
      process.exitCode = 1;
    });
}

export async function runContractAccountTestnet({
  action,
  env = process.env,
  execute = false,
  runner = execFileAsync,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (action === "plan") {
    return safe({
      ok: true,
      network: "stellar:testnet",
      roles: {
        buyer: env.CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY || null,
        merchant: env.CONTRACT_ACCOUNT_MERCHANT || null,
        session: env.CONTRACT_ACCOUNT_SESSION_PUBLIC_KEY || null,
        relayer: env.CONTRACT_ACCOUNT_RELAYER_PUBLIC_KEY || null,
      },
      steps: ["build", "deploy", "grant-passkey", "fund-usdc", "agent-pay", "verify"],
    });
  }
  if (action === "agent-pay") return runAgentPayment({ env, fetchImpl, runner, execute });
  const command = buildContractAccountCommand({ action, env });
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

export function buildContractAccountCommand({ action, env = process.env }) {
  const relayerIdentity = env.CONTRACT_ACCOUNT_RELAYER_IDENTITY || "spendhub-relayer";
  const contractId = action === "deploy" ? null : required(env.CONTRACT_ACCOUNT_ID, "CONTRACT_ACCOUNT_ID");
  let args;
  if (action === "deploy") {
    args = [
      "contract", "deploy",
      "--wasm", env.CONTRACT_ACCOUNT_WASM_PATH || DEFAULT_WASM,
      "--source-account", relayerIdentity,
      ...networkArgs(env),
      "--",
      "--owner_public_key", fixedHex(env.CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY_HEX, 65, "CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY_HEX"),
      "--credential_id_hash", fixedHex(env.CONTRACT_ACCOUNT_CREDENTIAL_ID_HASH, 32, "CONTRACT_ACCOUNT_CREDENTIAL_ID_HASH"),
      "--rp_id_hash", fixedHex(env.CONTRACT_ACCOUNT_RP_ID_HASH, 32, "CONTRACT_ACCOUNT_RP_ID_HASH"),
      "--origin_hash", fixedHex(env.CONTRACT_ACCOUNT_ORIGIN_HASH, 32, "CONTRACT_ACCOUNT_ORIGIN_HASH"),
    ];
  } else if (action === "fund") {
    const ownerIdentity = env.CONTRACT_ACCOUNT_OWNER_IDENTITY || "spendhub-owner";
    const owner = required(env.CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY, "CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY");
    const asset = required(env.CONTRACT_ACCOUNT_ASSET_CONTRACT_ID, "CONTRACT_ACCOUNT_ASSET_CONTRACT_ID");
    const expectedAsset = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
    if (asset !== expectedAsset) throw new Error("Contract Account funding only allows testnet USDC SAC");
    const amount = env.CONTRACT_ACCOUNT_FUND_AMOUNT || "200000";
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n || BigInt(amount) > 200000n) {
      throw new Error("CONTRACT_ACCOUNT_FUND_AMOUNT must be between 1 and 200000 base units");
    }
    args = invoke(asset, ownerIdentity, "transfer", [
      "--from", owner,
      "--to", contractId,
      "--amount", amount,
    ], "yes", env);
  } else if (action === "owner") {
    args = invoke(contractId, relayerIdentity, "owner", [], "no", env);
  } else if (action === "session") {
    args = invoke(contractId, relayerIdentity, "session", [], "no", env);
  } else {
    throw new Error(`Unsupported contract account action: ${action}`);
  }
  return { bin: "stellar", args, redacted: ["stellar", ...args].join(" ") };
}

async function runAgentPayment({ env, fetchImpl, runner, execute }) {
  const endpoint = new URL(required(env.CONTRACT_ACCOUNT_ENDPOINT, "CONTRACT_ACCOUNT_ENDPOINT"));
  const prepareUrl = new URL("/api/contract-account/prepare", endpoint);
  if (!execute) {
    return safe({
      ok: true,
      mode: "dry-run",
      action: "agent-pay",
      endpoint: prepareUrl.origin,
      amount: "0.01 USDC",
      signerIdentity: env.CONTRACT_ACCOUNT_SESSION_IDENTITY || "spendhub-session",
    });
  }
  const preparedResponse = await fetchImpl(prepareUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "transfer", amount: "100000" }),
  });
  const prepared = await preparedResponse.json();
  if (!preparedResponse.ok) throw new Error(prepared.error || `Prepare failed with ${preparedResponse.status}`);
  const identity = env.CONTRACT_ACCOUNT_SESSION_IDENTITY || "spendhub-session";
  const secretResult = await runner("stellar", ["keys", "secret", identity], {
    cwd: process.cwd(),
    env,
  });
  const keypair = Keypair.fromSecret(String(secretResult.stdout || "").trim());
  const payload = Buffer.from(prepared.auth.signaturePayloadHex, "hex");
  const submitResponse = await fetchImpl(new URL("/api/contract-account/submit", endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: prepared.requestId,
      assertion: {
        type: "session",
        publicKey: Buffer.from(StrKey.decodeEd25519PublicKey(keypair.publicKey())).toString("base64url"),
        signature: keypair.sign(payload).toString("base64url"),
      },
    }),
  });
  const settled = await submitResponse.json();
  if (!submitResponse.ok) throw new Error(settled.error || `Submit failed with ${submitResponse.status}`);
  return safe({
    ok: true,
    mode: "settled",
    transactionHash: settled.receipt?.transactionHash,
    amount: settled.receipt?.amount,
    destination: settled.receipt?.destination,
    network: settled.receipt?.network,
  });
}

function invoke(contractId, source, fn, fnArgs, send = "no", env = {}) {
  return [
    "contract", "invoke",
    "--id", contractId,
    "--source-account", source,
    "--send", send,
    ...networkArgs(env),
    "--",
    fn,
    ...fnArgs,
  ];
}

function networkArgs(env) {
  return [
    "--rpc-url", env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
    "--network-passphrase", Networks.TESTNET,
  ];
}

function fixedHex(value, bytes, name) {
  if (!new RegExp(`^[a-f0-9]{${bytes * 2}}$`, "i").test(value || "")) {
    throw new Error(`${name} must contain ${bytes} bytes as hex`);
  }
  return value.toLowerCase();
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safe(value) {
  const scan = assertNoSensitiveData(value, "contractAccountCli");
  if (!scan.allowed) return { ok: false, error: "Sensitive contract account output blocked." };
  return value;
}

function redact(value, env) {
  let output = String(value);
  for (const [key, secret] of Object.entries(env || {})) {
    if (!secret || !/(SECRET|TOKEN|SEED|MNEMONIC|PRIVATE)/i.test(key)) continue;
    output = output.split(secret).join("[REDACTED]");
  }
  return output.replace(/\bS[A-Z2-7]{55}\b/g, "[REDACTED_STELLAR_SECRET]");
}

function readArg(argv, name) {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  return inline?.slice(name.length + 1) || null;
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}

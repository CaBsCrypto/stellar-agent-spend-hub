import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Keypair } from "@stellar/stellar-sdk";
import { Mppx, stellar } from "@stellar/mpp/charge/client";
import { Challenge, Receipt } from "mppx";
import { USDC_SAC_TESTNET, fromBaseUnits, toBaseUnits } from "@stellar/mpp";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";
import { MPP_NETWORK, MPP_PRICE_USDC } from "../src/mppChargeService.mjs";
import { validateTransactionHash } from "../src/stellarRiskService.mjs";

const execFileAsync = promisify(execFile);

if (isCliEntrypoint()) {
  try {
    const report = await runMppRiskAgent({ argv: process.argv.slice(2), env: process.env });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: redact(error.message || String(error), process.env) }, null, 2));
    process.exitCode = 1;
  }
}

export async function runMppRiskAgent({
  argv = [],
  env = process.env,
  fetchImpl = globalThis.fetch,
  confirm = interactiveConfirm,
  clientFactory = createClient,
  keypairResolver = resolveBuyerKeypair,
} = {}) {
  const transactionHash = validateTransactionHash(readArg(argv, "--tx") || env.MPP_RISK_TX_HASH);
  const endpoint = new URL(env.MPP_RISK_ENDPOINT || "http://localhost:4179/api/mpp/stellar-risk");
  endpoint.searchParams.set("tx", transactionHash);
  const expectedOrigin = new URL(env.MPP_ALLOWED_ORIGIN || endpoint.origin).origin;
  if (endpoint.origin !== expectedOrigin) throw new Error("MPP endpoint origin is not allowlisted");

  const probe = await fetchImpl(endpoint, { headers: { "Accept-Payment": "stellar" } });
  if (probe.status !== 402) throw new Error(`Expected an MPP 402 challenge, received ${probe.status}`);
  const challenge = Challenge.fromResponse(probe);
  validateChallenge(challenge, {
    recipient: env.MPP_EXPECTED_RECIPIENT,
    maxAmount: env.MPP_MAX_PRICE_USDC || MPP_PRICE_USDC,
  });

  const approved = env.MPP_CI_CONFIRM === "true"
    ? true
    : await confirm({
        recipient: challenge.request.recipient,
        amount: `${fromBaseUnits(BigInt(challenge.request.amount), 7)} USDC`,
        currency: challenge.request.currency,
        network: challenge.request.methodDetails?.network,
        resource: transactionHash,
      });
  if (!approved) throw new Error("Payment cancelled by user");

  const keypair = await keypairResolver({ env });
  const client = clientFactory({ keypair, fetchImpl, challenge, env });
  const response = await client.fetch(endpoint);
  if (!response.ok) throw new Error(`MPP payment retry failed with ${response.status}`);
  const payload = await response.json();
  const receipt = Receipt.fromResponse(response);
  const summary = {
    ok: true,
    status: response.status,
    protocol: "mpp/stellar-charge@0.7",
    transactionHash: receipt.reference,
    paymentStatus: receipt.status,
    amount: fromBaseUnits(BigInt(challenge.request.amount), 7),
    asset: "USDC",
    network: MPP_NETWORK,
    recipient: challenge.request.recipient,
    analyzedTransactionHash: payload.report?.transactionHash,
    reviewLevel: payload.report?.reviewLevel,
  };
  const scan = assertNoSensitiveData(summary, "mppAgentRiskSummary");
  if (!scan.allowed) throw new Error("Sensitive output blocked from MPP buyer summary");
  return summary;
}

export async function resolveBuyerKeypair({ env = process.env, runner = execFileAsync } = {}) {
  if (env.MPP_BUYER_SECRET) return Keypair.fromSecret(env.MPP_BUYER_SECRET);
  const identity = env.MPP_BUYER_IDENTITY || "spendhub-owner";
  const result = await runner("stellar", ["keys", "secret", identity], {
    cwd: process.cwd(),
    env,
  });
  const secret = String(result.stdout || "").trim();
  if (!secret) throw new Error(`Stellar CLI identity ${identity} did not return a key`);
  return Keypair.fromSecret(secret);
}

export function validateChallenge(challenge, { recipient, maxAmount = MPP_PRICE_USDC } = {}) {
  if (challenge.method !== "stellar" || challenge.intent !== "charge") throw new Error("Unsupported MPP payment method");
  if (challenge.request.methodDetails?.network !== MPP_NETWORK) throw new Error("MPP challenge network mismatch");
  if (challenge.request.currency !== USDC_SAC_TESTNET) throw new Error("MPP challenge asset mismatch");
  if (!recipient || challenge.request.recipient !== recipient) throw new Error("MPP challenge recipient mismatch");
  const amount = BigInt(challenge.request.amount);
  const maximum = toBaseUnits(String(maxAmount), 7);
  if (amount > maximum || amount <= 0n) {
    throw new Error("MPP challenge price exceeds the configured maximum");
  }
  if (!challenge.expires || Date.parse(challenge.expires) <= Date.now()) throw new Error("MPP challenge is expired or missing expiry");
  return true;
}

function createClient({ keypair, fetchImpl, challenge }) {
  const method = stellar.charge({
    keypair,
    mode: "pull",
    onProgress(event) {
      if (event.type !== "challenge") return;
      if (
        event.recipient !== challenge.request.recipient
        || event.currency !== challenge.request.currency
        || Number(event.amount) > Number(challenge.request.amount)
      ) {
        throw new Error("MPP challenge changed after human confirmation");
      }
    },
  });
  return Mppx.create({
    methods: [method],
    fetch: fetchImpl,
    polyfill: false,
  });
}

async function interactiveConfirm(details) {
  output.write(`${JSON.stringify({ action: "confirm_mpp_payment", ...details }, null, 2)}\n`);
  const readline = createInterface({ input, output });
  const answer = await readline.question('Type "CONFIRM" to authorize this testnet payment: ');
  readline.close();
  return answer.trim() === "CONFIRM";
}

function readArg(argv, name) {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function redact(value, env) {
  let outputValue = String(value);
  for (const [key, secret] of Object.entries(env || {})) {
    if (!secret || !/(SECRET|TOKEN|SEED|MNEMONIC|PRIVATE)/i.test(key)) continue;
    outputValue = outputValue.split(secret).join("[REDACTED]");
  }
  return outputValue.replace(/\bS[A-Z2-7]{55}\b/g, "[REDACTED_STELLAR_SECRET]");
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}


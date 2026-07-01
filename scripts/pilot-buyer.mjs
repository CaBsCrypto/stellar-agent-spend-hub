import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Mppx, stellar } from "@stellar/mpp/charge/client";
import { Challenge, Receipt } from "mppx";
import { fromBaseUnits } from "@stellar/mpp";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";
import { MERCHANT_LAB_ORIGIN, PILOT_AMOUNT_USDC, PILOT_NETWORK } from "../src/pilotProvider.mjs";
import { resolveBuyerKeypair, validateChallenge } from "./mpp-agent-risk.mjs";

if (isCliEntrypoint()) {
  try {
    const report = await runPilotBuyer({ argv: process.argv.slice(2), env: process.env });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: redact(error.message || String(error), process.env) }));
    process.exitCode = 1;
  }
}

export async function runPilotBuyer({
  argv = [],
  env = process.env,
  fetchImpl = globalThis.fetch,
  confirm = interactiveConfirm,
  keypairResolver = resolveBuyerKeypair,
  clientFactory = createClient,
} = {}) {
  const requestId = readArg(argv, "--request");
  if (!/^[0-9a-f-]{36}$/i.test(String(requestId || ""))) throw new Error("A valid --request UUID is required");
  const apiKey = String(env.MCP_PILOT_API_KEY || "");
  if (!/^[A-Za-z0-9_-]{24,256}$/.test(apiKey)) throw new Error("MCP_PILOT_API_KEY is required in the local environment");
  const baseUrl = new URL(env.MCP_PILOT_BASE_URL || "https://agente-pagos-stellar.vercel.app");
  const expectedOrigin = new URL(env.MCP_PILOT_ALLOWED_ORIGIN || baseUrl.origin).origin;
  if (baseUrl.origin !== expectedOrigin || baseUrl.pathname !== "/") throw new Error("Pilot API origin is not allowlisted");
  const authorization = `Bearer ${apiKey}`;

  const claim = await fetchJson(fetchImpl, new URL(`/api/pilot/requests/${requestId}/claim`, baseUrl), {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: "{}",
  });
  const request = validateClaim(claim.request);
  const resourceUrl = new URL(request.resourceUrl);
  if (resourceUrl.origin !== MERCHANT_LAB_ORIGIN) throw new Error("Pilot resource origin is not allowlisted");

  const probe = await fetchImpl(resourceUrl, { headers: { "Accept-Payment": "stellar" }, redirect: "error" });
  if (probe.status !== 402) throw new Error(`Expected an official MPP 402 challenge, received ${probe.status}`);
  const challenge = Challenge.fromResponse(probe);
  validateChallenge(challenge, { recipient: request.recipient, maxAmount: PILOT_AMOUNT_USDC });
  if (fromBaseUnits(BigInt(challenge.request.amount), 7) !== PILOT_AMOUNT_USDC) {
    throw new Error("MPP challenge amount does not match the approved pilot request");
  }

  const approved = env.MCP_PILOT_CI_CONFIRM === "true"
    ? true
    : await confirm({
        requestId,
        providerId: request.providerId,
        resourceId: request.resourceId,
        recipient: request.recipient,
        amount: `${PILOT_AMOUNT_USDC} USDC`,
        network: PILOT_NETWORK,
      });
  if (!approved) throw new Error("Pilot payment cancelled by user");

  const keypair = await keypairResolver({ env });
  const client = clientFactory({ keypair, challenge, fetchImpl });
  const paid = await client.fetch(resourceUrl, { redirect: "error" });
  if (!paid.ok) throw new Error(`Merchant Lab payment retry failed with ${paid.status}`);
  await paid.json();
  const receipt = Receipt.fromResponse(paid);
  const completion = {
    claimId: claim.claimId,
    transactionHash: receipt.reference,
    paymentStatus: receipt.status,
    network: PILOT_NETWORK,
    asset: "USDC",
    assetContractId: challenge.request.currency,
    amount: PILOT_AMOUNT_USDC,
    recipient: challenge.request.recipient,
    settledAt: receipt.timestamp,
  };
  const completed = await completeWithRetry({
    fetchImpl,
    completeUrl: new URL(`/api/pilot/requests/${requestId}/complete`, baseUrl),
    statusUrl: new URL(`/api/pilot/requests/${requestId}`, baseUrl),
    authorization,
    completion,
  });
  const summary = {
    ok: true,
    requestId,
    providerId: request.providerId,
    resourceId: request.resourceId,
    status: completed.request.status,
    amount: completed.request.amount,
    asset: completed.request.asset,
    network: completed.request.network,
    recipient: completed.request.recipient,
    transactionHash: completed.request.transactionHash,
    explorerUrl: completed.request.explorerUrl,
  };
  const scan = assertNoSensitiveData(summary, "pilotBuyerSummary");
  if (!scan.allowed) throw new Error("Sensitive output blocked from pilot buyer summary");
  return summary;
}

function createClient({ keypair, challenge, fetchImpl }) {
  return Mppx.create({
    methods: [stellar.charge({
      keypair,
      mode: "pull",
      onProgress(event) {
        if (event.type !== "challenge") return;
        if (
          event.recipient !== challenge.request.recipient
          || event.currency !== challenge.request.currency
          || BigInt(event.amount) !== BigInt(challenge.request.amount)
        ) {
          throw new Error("MPP challenge changed after human confirmation");
        }
      },
    })],
    fetch: fetchImpl,
    polyfill: false,
  });
}

function validateClaim(request) {
  if (!request || request.status !== "settling") throw new Error("Pilot request was not claimed");
  if (request.network !== PILOT_NETWORK || request.asset !== "USDC" || request.amount !== PILOT_AMOUNT_USDC) {
    throw new Error("Pilot request policy mismatch");
  }
  if (request.providerId !== "stellar-agent-merchant-lab") throw new Error("Pilot provider mismatch");
  return request;
}

async function completeWithRetry({ fetchImpl, completeUrl, statusUrl, authorization, completion }) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await fetchJson(fetchImpl, completeUrl, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify(completion),
      });
    } catch (error) {
      lastError = error;
      const retryable = error.status === 503
        || (error.status === 409 && /successful|contain the approved USDC transfer/i.test(error.message));
      if (!retryable) throw error;
      const status = await fetchJson(fetchImpl, statusUrl, { headers: { "Content-Type": "application/json" } })
        .catch(() => null);
      if (status?.request?.status === "settled") return status;
      if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw lastError || new Error("Pilot completion verification timed out");
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload.error || `Pilot API failed with ${response.status}`), {
      status: response.status,
    });
  }
  return payload;
}

async function interactiveConfirm(details) {
  output.write(`${JSON.stringify({ action: "confirm_provider_pilot_payment", ...details }, null, 2)}\n`);
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
    if (!secret || !/(SECRET|TOKEN|KEY)/i.test(key)) continue;
    outputValue = outputValue.split(secret).join("[REDACTED]");
  }
  return outputValue.replace(/\bS[A-Z2-7]{55}\b/g, "[REDACTED_STELLAR_SECRET]");
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  return import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/").replace(/^\/+/, "")}`).href;
}

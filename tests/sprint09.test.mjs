import test from "node:test";
import assert from "node:assert/strict";
import { Challenge, Receipt } from "mppx";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { Keypair } from "@stellar/stellar-sdk";
import { buildStellarRiskReport, validateTransactionHash } from "../src/stellarRiskService.mjs";
import { createAtomicRedisAdapter } from "../src/mppStore.mjs";
import { MppReceiptRepository } from "../src/mppReceiptRepository.mjs";
import { MppChargeService, MPP_NETWORK, MPP_PRICE_USDC } from "../src/mppChargeService.mjs";
import { resolveBuyerKeypair, validateChallenge } from "../scripts/mpp-agent-risk.mjs";
import { buildEscrowV2Command } from "../scripts/escrow-v2-testnet.mjs";

const recipient = "GDH7VT4AVZ33E4EI3WVGKABOJNJOGB2J463AAY677IFSCTPB35KYZKLU";
const analyzedHash = "a".repeat(64);
const paymentHash = "b".repeat(64);

test("Stellar Risk API valida hash antes de consultar Horizon", async () => {
  let calls = 0;
  assert.throws(() => validateTransactionHash("not-a-hash"), /64-character/);
  await assert.rejects(
    () => buildStellarRiskReport("not-a-hash", {
      fetchImpl: async () => {
        calls += 1;
        return new Response();
      },
    }),
    /64-character/,
  );
  assert.equal(calls, 0);
});

test("Stellar Risk report usa solo evidencia publica y heuristica determinista", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/operations")) {
      return Response.json({
        _embedded: { records: [{ type: "payment" }, { type: "invoke_host_function" }] },
      });
    }
    return Response.json({
      hash: analyzedHash,
      successful: true,
      ledger: 3300195,
      created_at: "2026-06-26T23:06:16Z",
      fee_charged: "1234",
      source_account: recipient,
      memo_type: "none",
    });
  };
  const report = await buildStellarRiskReport(analyzedHash, {
    fetchImpl,
    now: () => new Date("2026-06-27T00:00:00Z"),
  });
  assert.equal(report.reviewLevel, "low");
  assert.equal(report.operationCount, 2);
  assert.deepEqual(report.operationTypes, ["payment", "invoke_host_function"]);
  assert.ok(report.flags.includes("soroban_contract_invocation"));
  assert.equal(report.resourceHash.length, 64);
  assert.equal(JSON.stringify(report).includes("secret"), false);
});

test("Stellar Risk API retorna 404 antes de crear challenge o cobro", async () => {
  let runtimeCalls = 0;
  const service = createService({
    fetchImpl: async () => new Response("missing", { status: 404 }),
    runtime: {
      charge() {
        runtimeCalls += 1;
        return async () => ({ status: 402, challenge: new Response(null, { status: 402 }) });
      },
    },
  });
  await assert.rejects(
    () => service.handleRiskRequest(new Request(`https://example.test/api/mpp/stellar-risk?tx=${analyzedHash}`), analyzedHash),
    /not found/,
  );
  assert.equal(runtimeCalls, 0);
});

test("MPP oficial produce challenge Stellar Charge USDC testnet", async () => {
  const service = createService();
  const response = await service.handleRiskRequest(
    new Request(`https://example.test/api/mpp/stellar-risk?tx=${analyzedHash}`),
    analyzedHash,
  );
  assert.equal(response.status, 402);
  const challenge = Challenge.fromResponse(response);
  assert.equal(challenge.method, "stellar");
  assert.equal(challenge.intent, "charge");
  assert.equal(challenge.request.amount, "100000");
  assert.equal(challenge.request.currency, USDC_SAC_TESTNET);
  assert.equal(challenge.request.recipient, recipient);
  assert.equal(challenge.request.methodDetails.network, MPP_NETWORK);
  assert.ok(Date.parse(challenge.expires) > Date.now());
});

test("pago MPP verificado entrega reporte y guarda receipt publico seguro", async () => {
  const repository = new MppReceiptRepository({ env: { NODE_ENV: "test" } });
  const runtime = {
    charge() {
      return async () => ({
        status: 200,
        withReceipt(response) {
          const headers = new Headers(response.headers);
          headers.set("Payment-Receipt", Receipt.serialize({
            method: "stellar",
            reference: paymentHash,
            status: "success",
            timestamp: "2026-06-27T00:01:00Z",
          }));
          return new Response(response.body, { status: 200, headers });
        },
      });
    },
  };
  const service = createService({ repository, runtime });
  const response = await service.handleRiskRequest(
    new Request(`https://example.test/api/mpp/stellar-risk?tx=${analyzedHash}`),
    analyzedHash,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Spend-Hub-Audit"), "recorded");
  const payload = await response.json();
  assert.equal(payload.report.transactionHash, analyzedHash);
  const receipts = await repository.listReceipts();
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].transactionHash, paymentHash);
  assert.equal(receipts[0].asset, "USDC");
  assert.equal(receipts[0].amount, "0.01");
  assert.equal(JSON.stringify(receipts).includes("signedXdr"), false);
});

test("Redis CAS adapter serializa updates concurrentes sin perder incrementos", async () => {
  const redis = fakeRedis();
  const adapter = createAtomicRedisAdapter(redis);
  await adapter.set("counter", { value: 0 });
  await Promise.all([
    adapter.update("counter", (current) => ({
      op: "set",
      value: { value: current.value + 1 },
      result: "first",
    })),
    adapter.update("counter", (current) => ({
      op: "set",
      value: { value: current.value + 1 },
      result: "second",
    })),
  ]);
  assert.deepEqual(await adapter.get("counter"), { value: 2 });
});

test("buyer rechaza recipient, asset, red o precio diferentes", () => {
  const base = {
    id: "challenge-id",
    realm: "example.test",
    method: "stellar",
    intent: "charge",
    expires: new Date(Date.now() + 60_000).toISOString(),
    request: {
      amount: "100000",
      currency: USDC_SAC_TESTNET,
      recipient,
      methodDetails: { network: MPP_NETWORK },
    },
  };
  assert.equal(validateChallenge(base, { recipient }), true);
  assert.throws(() => validateChallenge({ ...base, request: { ...base.request, recipient: "GOTHER" } }, { recipient }), /recipient/);
  assert.throws(() => validateChallenge({ ...base, request: { ...base.request, currency: "COTHER" } }, { recipient }), /asset/);
  assert.throws(() => validateChallenge({ ...base, request: { ...base.request, amount: "200000" } }, { recipient }), /price/);
});

test("buyer resuelve identidad Stellar CLI sin imprimir la secret", async () => {
  const generated = Keypair.random();
  let command = null;
  const resolved = await resolveBuyerKeypair({
    env: { MPP_BUYER_IDENTITY: "spendhub-owner" },
    runner: async (bin, args) => {
      command = { bin, args };
      return { stdout: `${generated.secret()}\n`, stderr: "" };
    },
  });
  assert.equal(resolved.publicKey(), generated.publicKey());
  assert.deepEqual(command, { bin: "stellar", args: ["keys", "secret", "spendhub-owner"] });
  assert.equal(JSON.stringify(command).includes(generated.secret()), false);
});

test("Escrow V2 CLI fija USDC testnet y no usa provider como autorizacion", () => {
  const command = buildEscrowV2Command({
    action: "transfer",
    env: {
      ESCROW_V2_CONTRACT_ID: "CCONTRACT",
      ESCROW_V2_OWNER_PUBLIC_KEY: recipient,
      ESCROW_V2_SESSION_PUBLIC_KEY: recipient,
      ESCROW_V2_DESTINATION: recipient,
      ESCROW_V2_NONCE: "1",
    },
  });
  assert.ok(command.args.includes(USDC_SAC_TESTNET));
  assert.ok(command.args.includes("--payment_reference"));
  assert.equal(command.args.includes("--provider_id"), false);
  assert.equal(JSON.stringify(command).includes("SSECRET"), false);
});

function createService({ fetchImpl = horizonFetch, repository = null, runtime = null } = {}) {
  return new MppChargeService({
    env: {
      NODE_ENV: "test",
      MPP_ENABLED: "true",
      MPP_SECRET_KEY: "test-only-mpp-secret-key-at-least-32-characters",
      MPP_STELLAR_RECIPIENT: recipient,
      MPP_NETWORK,
      MPP_PRICE_USDC,
      MPP_STORE_MODE: "memory",
    },
    fetchImpl,
    repository: repository || new MppReceiptRepository({ env: { NODE_ENV: "test" } }),
    runtime,
    rateLimiter: null,
  });
}

async function horizonFetch(url) {
  if (url.includes("/operations")) {
    return Response.json({ _embedded: { records: [{ type: "payment" }] } });
  }
  return Response.json({
    hash: analyzedHash,
    successful: true,
    ledger: 1,
    created_at: "2026-06-26T00:00:00Z",
    fee_charged: "100",
    source_account: recipient,
    memo_type: "none",
  });
}

function fakeRedis() {
  const values = new Map();
  return {
    async get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async del(key) {
      values.delete(key);
    },
    async eval(_script, keys, args) {
      await Promise.resolve();
      const [key] = keys;
      const [expected, operation, nextValue] = args;
      const current = values.has(key) ? values.get(key) : null;
      if (expected === "__SPENDHUB_NULL__" ? current !== null : current !== expected) return 0;
      if (operation === "set") values.set(key, nextValue);
      if (operation === "delete") values.delete(key);
      return 1;
    },
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { PublicEvidenceService } from "../src/publicEvidenceService.mjs";
import {
  VERIFIED_FOUNDATIONS,
  assertEvidenceInvariant,
  pendingMppEvidence,
} from "../src/publicEvidenceCatalog.mjs";
import { readUpstashConfig } from "../src/upstashConfig.mjs";
import { buildContractAccountCommand } from "../scripts/contract-account-testnet.mjs";
import { MppReceiptRepository } from "../src/mppReceiptRepository.mjs";
import { ContractAccountRepository } from "../src/contractAccountRepository.mjs";
import {
  STELLAR_RISK_PROVIDER,
  createPaidProviderHandler,
  validateProviderDefinition,
} from "../src/providerKit.mjs";

const merchant = Keypair.random().publicKey();
const contractId = StrKey.encodeContract(Buffer.alloc(32, 9));

test("evidence live y replay son read-only y usan hashes publicos", async () => {
  const mppRepository = new MppReceiptRepository({ env: {} });
  const accountRepository = new ContractAccountRepository({ env: {} });
  await mppRepository.saveReceipt({
    id: "ab".repeat(32),
    transactionHash: "ab".repeat(32),
    assetContractId: USDC_SAC_TESTNET,
    amount: "0.01",
    recipient: merchant,
    resourceHash: "cd".repeat(32),
    analyzedTransactionHash: "ef".repeat(32),
    settledAt: "2026-06-27T12:00:00.000Z",
  });
  await accountRepository.saveReceipt({
    transactionHash: "12".repeat(32),
    contractId,
    action: "transfer",
    assetContractId: USDC_SAC_TESTNET,
    destination: merchant,
    amount: "100000",
    signerType: "session-ed25519",
    settledAt: "2026-06-27T12:01:00.000Z",
  });
  const service = new PublicEvidenceService({
    env: {},
    mppRepository,
    accountRepository,
    now: () => new Date("2026-06-27T12:02:00.000Z"),
  });

  const live = await service.manifest({ mode: "live" });
  const replay = await service.manifest({ mode: "replay" });
  assert.equal(live.executionAllowed, false);
  assert.equal(replay.executionAllowed, false);
  assert.equal(replay.mode, "replay");
  assert.equal(live.coordinatedDemo.mpp.status, "verified");
  assert.equal(live.coordinatedDemo.mpp.verificationStatus, "verified");
  assert.equal(live.coordinatedDemo.mpp.evidenceType, "mpp-charge");
  assert.equal(live.coordinatedDemo.mpp.verifiedAt, "2026-06-27T12:00:00.000Z");
  assert.equal(live.coordinatedDemo.contractAccount.status, "verified");
  assert.match(live.coordinatedDemo.mpp.explorerUrl, /stellar\.expert/);
  assert.equal(live.verifiedFoundations.length, 3);
});

test("evidence pendiente nunca inventa transaction hash", async () => {
  const service = new PublicEvidenceService({
    env: {},
    mppRepository: new MppReceiptRepository({ env: {} }),
    accountRepository: new ContractAccountRepository({ env: {} }),
  });
  const evidence = await service.manifest();
  assert.equal(evidence.coordinatedDemo.mpp.status, "pending");
  assert.equal(evidence.coordinatedDemo.mpp.verificationStatus, "pending");
  assert.equal(evidence.coordinatedDemo.mpp.evidenceType, "mpp-charge");
  assert.equal(evidence.coordinatedDemo.mpp.transactionHash, null);
  assert.equal(evidence.coordinatedDemo.mpp.explorerUrl, null);
  assert.equal(evidence.coordinatedDemo.mpp.verifiedAt, null);
  assert.equal(evidence.coordinatedDemo.contractAccount.transactionHash, null);
});

test("catalogo publico exige prueba completa para marcar evidencia verificada", () => {
  assert.equal(VERIFIED_FOUNDATIONS.every((item) => item.verifiedAt && item.explorerUrl), true);
  assert.doesNotThrow(() => assertEvidenceInvariant(pendingMppEvidence()));
  assert.throws(
    () => assertEvidenceInvariant({
      ...pendingMppEvidence(),
      transactionHash: "ab".repeat(32),
    }),
    /Pending evidence cannot include settlement proof/,
  );
});

test("diagnostico publico no expone URLs ni tokens privados", async () => {
  const calls = [];
  const service = new PublicEvidenceService({
    env: {
      UPSTASH_REDIS_REST_URL: "https://redis.example.test",
      UPSTASH_REDIS_REST_TOKEN: "private-placeholder",
    },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), authorization: options.headers?.Authorization });
      return new Response("ok", { status: 200 });
    },
  });
  const diagnostics = await service.diagnostics();
  assert.deepEqual(diagnostics.dependencies, {
    horizon: "reachable",
    rpc: "reachable",
    upstash: "reachable",
  });
  assert.equal(JSON.stringify(diagnostics).includes("private-placeholder"), false);
  assert.equal(JSON.stringify(diagnostics).includes("redis.example.test"), false);
  assert.equal(calls.length, 3);
});

test("ProviderDefinition fija USDC, Stellar testnet, HTTPS y precio maximo", () => {
  const provider = validateProviderDefinition(STELLAR_RISK_PROVIDER);
  assert.equal(provider.assetContractId, USDC_SAC_TESTNET);
  assert.equal(provider.network, "stellar:testnet");
  assert.equal(provider.maxPrice, "0.01");
  assert.throws(
    () => validateProviderDefinition({ ...provider, network: "stellar:pubnet" }),
    /testnet-only/,
  );
  assert.throws(
    () => validateProviderDefinition({ ...provider, maxPrice: "0.02" }),
    /maxPrice/,
  );
  assert.throws(
    () => validateProviderDefinition({ ...provider, endpoint: "http://example.com/pay" }),
    /HTTPS/,
  );
});

test("Provider Kit completa challenge 402 y retry pagado sin guardar PII", async () => {
  const handler = createPaidProviderHandler({
    definition: STELLAR_RISK_PROVIDER,
    authorize: async (request) => request.headers.get("payment-signature")
      ? { paid: true, receipt: { reference: "34".repeat(32), amount: "0.01", asset: "USDC" } }
      : { paid: false, challenge: { amount: "0.01", network: "stellar:testnet" } },
    loadResource: async () => ({ result: "verified-public-ledger-data" }),
  });
  const challenge = await handler(new Request("https://example.test/resource"));
  assert.equal(challenge.status, 402);
  const paid = await handler(new Request("https://example.test/resource", {
    headers: { "payment-signature": "opaque-test-fixture" },
  }));
  assert.equal(paid.status, 200);
  assert.equal((await paid.json()).resource.result, "verified-public-ledger-data");
});

test("Provider Kit bloquea respuestas con PII", async () => {
  const handler = createPaidProviderHandler({
    definition: STELLAR_RISK_PROVIDER,
    authorize: async () => ({ paid: true, receipt: { reference: "56".repeat(32) } }),
    loadResource: async () => ({ customerEmail: "person@example.com" }),
  });
  await assert.rejects(
    handler(new Request("https://example.test/resource")),
    /Dato sensible/,
  );
});
test("Contract Account funding fija USDC testnet y presupuesto maximo", () => {
  const command = buildContractAccountCommand({
    action: "fund",
    env: {
      CONTRACT_ACCOUNT_ID: contractId,
      CONTRACT_ACCOUNT_OWNER_IDENTITY: "spendhub-owner",
      CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY: merchant,
      CONTRACT_ACCOUNT_ASSET_CONTRACT_ID: USDC_SAC_TESTNET,
      CONTRACT_ACCOUNT_FUND_AMOUNT: "200000",
    },
  });
  assert.match(command.redacted, /transfer/);
  assert.match(command.redacted, /--amount 200000/);
  assert.match(command.redacted, /--send yes/);
  assert.equal(command.redacted.includes("S".repeat(56)), false);
  assert.throws(
    () => buildContractAccountCommand({
      action: "fund",
      env: {
        CONTRACT_ACCOUNT_ID: contractId,
        CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY: merchant,
        CONTRACT_ACCOUNT_ASSET_CONTRACT_ID: USDC_SAC_TESTNET,
        CONTRACT_ACCOUNT_FUND_AMOUNT: "200001",
      },
    }),
    /between 1 and 200000/,
  );
});
test("Vercel Marketplace KV aliases habilitan Upstash sin duplicar secretos", () => {
  const config = readUpstashConfig({
    KV_REST_API_URL: "https://marketplace.example.test",
    KV_REST_API_TOKEN: "opaque-placeholder",
  });
  assert.equal(config.configured, true);
  assert.equal(config.source, "vercel-marketplace");
});
test("entrypoints Vercel existen para todas las rutas anidadas", async () => {
  const routes = [
    "../api/[...path].mjs",
    "../api/admin/soroban-transfer.mjs",
    "../api/admin/testnet-payment.mjs",
    "../api/diagnostics/public.mjs",
    "../api/mpp/stellar-risk.mjs",
    "../api/mpp/receipts.mjs",
    "../api/contract-account/[...path].mjs",
    "../api/contract-account/ceremony/[ceremonyId].mjs",
    "../api/provider-kit/definition.mjs",
    "../api/provider-kit/validate.mjs",
    "../api/admin/contract-account/deploy.mjs",
  ];
  assert.ok(routes.length <= 12, "Hobby deployment must stay within Vercel's function budget");
  for (const route of routes) {
    const module = await import(route);
    assert.equal(typeof module.default, "function");
  }
});

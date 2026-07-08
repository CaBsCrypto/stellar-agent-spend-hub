import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  ContractAccountRelayer,
  attachAuthorization,
  contractAccountReadiness,
  validateCanonicalRequest,
} from "../src/contractAccountRelayer.mjs";
import {
  ContractAccountRepository,
  sanitizeContractAccountReceipt,
} from "../src/contractAccountRepository.mjs";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { createPreparedRequestRecord } from "../src/contractAccountRequestStore.mjs";
import { validateSubmitPayload } from "../src/contractAccountSubmitGuards.mjs";

const contractId = StrKey.encodeContract(Buffer.alloc(32, 8));
const merchant = Keypair.random().publicKey();
const session = Keypair.random().publicKey();
const relayer = Keypair.random();

function env(overrides = {}) {
  return {
    NODE_ENV: "test",
    CONTRACT_ACCOUNT_ENABLED: "true",
    CONTRACT_ACCOUNT_SUBMIT_ENABLED: "false",
    CONTRACT_ACCOUNT_NETWORK: "stellar:testnet",
    CONTRACT_ACCOUNT_ID: contractId,
    CONTRACT_ACCOUNT_MERCHANT: merchant,
    CONTRACT_ACCOUNT_SESSION_PUBLIC_KEY: session,
    CONTRACT_ACCOUNT_RELAYER_SECRET: relayer.secret(),
    ...overrides,
  };
}

function config() {
  return {
    contractId,
    merchant,
    sessionPublicKey: session,
    assetContractId: USDC_SAC_TESTNET,
  };
}

function executor() {
  return {
    prepareCalls: 0,
    submitCalls: 0,
    async prepare() {
      this.prepareCalls += 1;
      return {
        authAddress: contractId,
        unsignedAuthEntryXdr: Buffer.alloc(96, 1).toString("base64"),
        signaturePayloadHex: "ab".repeat(32),
      };
    },
    async submit() {
      this.submitCalls += 1;
      return {
        transactionHash: "cd".repeat(32),
        settledAt: "2026-06-26T20:00:00.000Z",
      };
    },
  };
}

test("request lifecycle y submit guards quedan separados del relayer", () => {
  const request = validateCanonicalRequest({ action: "transfer", amount: "100000" }, config(), new Date("2026-06-26T20:00:00.000Z"));
  const record = createPreparedRequestRecord({
    request,
    prepared: {
      authAddress: contractId,
      unsignedAuthEntryXdr: Buffer.alloc(96, 1).toString("base64"),
      signaturePayloadHex: "ab".repeat(32),
    },
    requestId: "00000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-06-26T20:00:00.000Z"),
  });
  assert.equal(record.status, "prepared");
  assert.equal(record.canonical.amount, "100000");
  assert.equal(record.expiresAt, "2026-06-26T20:10:00.000Z");
  assert.match(record.actionDigest, /^[a-f0-9]{64}$/);
  assert.doesNotThrow(() => validateSubmitPayload({ requestId: record.requestId, assertion: { type: "session" } }));
  assert.throws(() => validateSubmitPayload({ requestId: "bad", assertion: { type: "session" } }), /Invalid requestId/);
});

test("grant fija merchant, USDC, 0.01 por pago, 0.02 total y 24 horas", () => {
  const now = new Date("2026-06-26T20:00:00.000Z");
  const request = validateCanonicalRequest({ action: "grant" }, config(), now);
  assert.equal(request.destination, merchant);
  assert.equal(request.assetContractId, USDC_SAC_TESTNET);
  assert.equal(request.perPaymentLimit, "100000");
  assert.equal(request.totalLimit, "200000");
  assert.equal(request.expiresAt, Math.floor(now.getTime() / 1000) + 86_400);
  assert.equal(request.signerType, "owner-passkey");
});

test("transfer bloquea mainnet, destination, asset y monto inesperados", () => {
  assert.throws(
    () => validateCanonicalRequest({ action: "transfer", network: "stellar:pubnet" }, config()),
    /Mainnet/,
  );
  assert.throws(
    () => validateCanonicalRequest({ action: "transfer", destination: Keypair.random().publicKey() }, config()),
    /Destination/,
  );
  assert.throws(
    () => validateCanonicalRequest({ action: "transfer", assetContractId: contractId }, config()),
    /Asset/,
  );
  assert.throws(
    () => validateCanonicalRequest({ action: "transfer", amount: "100001" }, config()),
    /exceeds/,
  );
});

test("prepare devuelve solo resumen y auth entry, sin relayer secret", async () => {
  const adapter = executor();
  const service = new ContractAccountRelayer({
    env: env(),
    repository: new ContractAccountRepository({ env: env() }),
    executor: adapter,
    now: () => new Date("2026-06-26T20:00:00.000Z"),
  });
  const result = await service.prepare({ action: "transfer", amount: "100000" });
  assert.equal(result.status, "prepared");
  assert.equal(result.summary.amount, "0.0100000");
  assert.equal(result.auth.address, contractId);
  assert.equal(adapter.prepareCalls, 1);
  assert.equal(JSON.stringify(result).includes(relayer.secret()), false);
  assert.equal("transactionXdr" in result, false);
});

test("submit gate cerrado no consume request", async () => {
  const repository = new ContractAccountRepository({ env: env() });
  const service = new ContractAccountRelayer({
    env: env(),
    repository,
    executor: executor(),
  });
  const prepared = await service.prepare({ action: "revoke" });
  await assert.rejects(
    service.submit({
      requestId: prepared.requestId,
      signedAuthEntryXdr: Buffer.alloc(96, 2).toString("base64"),
    }),
    /gate is closed/,
  );
  assert.equal((await repository.getRequest(prepared.requestId)).status, "prepared");
});

test("submit exitoso crea receipt seguro e idempotencia bloquea replay", async () => {
  const runtimeEnv = env({ CONTRACT_ACCOUNT_SUBMIT_ENABLED: "true" });
  const repository = new ContractAccountRepository({ env: runtimeEnv });
  const adapter = executor();
  const service = new ContractAccountRelayer({
    env: runtimeEnv,
    repository,
    executor: adapter,
    now: () => new Date("2026-06-26T20:00:00.000Z"),
  });
  const prepared = await service.prepare({ action: "transfer", amount: "1" });
  const input = {
    requestId: prepared.requestId,
    signedAuthEntryXdr: Buffer.alloc(96, 3).toString("base64"),
  };
  const settled = await service.submit(input);
  assert.equal(settled.receipt.transactionHash, "cd".repeat(32));
  assert.equal(settled.receipt.amount, "1");
  assert.equal(settled.receipt.signerType, "session-ed25519");
  assert.equal(adapter.submitCalls, 1);
  await assert.rejects(service.submit(input), /already consumed/);
  assert.equal(adapter.submitCalls, 1);
});

test("receipt publico descarta campos sensibles y XDR", () => {
  const receipt = sanitizeContractAccountReceipt({
    transactionHash: "ef".repeat(32),
    contractId,
    action: "transfer",
    assetContractId: USDC_SAC_TESTNET,
    destination: merchant,
    amount: "1",
    signerType: "session-ed25519",
    settledAt: "2026-06-26T20:00:00.000Z",
    signedAuthEntryXdr: "secret-xdr",
    credentialId: "private-credential",
  });
  assert.equal(receipt.transactionHash, "ef".repeat(32));
  assert.equal("signedAuthEntryXdr" in receipt, false);
  assert.equal("credentialId" in receipt, false);
});

test("readiness exige Upstash para estar listo en Vercel", () => {
  const blocked = contractAccountReadiness(env());
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.missing.includes("UPSTASH_OR_KV_REST_API_CREDENTIALS"));
  const ready = contractAccountReadiness(env({
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "placeholder",
  }));
  assert.equal(ready.status, "ready-preview");
});

test("auth entry se adjunta sin destruir el objeto XDR de la operacion", () => {
  let attached = null;
  const operation = {
    sourceAccount() { return null; },
    body() {
      return { invokeHostFunctionOp: () => ({ auth: (entries) => { attached = entries; } }) };
    },
  };
  const entry = { fixture: true };
  const result = attachAuthorization(operation, entry);

  assert.equal(result, operation);
  assert.equal(typeof result.sourceAccount, "function");
  assert.deepEqual(attached, [entry]);
});

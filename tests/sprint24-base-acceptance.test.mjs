import test from "node:test";
import assert from "node:assert/strict";
import {
  createEncryptedMerchantIdentity,
  decryptMerchantIdentity,
  publicMerchantIdentity,
} from "../src/evmMerchantIdentity.mjs";
import { BaseX402Service } from "../src/baseX402Service.mjs";

const MERCHANT = "0x1111111111111111111111111111111111111111";

test("merchant identity is encrypted and publishes only its address", () => {
  const identity = createEncryptedMerchantIdentity("correct horse battery staple", {
    now: () => new Date("2026-07-02T12:00:00.000Z"),
  });
  const serialized = JSON.stringify(identity);
  assert.match(identity.address, /^0x[a-fA-F0-9]{40}$/);
  assert.equal(identity.network, "eip155:84532");
  assert.doesNotMatch(serialized, /privateKey|0x[a-fA-F0-9]{64}/);
  assert.deepEqual(Object.keys(publicMerchantIdentity(identity)), ["version", "network", "address", "createdAt"]);
});

test("merchant identity decrypts with the correct passphrase and rejects another", () => {
  const identity = createEncryptedMerchantIdentity("correct horse battery staple");
  const decrypted = decryptMerchantIdentity(identity, "correct horse battery staple");
  assert.equal(decrypted.address, identity.address);
  assert.match(decrypted.privateKey, /^0x[a-f0-9]{64}$/);
  assert.throws(
    () => decryptMerchantIdentity(identity, "this passphrase is wrong"),
    (error) => error.status === 401,
  );
});

test("Base acceptance readiness distinguishes safe closed from execution ready", async () => {
  const closed = new BaseX402Service({
    env: {
      BASE_X402_MERCHANT_ADDRESS: MERCHANT,
      PRIVY_APP_ID: "app_test",
      PRIVY_CLIENT_ID: "client_test",
    },
    fetchImpl: rpcFetch,
    facilitatorFactory: () => facilitator(),
  });
  const closedReport = await closed.acceptanceReadiness();
  assert.equal(closedReport.configurationReady, true);
  assert.equal(closedReport.infrastructureReady, true);
  assert.equal(closedReport.executionReady, false);
  assert.equal(closedReport.safeClosed, true);

  const open = new BaseX402Service({
    env: {
      MULTICHAIN_ENABLED: "true",
      BASE_X402_ENABLED: "true",
      BASE_X402_MERCHANT_ADDRESS: MERCHANT,
      PRIVY_APP_ID: "app_test",
      PRIVY_CLIENT_ID: "client_test",
    },
    fetchImpl: rpcFetch,
    facilitatorFactory: () => facilitator(),
  });
  const openReport = await open.acceptanceReadiness();
  assert.equal(openReport.executionReady, true);
  assert.equal(openReport.safeClosed, false);
});

test("Base acceptance readiness fails closed when facilitator lacks Base Sepolia", async () => {
  const service = new BaseX402Service({
    env: {
      BASE_X402_MERCHANT_ADDRESS: MERCHANT,
      PRIVY_APP_ID: "app_test",
      PRIVY_CLIENT_ID: "client_test",
    },
    fetchImpl: rpcFetch,
    facilitatorFactory: () => facilitator("eip155:1"),
  });
  const report = await service.acceptanceReadiness();
  assert.equal(report.infrastructureReady, false);
  assert.equal(report.checks.facilitator.supported, false);
});

async function rpcFetch() {
  return Response.json({ jsonrpc: "2.0", id: 1, result: "0x14a34" });
}

function facilitator(network = "eip155:84532") {
  return {
    getSupported: async () => ({
      kinds: [{ x402Version: 2, scheme: "exact", network }],
      extensions: [],
      signers: {},
    }),
  };
}

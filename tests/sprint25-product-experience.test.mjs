import test from "node:test";
import assert from "node:assert/strict";
import { ROUTES } from "../src/client/routes.mjs";
import { renderShell } from "../src/client/shell.mjs";
import { ProviderDirectoryAdapter } from "../src/providerDirectoryAdapter.mjs";
import { createApiRouter } from "../src/apiRouter.mjs";

const providers = [
  { providerId: "merchant", name: "Stellar Merchant Lab", description: "Analyze a Stellar transaction", tags: ["mpp", "agent"], category: "pay_service", paymentMethod: "stellar-mpp-usdc" },
  { providerId: "base", name: "Base Lab", description: "Experimental EVM", tags: ["evm"], category: "pay_service", paymentMethod: "base-x402" },
];
const spend = {
  policy: { perPaymentLimit: 10 },
  summary: { ready: 1, blocked: 0, receipts: 1, providers: 2 },
  intents: [{ id: "intent-1", providerName: "Stellar Merchant Lab", amount: 0.01, currency: "USDC", agentReason: "Needed for research." }],
  evaluations: { "intent-1": { allowed: true } },
  receipts: [{ id: "receipt-1", providerName: "Merchant", amount: 0.01, currency: "USDC", network: "stellar:testnet", status: "settled", timestamp: "2026-07-01T00:00:00Z" }],
};
const evidence = { evidence: [{ id: "proof-1", label: "MPP payment", evidenceType: "mpp-charge", network: "stellar:testnet", asset: "USDC", amount: "0.01", verificationStatus: "verified", verifiedAt: "2026-07-02T00:00:00Z", transactionHash: "a".repeat(64), explorerUrl: "https://stellar.expert/test" }] };

function dependencies() {
  return { publicEvidence: () => ({ manifest: async () => evidence, diagnostics: async () => ({}) }) };
}
function service() {
  return { getSpendView: async () => spend, getProvidersView: () => ({ providers }), searchProviders: ({ query }) => new ProviderDirectoryAdapter({ providers }).search({ query }) };
}

test("Stellar product routes are primary and multichain remains hidden", () => {
  assert.deepEqual(ROUTES.filter((route) => !route.hidden).map((route) => route.path), ["/", "/discover", "/spend", "/activity", "/wallet", "/mpp", "/evidence", "/security", "/providers"]);
  assert.equal(ROUTES.find((route) => route.path === "/treasury")?.hidden, true);
});

test("navigation presents Stellar agent surfaces and hides Multichain Lab", () => {
  const html = renderShell(ROUTES[0]);
  assert.match(html, /Agent Home/);
  assert.match(html, /Discover/);
  assert.ok(html.includes("Stellar testnet | USDC"));
  assert.doesNotMatch(html, /Multichain Lab/);
});

test("provider discovery understands natural requests by relevant terms", () => {
  const directory = new ProviderDirectoryAdapter({ providers });
  assert.equal(directory.search({ query: "analyze my Stellar payment" })[0]?.providerId, "merchant");
  assert.equal(directory.search({ query: "I need an agent service" })[0]?.providerId, "merchant");
});

test("agent home aggregates only Stellar recommendations and public evidence", async () => {
  const router = createApiRouter({ service: service(), env: {}, dependencies: dependencies() });
  const result = await invoke(router, "/api/home");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.recommendations.map((item) => item.providerId), ["merchant"]);
  assert.equal(result.body.summary.verifiedPayments, 1);
  assert.equal(result.body.proposals[0].status, "ready");
});

test("activity combines verified evidence and sanitized receipts", async () => {
  const router = createApiRouter({ service: service(), env: {}, dependencies: dependencies() });
  const result = await invoke(router, "/api/activity");
  assert.equal(result.status, 200);
  assert.equal(result.body.summary.verified, 1);
  assert.equal(result.body.summary.receipts, 1);
  assert.deepEqual(result.body.items.map((item) => item.id), ["proof-1", "receipt-1"]);
});

async function invoke(router, path) {
  let status = 200;
  let payload = "";
  const headers = {};
  const response = {
    writableEnded: false,
    setHeader(name, value) { headers[name.toLowerCase()] = String(value); },
    writeHead(value, nextHeaders = {}) { status = value; Object.assign(headers, nextHeaders); },
    end(value = "") { payload = String(value); this.writableEnded = true; },
  };
  await router.handle({ request: { method: "GET", headers: {} }, response, url: new URL(path, "https://example.test") });
  return { status, body: JSON.parse(payload) };
}
import test from "node:test";
import assert from "node:assert/strict";
import { createPage as createSpendPage } from "../src/client/pages/spend.mjs";
import { createPage as createActivityPage } from "../src/client/pages/activity.mjs";
import { createPage as createDiscoverPage } from "../src/client/pages/discover.mjs";
import { statusPill, errorState, emptyState } from "../src/client/components.mjs";
import { createApiRouter } from "../src/apiRouter.mjs";

const spendData = {
  policy: {
    perPaymentLimit: 90,
    dailyLimit: 120,
    monthlyLimit: 620,
    allowedAssets: ["USDC", "XLM"],
    maxSlippageBps: 80,
    autopilotEnabled: false,
    requireHumanConfirmation: true,
  },
  summary: { ready: 1, blocked: 0, receipts: 1 },
  intents: [
    {
      id: "intent-1",
      providerName: "Merchant <script>alert(1)</script>",
      intentType: "pay_service",
      amount: 0.01,
      currency: "USDC",
      status: "created",
      proofStatus: "not-required",
      proofRequired: false,
      agentReason: "Buy the service and confirm before paying.",
      privacyRequirement: "no-pii",
    },
  ],
  evaluations: { "intent-1": { allowed: true, evidence: ["Provider verified in allowlist"] } },
  receipts: [],
};
spendData.selected = spendData.intents[0];
spendData.evaluation = spendData.evaluations["intent-1"];

test("spend page renders queue, policy controls and action buttons", () => {
  const html = createSpendPage().render(spendData);
  assert.match(html, /Payment intents/);
  assert.match(html, /data-intent-action="approve"/);
  assert.match(html, /Provider verified in allowlist/);
  assert.match(html, /Daily limit/);
});

test("spend page exposes a single human approval action", () => {
  const html = createSpendPage().render(spendData);
  assert.match(html, /Approve payment/);
  assert.doesNotMatch(html, /data-intent-action="prepare"/);
  assert.doesNotMatch(html, /data-intent-action="proof"/);
});

test("activity page highlights the receipt handed off after approval", () => {
  const items = [{ id: "receipt-9", label: "Merchant", kindLabel: "Agent receipt (simulated)", network: "stellar:testnet", asset: "USDC", amount: "12", status: "simulated", timestamp: "2026-07-02T00:00:00Z" }];
  const withHighlight = createActivityPage().render({ summary: { verified: 0, receipts: 1 }, items, highlightId: "receipt-9" });
  const without = createActivityPage().render({ summary: { verified: 0, receipts: 1 }, items, highlightId: "" });
  assert.match(withHighlight, /ledger-row highlight/);
  assert.doesNotMatch(without, /ledger-row highlight/);
});

test("spend page escapes provider-controlled HTML", () => {
  const html = createSpendPage().render(spendData);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("activity page distinguishes verified evidence from simulated receipts", () => {
  const html = createActivityPage().render({
    summary: { verified: 1, receipts: 1 },
    items: [
      { id: "proof-1", label: "MPP payment", kindLabel: "mpp-charge", network: "stellar:testnet", asset: "USDC", amount: "0.01", status: "verified", timestamp: "2026-07-01T00:00:00Z", transactionHash: "a".repeat(64), explorerUrl: "https://stellar.expert/x" },
      { id: "receipt-1", label: "Browserbase MCP", kindLabel: "Agent receipt (simulated)", network: "stellar:testnet", asset: "USDC", amount: "12", status: "simulated", timestamp: "2026-07-02T00:00:00Z", transactionHash: "stellar_demo_1" },
    ],
  });
  assert.match(html, /status-pill verified/);
  assert.match(html, /Agent receipt \(simulated\)/);
  assert.match(html, />simulated</);
});

test("activity page shows an empty state without items", () => {
  const html = createActivityPage().render({ summary: { verified: 0, receipts: 0 }, items: [] });
  assert.match(html, /No activity yet/);
});

test("discover page renders providers and search form", () => {
  const html = createDiscoverPage().render({ providers: [
    { providerId: "p1", name: "Exa Search API", description: "Search credits.", category: "pay_service", paymentMethod: "stellar-usdc-simulated", tags: ["api"] },
  ], query: "search" });
  assert.match(html, /Exa Search API/);
  assert.match(html, /form|input/);
});

test("shared components stay safe and predictable", () => {
  assert.match(statusPill("verified"), /status-pill verified/);
  assert.match(statusPill("blocked"), /status-pill blocked/);
  assert.match(statusPill("simulated"), /status-pill pending/);
  assert.match(errorState(new Error("<img src=x>")), /&lt;img/);
  assert.match(emptyState("Nothing", "Come back later"), /empty-state/);
});

test("/api/activity marks simulated receipts distinctly", async () => {
  const service = {
    getSpendView: async () => ({
      receipts: [
        { id: "r1", providerName: "Demo", amount: 12, currency: "USDC", status: "settled", finality: "simulated", timestamp: "2026-07-02T00:00:00Z", transactionHash: "stellar_demo" },
        { id: "r2", providerName: "Real", amount: 0.01, currency: "USDC", status: "settled", finality: "submitted-testnet", timestamp: "2026-07-03T00:00:00Z", transactionHash: "b".repeat(64) },
      ],
    }),
  };
  const dependencies = { publicEvidence: () => ({ manifest: async () => ({ evidence: [] }), diagnostics: async () => ({}) }) };
  const router = createApiRouter({ service, env: {}, dependencies });
  let payload = "";
  const response = {
    writableEnded: false,
    setHeader() {},
    writeHead() {},
    end(value = "") { payload = String(value); this.writableEnded = true; },
  };
  await router.handle({ request: { method: "GET", headers: {} }, response, url: new URL("/api/activity", "https://example.test") });
  const body = JSON.parse(payload);
  const demo = body.items.find((item) => item.id === "r1");
  const real = body.items.find((item) => item.id === "r2");
  assert.equal(demo.status, "simulated");
  assert.equal(demo.kindLabel, "Agent receipt (simulated)");
  assert.equal(real.status, "settled");
  assert.equal(real.kindLabel, "Agent receipt");
});

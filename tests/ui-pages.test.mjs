import test from "node:test";
import assert from "node:assert/strict";
import { createPage as createOverviewPage } from "../src/client/pages/overview.mjs";
import { createPage as createSpendPage } from "../src/client/pages/spend.mjs";
import { createPage as createActivityPage } from "../src/client/pages/activity.mjs";
import { createPage as createDiscoverPage } from "../src/client/pages/discover.mjs";
import { createPage as createWalletPage } from "../src/client/pages/wallet.mjs";
import { statusPill, errorState, emptyState, evidenceRow } from "../src/client/components.mjs";
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

test("spend page exposes a single human approval action plus dismiss", () => {
  const html = createSpendPage().render(spendData);
  assert.match(html, /Approve payment/);
  assert.match(html, /data-intent-action="dismiss"/);
  assert.doesNotMatch(html, /data-intent-action="prepare"/);
  assert.doesNotMatch(html, /data-intent-action="proof"/);
});

test("/api/spend excludes dismissed intents and keeps counts consistent", async () => {
  const intents = [
    { id: "a", category: "pay_service", currency: "USDC", status: "created" },
    { id: "b", category: "pay_service", currency: "USDC", status: "dismissed" },
  ];
  const service = { getSpendView: async () => ({ policy: {}, receipts: [], intents, evaluations: { a: { allowed: true }, b: { allowed: true } }, summary: { receipts: 0 } }) };
  const router = createApiRouter({ service, env: {}, dependencies: { publicEvidence: () => ({ manifest: async () => ({ evidence: [] }) }) } });
  let payload = "";
  const response = { writableEnded: false, setHeader() {}, writeHead() {}, end(value = "") { payload = String(value); this.writableEnded = true; } };
  await router.handle({ request: { method: "GET", headers: {} }, response, url: new URL("/api/spend", "https://example.test") });
  const body = JSON.parse(payload);
  assert.deepEqual(body.intents.map((intent) => intent.id), ["a"]);
  assert.equal(body.summary.ready, 1);
  assert.equal(body.summary.blocked, 0);
});

test("POST /api/intents/:id/dismiss routes to the service", async () => {
  let dismissed = null;
  const service = { dismissIntent: async (id, by) => { dismissed = { id, by }; return { id, status: "dismissed" }; } };
  const router = createApiRouter({ service, env: {}, dependencies: { publicEvidence: () => ({ manifest: async () => ({ evidence: [] }) }) } });
  let status = 0;
  let payload = "";
  const response = { writableEnded: false, setHeader() {}, writeHead(code) { status = code; }, end(value = "") { payload = String(value); this.writableEnded = true; } };
  const request = { method: "POST", headers: {}, [Symbol.asyncIterator]: async function* () { yield Buffer.from("{}"); } };
  await router.handle({ request, response, url: new URL("/api/intents/intent-1/dismiss", "https://example.test") });
  const body = JSON.parse(payload);
  assert.equal(dismissed.id, "intent-1");
  assert.equal(body.intent.status, "dismissed");
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
  assert.match(html, />Simulated</);
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

test("home states the user-first Stellar approval promise", () => {
  const html = createOverviewPage().render({
    agent: { mode: "Training" },
    summary: { ready: 1, verifiedPayments: 2 },
    policy: { perPaymentLimit: 0.01 },
    proposals: [{ id: "p1", providerName: "Merchant Lab", agentReason: "Analyze a Stellar transaction", amount: 0.01, currency: "USDC", status: "created" }],
    recentActivity: [],
  });
  assert.match(html, /Your agent prepares Stellar USDC payments/);
  assert.match(html, /You approve every settlement/);
  assert.match(html, /Human approval stays on/);
  assert.doesNotMatch(html, /Multichain Lab|Treasury/);
});

test("wallet keeps the main user flow Stellar-first and hides Treasury", () => {
  const html = createWalletPage().render({
    account: { readiness: { status: "disabled", submitEnabled: false }, receipts: [] },
    overview: { evidence: { coordinatedDemo: { contractAccount: { verificationStatus: "pending" } } } },
    localPasskey: null,
  });
  assert.match(html, /Smart Wallet controls/);
  assert.match(html, /Submit gate is closed/);
  assert.doesNotMatch(html, /Open Treasury|Privy embedded wallet|Base and Avalanche/);
});

test("pending evidence rows do not invent transaction hashes", () => {
  const html = evidenceRow({ label: "USDC acceptance", verificationStatus: "pending", amount: "0.01", asset: "USDC" });
  assert.match(html, />Pending</);
  assert.doesNotMatch(html, /<code/);
});

test("shell renders a five-tab bottom navigation for mobile", async () => {
  const { renderShell } = await import("../src/client/shell.mjs");
  const { ROUTES } = await import("../src/client/routes.mjs");
  const html = renderShell(ROUTES[0]);
  const tabs = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.equal((tabs.match(/<a /g) || []).length, 5);
  assert.match(tabs, />Home</);
  assert.match(tabs, />Approve</);
  assert.match(tabs, /aria-current="page"/);
});

test("shared components stay safe and predictable", () => {
  assert.match(statusPill("verified"), /status-pill verified/);
  assert.match(statusPill("blocked"), /status-pill blocked/);
  assert.match(statusPill("simulated"), /status-pill simulated/);
  assert.match(statusPill("settled"), /status-pill verified/);
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

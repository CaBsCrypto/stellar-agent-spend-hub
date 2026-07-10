import test from "node:test";
import assert from "node:assert/strict";
import { createPage as createOverviewPage } from "../src/client/pages/overview.mjs";
import { createPage as createDiscoverPage } from "../src/client/pages/discover.mjs";
import { createPage as createSpendPage } from "../src/client/pages/spend.mjs";
import { createPage as createActivityPage } from "../src/client/pages/activity.mjs";
import { createPage as createWalletPage } from "../src/client/pages/wallet.mjs";

// Regression guard for the 2026-07-07 audit finding: the primary, non-expert
// pages (Home/Discover/Review/Activity/Wallet) must read 100% in Spanish.
// Trust & Builders pages (/mpp, /evidence, /security, /providers) and the
// hidden /treasury lab stay English on purpose - not covered here.
//
// This is not a grammar checker: it is a cheap tripwire for common English
// words that should not appear in Spanish sentences. Known accepted English
// tokens (product/technical nouns, and the still-shared status-pill badge
// text - see docs/current-state.md "Brechas conocidas") are allow-listed.

const ENGLISH_TRIPWIRES = [
  " the ", " and ", " is ", " are ", " service", " payment", " provider",
  " approved", " discovered", " needs ", " before ", " without ", " amount",
  " request", " recipient", " pending", "verify<", "not available",
];

const ALLOWED_TOKENS = [
  // Product/technical proper nouns and acronyms, not translatable.
  "stellar", "usdc", "xlm", "mcp", "api", "mpp", "pwa", "demo data",
  // Known gap: status-pill text is shared with the English /mpp page via
  // receiptRow/approvalCard, and "Pending supervised settlement" comes from
  // evidenceCard's default (also shared with /evidence); see
  // docs/current-state.md "Brechas conocidas".
  "ready", "blocked", "verified", "simulated", "pending", "settled", "disabled",
  "pending supervised settlement",
];

function stripAllowedTokens(html) {
  let text = html.replace(/<[^>]*>/g, " ").toLowerCase();
  for (const token of ALLOWED_TOKENS) text = text.split(token).join(" ");
  return text;
}

function assertSpanishOnly(html, label) {
  const text = stripAllowedTokens(html);
  const hits = ENGLISH_TRIPWIRES.filter((needle) => text.includes(needle));
  assert.deepEqual(hits, [], `${label} contiene palabras en ingles fuera de la lista permitida: ${hits.join(", ")}`);
}

test("Home reads fully in Spanish", () => {
  const html = createOverviewPage().render({
    agent: { mode: "Supervisado" },
    summary: { ready: 1, verifiedPayments: 3 },
    policy: { perPaymentLimit: 90 },
    proposals: [{ id: "p1", providerName: "Stellar Agent Merchant Lab", agentReason: "Analizar una transaccion y confirmar antes de pagar.", amount: 12, currency: "USDC", status: "ready" }],
    recentActivity: [{ id: "e1", label: "Primer pago verificado", network: "stellar:testnet", asset: "XLM", amount: "0.0000010", transactionHash: "a".repeat(64), explorerUrl: "https://stellar.expert/x" }],
  });
  assertSpanishOnly(html, "Home");
});

test("Discover reads fully in Spanish", () => {
  const html = createDiscoverPage().render({
    query: "analizar transaccion",
    providers: [{ providerId: "p1", name: "Stellar Agent Merchant Lab", description: "Sandbox independiente MCP y MPP para compras reproducibles en Stellar testnet.", category: "pay_service", paymentMethod: "stellar-mpp-usdc", tags: ["mcp"] }],
  });
  assertSpanishOnly(html, "Discover");
});

test("Review (spend) reads fully in Spanish", () => {
  const intent = {
    id: "intent-1", providerName: "Stellar Agent Merchant Lab", intentType: "pay_service",
    amount: 12, currency: "USDC", status: "created", proofStatus: "not-required", proofRequired: false,
    agentReason: "Comprar el servicio encontrado en el directorio y confirmar antes de pagar.",
    privacyRequirement: "no-pii",
  };
  const html = createSpendPage().render({
    policy: { perPaymentLimit: 90, dailyLimit: 120, monthlyLimit: 620, allowedAssets: ["USDC", "XLM"], maxSlippageBps: 80, autopilotEnabled: false, requireHumanConfirmation: true },
    summary: { ready: 1, blocked: 0, receipts: 1 },
    intents: [intent],
    evaluations: { "intent-1": { allowed: true, evidence: ["Proveedor verificado en la lista permitida", "Sin datos personales en la propuesta publica"] } },
    receipts: [],
    selected: intent,
    evaluation: { allowed: true, evidence: ["Proveedor verificado en la lista permitida"] },
  });
  assertSpanishOnly(html, "Review");
});

test("Activity reads fully in Spanish", () => {
  const html = createActivityPage().render({
    summary: { verified: 1, receipts: 1 },
    items: [
      { id: "proof-1", label: "Cobro MPP oficial", kindLabel: "mpp-charge", network: "stellar:testnet", asset: "USDC", amount: "0.01", status: "verified", timestamp: "2026-07-01T00:00:00Z", transactionHash: "a".repeat(64), explorerUrl: "https://stellar.expert/x" },
      { id: "receipt-1", label: "Stellar Agent Merchant Lab", kindLabel: "Agent receipt (simulated)", network: "stellar:testnet", asset: "USDC", amount: "12", status: "simulated", timestamp: "2026-07-02T00:00:00Z", transactionHash: "stellar_demo" },
    ],
    feedback: { feedback: { status: "memory-local", count: 3, needsMoreFeedback: false, clarity: { clear: 2 }, trust: { clear: 3 }, themes: [{ theme: "provider", count: 2 }, { theme: "clarity", count: 1 }] } },
    highlightId: "", feedbackContext: "approved",
  });
  assertSpanishOnly(html, "Activity");
});

test("Wallet (Permisos) reads fully in Spanish", () => {
  const html = createWalletPage().render({
    account: { readiness: { status: "disabled", submitEnabled: false }, receipts: [] },
    overview: { evidence: { coordinatedDemo: { contractAccount: { verificationStatus: "pending" } } } },
    localPasskey: null,
  });
  assertSpanishOnly(html, "Wallet");
});

import { pageHeader, metric, statusPill, emptyState } from "../components.mjs";
import { escapeHtml, money, queryValue, shortHash } from "../format.mjs";

export function createPage() {
  return {
    async load({ store, signal, url }) {
      const data = await store.load("security", "/api/state", { signal });
      const view = queryValue(url, "view", "controls") === "labs" ? "labs" : "controls";
      return { ...data, view };
    },
    render(data) {
      const actions = `<div class="segmented-control"><a href="/security?view=controls" data-link aria-current="${data.view === "controls" ? "true" : "false"}">Controls</a><a href="/security?view=labs" data-link aria-current="${data.view === "labs" ? "true" : "false"}">Labs & roadmap</a></div>`;
      return `<section>
        ${pageHeader({ eyebrow: "Privacy-first payment controls", title: "Security", summary: "Keep authorization bounded and personal data outside public receipts, memos, logs, and payment metadata.", actions })}
        ${data.view === "controls" ? controlsView(data) : labsView(data)}
      </section>`;
    },
    bind() {},
    destroy() {},
  };
}

function controlsView(data) {
  const legal = Object.values(data.evaluations || {}).filter((item) => item.legalDecision?.snapshot);
  return `<div class="metric-grid">${metric("Human confirmation", "Required", "Every real payment")}${metric("Autopilot", "Blocked", "V1 invariant")}${metric("Allowed assets", data.policy.allowedAssets.join(", "), "Policy allowlist")}${metric("Max payment", money(data.policy.perPaymentLimit), "Before category rules")}</div>
    <div class="two-column"><section class="panel"><div class="section-heading"><div><span class="section-label">Public data boundary</span><h2>PII firewall</h2></div>${statusPill("active")}</div><ul class="security-list"><li>RUT and customer identifiers</li><li>Phone, email, and address</li><li>Card and bank credentials</li><li>Private keys and API secrets</li><li>Full XDR and WebAuthn credential IDs</li></ul></section><section class="panel"><div class="section-heading"><div><span class="section-label">Legal Context Protocol</span><h2>Terms evidence</h2></div>${statusPill(legal.length ? "ready" : "pending")}</div><div class="legal-list">${legal.length ? legal.slice(0, 4).map((item) => `<article><strong>Trust level ${escapeHtml(item.legalDecision.trustLevel)}</strong><code>${escapeHtml(shortHash(item.legalDecision.termsHash))}</code><small>${item.legalDecision.acceptanceRequired ? "Explicit acceptance" : "Policy accepted"}</small></article>`).join("") : emptyState("No legal snapshots", "Legal context will appear with evaluated providers.")}</div></section></div>
    <section class="section-block panel"><div class="section-heading"><div><span class="section-label">Privacy architecture</span><h2>Commitments before bill pay</h2></div></div><p class="body-copy">Raw customer references remain outside public state. A commitment and proof must validate account ownership before any future LatAm bill payment can move funds.</p><div class="control-grid"><article><span>Commitment</span><strong>Hash-bound secret reference</strong><code>No raw customer data</code></article><article><span>Proof status</span><strong>Demo only</strong><code>Production circuits deferred</code></article></div></section>`;
}

function labsView(data) {
  const connectors = data.readiness?.connectors || {};
  const experimental = data.intents.filter((intent) => ["buy_crypto", "defi_allocate", "bill_pay"].includes(intent.intentType));
  return `<div class="labs-grid">${labCard("Link Agent Wallet", connectors.linkAgentWallet, "Fiat approval benchmark")}${labCard("Circle x402", connectors.circleX402, "Crypto payment benchmark")}${labCard("Tempo", { status: "benchmark-only" }, "Secondary rail research")}${labCard("DeFindex", connectors.defindex, "Vault integration blocked")}</div>
    <section class="section-block"><div class="section-heading"><div><span class="section-label">Experimental intents</span><h2>Portfolio and IRL roadmap</h2></div></div><div class="provider-grid">${experimental.map((intent) => `<article class="card"><div class="card-heading"><strong>${escapeHtml(intent.providerName)}</strong>${statusPill(intent.status || "guarded")}</div><p>${escapeHtml(intent.intentType)} | ${money(intent.amount, intent.currency)}</p><small>${escapeHtml(intent.privacyRequirement)}</small></article>`).join("")}</div></section>
    <section class="section-block"><div class="section-heading"><div><span class="section-label">LatAm bill pay</span><h2>Blocked until privacy maturity</h2></div></div><div class="foundation-list">${data.roadmapAccounts.map((account) => `<article class="foundation-row"><div><strong>${escapeHtml(account.providerName)}</strong><small>${escapeHtml(account.alias)} | ${escapeHtml(account.country)}</small></div><code>${escapeHtml(shortHash(account.customerRefCommitment))}</code>${statusPill(account.verificationStatus)}</article>`).join("")}</div></section>`;
}

function labCard(title, connector = {}, detail) {
  return `<article class="card"><div class="card-heading"><strong>${escapeHtml(title)}</strong>${statusPill(connector.status || "guarded")}</div><p>${escapeHtml(detail)}</p><small>${escapeHtml(connector.detail || "Research surface only")}</small></article>`;
}
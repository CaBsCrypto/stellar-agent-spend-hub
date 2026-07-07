import { escapeHtml, formatDate, shortHash } from "./format.mjs";

export function pageHeader({ eyebrow, title, summary, actions = "" }) {
  return `<header class="page-header">
    <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1 tabindex="-1">${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

export function statusPill(status = "pending") {
  const label = statusLabel(status);
  const normalized = ["Verified", "Ready", "Reachable", "Active", "Settled", "Connected"].includes(label) ? "verified"
    : ["Blocked", "Unavailable", "Error", "Revoked", "Disabled"].includes(label) ? "blocked"
    : label === "Simulated" ? "simulated" : "pending";
  return `<span class="status-pill ${normalized}">${escapeHtml(label)}</span>`;
}

export function statusLabel(status = "pending") {
  const normalized = String(status || "pending").toLowerCase();
  const labels = {
    active: "Active",
    blocked: "Blocked",
    connected: "Connected",
    created: "Needs approval",
    disabled: "Disabled",
    error: "Error",
    guarded: "Disabled",
    pending: "Pending",
    prepared: "Needs approval",
    preview: "Preview",
    ready: "Ready",
    reachable: "Reachable",
    revoked: "Revoked",
    separate: "Separate",
    settled: "Settled",
    simulated: "Simulated",
    "submit-ready": "Ready",
    testnet: "Testnet",
    unavailable: "Unavailable",
    verified: "Verified",
  };
  return labels[normalized] || String(status);
}

export function actionPanel({ eyebrow, title, body, actions = "", status = "" }) {
  return `<section class="action-panel">
    <div><span class="section-label">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div>
    ${status ? statusPill(status) : ""}
    ${actions ? `<div class="button-row">${actions}</div>` : ""}
  </section>`;
}

export function guardedAction({ label, enabled, reason, action, kind = "primary" }) {
  const className = kind === "danger" ? "danger-button" : kind === "secondary" ? "secondary-button" : "primary-button";
  const actionAttr = action ? `data-${escapeHtml(action.name)}="${escapeHtml(action.value)}"` : "";
  return `<span class="guarded-action"><button class="${className}" ${actionAttr} ${enabled ? "" : "disabled"}>${escapeHtml(label)}</button>${enabled ? "" : `<small>${escapeHtml(reason || "Disabled until the safety gate is open.")}</small>`}</span>`;
}

export function approvalCard({ title, amount, detail, status = "Needs approval", href = "", action = "" }) {
  const content = `<div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div><span><strong>${escapeHtml(amount)}</strong>${statusPill(status)}</span>`;
  if (href) return `<a class="approval-card" href="${escapeHtml(href)}" data-link>${content}</a>`;
  return `<article class="approval-card">${content}${action}</article>`;
}

export function evidenceRow(item = {}) {
  const status = item.verificationStatus || item.status || "pending";
  const hash = item.transactionHash || "";
  return `<article class="evidence-row">
    <div><strong>${escapeHtml(item.label || item.providerName || "Evidence")}</strong><small>${escapeHtml(item.network || "stellar:testnet")} | ${escapeHtml(item.asset || "USDC")}</small></div>
    <strong>${escapeHtml(item.amount || "-")} ${escapeHtml(item.amount ? item.asset || "" : "")}</strong>
    ${hash ? `<code title="${escapeHtml(hash)}">${escapeHtml(shortHash(hash))}</code>` : statusPill(status)}
    ${item.explorerUrl ? `<a class="text-link" href="${escapeHtml(item.explorerUrl)}" target="_blank" rel="noreferrer">Verify</a>` : ""}
  </article>`;
}

export function evidenceCard(title, evidence = {}) {
  const status = evidence.verificationStatus || evidence.status || "pending";
  return `<article class="card evidence-card ${escapeHtml(status)}">
    <div class="card-heading"><span>${escapeHtml(title)}</span>${statusPill(status)}</div>
    <strong class="amount">${escapeHtml(evidence.amount || "0.01")} ${escapeHtml(evidence.asset || "USDC")}</strong>
    <small>${escapeHtml(evidence.network || "stellar:testnet")}</small>
    <code title="${escapeHtml(evidence.transactionHash || "Pending supervised settlement")}">${escapeHtml(shortHash(evidence.transactionHash || "Pending supervised settlement", 12))}</code>
    ${evidence.explorerUrl ? `<a class="text-link" href="${escapeHtml(evidence.explorerUrl)}" target="_blank" rel="noreferrer">Verify transaction</a>` : ""}
  </article>`;
}

export function foundationCard(evidence = {}) {
  return `<article class="foundation-row">
    <div><strong>${escapeHtml(evidence.label)}</strong><small>${escapeHtml(evidence.asset)} | ${formatDate(evidence.verifiedAt)}</small></div>
    <code title="${escapeHtml(evidence.transactionHash)}">${escapeHtml(shortHash(evidence.transactionHash))}</code>
    <a class="text-link" href="${escapeHtml(evidence.explorerUrl)}" target="_blank" rel="noreferrer">Verify</a>
  </article>`;
}

export function lifecycleRow(label, step = {}) {
  const status = step.status || "pending";
  return `<article class="foundation-row">
    <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(status)}</small></div>
    <code title="${escapeHtml(step.transactionHash || "Pending")}">${escapeHtml(shortHash(step.transactionHash || "Pending"))}</code>
    ${step.explorerUrl ? `<a class="text-link" href="${escapeHtml(step.explorerUrl)}" target="_blank" rel="noreferrer">Verify</a>` : statusPill(status)}
  </article>`;
}

export function dependencyStrip(dependencies = {}) {
  return `<div class="dependency-strip" aria-label="Dependency status">
    ${["horizon", "rpc", "upstash"].map((key) => `<span><strong>${escapeHtml(key === "rpc" ? "Soroban RPC" : key[0].toUpperCase() + key.slice(1))}</strong>${statusPill(dependencies[key] || "checking")}</span>`).join("")}
  </div>`;
}

export function metric(label, value, detail = "") {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</article>`;
}

export function emptyState(title, detail) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

export function errorState(error) {
  return `<section class="error-state" role="alert"><strong>Unable to load this view</strong><p>${escapeHtml(error?.message || "Unknown error")}</p><button class="secondary-button" data-action="retry">Retry</button></section>`;
}

export function receiptRow(receipt = {}) {
  const status = receipt.status || receipt.executionStatus || "pending";
  return `<article class="receipt-row">
    <div><strong>${escapeHtml(receipt.provider || receipt.providerId || receipt.action || "Payment receipt")}</strong><small>${escapeHtml(receipt.rail || receipt.network || "Stellar")}</small></div>
    ${statusPill(status)}
    <code title="${escapeHtml(receipt.transactionHash || receipt.id || "Pending")}">${escapeHtml(shortHash(receipt.transactionHash || receipt.id || "Pending"))}</code>
  </article>`;
}

export function trustFlow() {
  return `<ol class="trust-flow" aria-label="Payment trust flow">
    ${["Discover", "Authorize", "Policy", "Settle", "Verify"].map((step, index) => `<li><span>${index + 1}</span><strong>${step}</strong></li>`).join("")}
  </ol>`;
}
import { escapeHtml, formatDate, shortHash } from "./format.mjs";

export function pageHeader({ eyebrow, title, summary, actions = "" }) {
  return `<header class="page-header">
    <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1 tabindex="-1">${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

export function statusPill(status = "pending") {
  const normalized = ["verified", "ready", "reachable", "active"].includes(status) ? "verified"
    : ["blocked", "unavailable", "error"].includes(status) ? "blocked" : "pending";
  return `<span class="status-pill ${normalized}">${escapeHtml(status)}</span>`;
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
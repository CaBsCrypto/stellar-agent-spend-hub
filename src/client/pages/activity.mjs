import { pageHeader, metric, statusPill, emptyState } from "../components.mjs";
import { escapeHtml, formatDate, shortHash } from "../format.mjs";

export function createPage() {
  return {
    async load({ store, signal }) { return store.load("activity", "/api/activity", { signal }); },
    render(data) {
      return `<section>${pageHeader({ eyebrow: "Stellar payment history", title: "Activity", summary: "See what the agent proposed, what you authorized, and what Stellar verified without exposing private payment data." })}<div class="metric-grid">${metric("Verified", data.summary.verified, "On-chain testnet evidence")}${metric("Receipts", data.summary.receipts, "Privacy-safe records")}${metric("Primary asset", "USDC", "Stellar testnet")}${metric("Autopilot", "Off", "Human approval required")}</div><div class="activity-ledger">${data.items.length ? data.items.map(ledgerRow).join("") : emptyState("No activity yet", "Approved payments and verified evidence will appear here.")}</div></section>`;
    },
    bind() {},
    destroy() {},
  };
}
function ledgerRow(item) {
  return `<article class="ledger-row"><div class="ledger-state"><span></span></div><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.kindLabel)} | ${formatDate(item.timestamp)}</small></div><div><strong>${escapeHtml(item.amount || "-")} ${escapeHtml(item.amount ? item.asset : "")}</strong><small>${escapeHtml(item.network)}</small></div>${statusPill(item.status)}<code title="${escapeHtml(item.transactionHash || item.id)}">${escapeHtml(shortHash(item.transactionHash || item.id))}</code>${item.explorerUrl ? `<a class="text-link" href="${escapeHtml(item.explorerUrl)}" target="_blank" rel="noreferrer">Verify</a>` : ""}</article>`;
}
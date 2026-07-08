import { pageHeader, metric, statusPill, emptyState } from "../components.mjs";
import { escapeHtml, formatDate, shortHash, queryValue } from "../format.mjs";

export function createPage() {
  return {
    async load({ store, signal, url }) {
      const [data, feedback] = await Promise.all([
        store.load("activity", "/api/activity", { signal }),
        store.load("feedback-summary", "/api/feedback", { signal, maxAgeMs: 5000 }).catch(() => ({ feedback: { status: "unavailable", count: 0, needsMoreFeedback: true, themes: [] } })),
      ]);
      return { ...data, feedback, highlightId: queryValue(url, "receipt", "") };
    },
    render(data) {
      return `<section>${pageHeader({ eyebrow: "Stellar payment history", title: "Activity", summary: "See what the agent proposed, what testers are telling us, and what Stellar verified without exposing private payment data." })}<div class="metric-grid">${metric("Verified", data.summary.verified, "On-chain testnet evidence")}${metric("Receipts", data.summary.receipts, "Privacy-safe records")}${metric("Pilot feedback", data.feedback?.feedback?.count || 0, feedbackStatus(data.feedback?.feedback))}${metric("Autopilot", "Off", "Human approval required")}</div>${feedbackPanel(data.feedback?.feedback)}<div class="activity-ledger">${data.items.length ? data.items.map((item) => ledgerRow(item, data.highlightId)).join("") : emptyState("No activity yet", "Approved payments and verified evidence will appear here.")}</div></section>`;
    },
    bind(outlet) {
      outlet.querySelector(".ledger-row.highlight")?.scrollIntoView({ block: "center" });
    },
    destroy() {},
  };
}
function feedbackPanel(feedback = {}) {
  const themes = Array.isArray(feedback.themes) ? feedback.themes : [];
  const clarity = dominantLabel(feedback.clarity);
  const trust = dominantLabel(feedback.trust);
  return `<section class="pilot-learning" aria-labelledby="pilot-learning-title"><div><span class="section-label">Pilot learning</span><h2 id="pilot-learning-title">What early testers are telling us</h2><p>${feedback.needsMoreFeedback ? "We still need more sessions before treating this as signal." : "Enough sessions are coming in to identify repeated patterns."}</p></div><div class="learning-facts"><article><span>Clarity</span><strong>${escapeHtml(clarity)}</strong></article><article><span>Trust</span><strong>${escapeHtml(trust)}</strong></article><article><span>Store</span><strong>${escapeHtml(feedback.status || "pending")}</strong></article></div><div class="theme-list">${themes.length ? themes.map((item) => `<span>${escapeHtml(item.theme)} <b>${escapeHtml(item.count)}</b></span>`).join("") : `<span>No repeated themes yet</span>`}</div></section>`;
}

function feedbackStatus(feedback = {}) {
  if (!feedback.count) return "Need 5-10 sessions";
  if (feedback.needsMoreFeedback) return "Collecting first signal";
  return "Ready to review";
}

function dominantLabel(counts = {}) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0]?.[0] || "pending";
}

function ledgerRow(item, highlightId = "") {
  return `<article class="ledger-row${highlightId && item.id === highlightId ? " highlight" : ""}"><div class="ledger-state"><span></span></div><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.kindLabel)} | ${formatDate(item.timestamp)}</small></div><div><strong>${escapeHtml(item.amount || "-")} ${escapeHtml(item.amount ? item.asset : "")}</strong><small>${escapeHtml(item.network)}</small></div>${statusPill(item.status)}<code title="${escapeHtml(item.transactionHash || item.id)}">${escapeHtml(shortHash(item.transactionHash || item.id))}</code>${item.explorerUrl ? `<a class="text-link" href="${escapeHtml(item.explorerUrl)}" target="_blank" rel="noreferrer">Verify</a>` : ""}</article>`;
}
import { pageHeader, metric, statusPill, receiptRow, emptyState } from "../components.mjs";
import { escapeHtml, money, queryValue, shortHash } from "../format.mjs";

export function createPage() {
  let clickHandler;
  let boundOutlet;
  return {
    async load({ store, signal, url }) {
      const data = await store.load("spend", "/api/spend", { signal });
      const requestedId = queryValue(url, "intent", data.intents[0]?.id || "");
      const selected = data.intents.find((intent) => intent.id === requestedId) || data.intents[0] || null;
      return { ...data, selected, evaluation: selected ? data.evaluations[selected.id] : null };
    },
    render(data) {
      const { selected, evaluation, summary } = data;
      return `<section>
        ${pageHeader({ eyebrow: "User-controlled spending", title: "Agent Spend", summary: "Review proposed payments, privacy evidence, policy decisions, and receipts before settlement." })}
        <div class="metric-grid">${metric("Ready intents", summary.ready, `${summary.blocked} blocked`)}${metric("Receipts", summary.receipts, "Sanitized history")}${metric("Per-payment limit", money(data.policy.perPaymentLimit), "Policy enforced")}${metric("Human approval", data.policy.requireHumanConfirmation ? "Required" : "Disabled", "Training mode")}</div>
        <div class="spend-layout">
          <aside class="panel intent-panel"><div class="section-heading"><div><span class="section-label">Queue</span><h2>Payment intents</h2></div></div><div class="intent-list">${data.intents.length ? data.intents.map((intent) => intentLink(intent, data.evaluations[intent.id], selected?.id)).join("") : emptyState("No intents", "Create one from the Providers route.")}</div></aside>
          <section class="panel review-panel">${selected ? reviewIntent(selected, evaluation, data.spendRequests?.[selected.id]) : emptyState("Select an intent", "Choose a proposed payment to inspect its controls.")}</section>
          <aside class="panel policy-panel"><div class="section-heading"><div><span class="section-label">Policy</span><h2>Active controls</h2></div></div>${policyRow("Daily limit", money(data.policy.dailyLimit))}${policyRow("Monthly limit", money(data.policy.monthlyLimit))}${policyRow("Assets", data.policy.allowedAssets.join(", "))}${policyRow("Slippage", `${data.policy.maxSlippageBps} bps`)}${policyRow("Autopilot", data.policy.autopilotEnabled ? "Enabled" : "Blocked")}<div class="security-callout"><strong>PII firewall</strong><p>Personal identifiers, credentials, and customer references are forbidden in public payment data.</p></div></aside>
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Audit trail</span><h2>Payment receipts</h2></div></div><div class="receipt-list">${data.receipts.length ? data.receipts.map(receiptRow).join("") : emptyState("No receipts", "Confirmed payments will appear here without private data.")}</div></section>
      </section>`;
    },
    bind(outlet, data, context) {
      clickHandler = async (event) => {
        const actionButton = event.target.closest("[data-intent-action]");
        if (!actionButton || !data.selected) return;
        actionButton.disabled = true;
        const action = actionButton.dataset.intentAction;
        const id = encodeURIComponent(data.selected.id);
        try {
          if (action === "prepare") {
            await context.api(`/api/intents/${id}/prepare`, { method: "POST", body: "{}" });
            context.showToast("Intent prepared for confirmation.");
          }
          if (action === "proof") {
            await context.api(`/api/intents/${id}/proof`, {
              method: "POST",
              body: JSON.stringify({ secretRef: `secret:${data.selected.id}`, salt: "demo-salt" }),
            });
            context.showToast("Privacy proof generated without revealing the customer reference.");
          }
          if (action === "approve") {
            await context.api(`/api/intents/${id}/approve`, {
              method: "POST",
              body: JSON.stringify({ approvedBy: "user-passkey" }),
            });
            context.showToast("Payment confirmed and receipt sanitized.");
          }
          context.store.invalidate("spend", "overview:live");
          await context.router.refresh();
        } catch (error) {
          context.showToast(error.message);
          actionButton.disabled = false;
        }
      };
      boundOutlet = outlet;
      outlet.addEventListener("click", clickHandler);
    },
    destroy() {
      if (boundOutlet && clickHandler) boundOutlet.removeEventListener("click", clickHandler);
    },
  };
}

function intentLink(intent, evaluation = {}, selectedId) {
  return `<a class="intent-item ${intent.id === selectedId ? "selected" : ""}" href="/spend?intent=${encodeURIComponent(intent.id)}" data-link><div><strong>${escapeHtml(intent.providerName)}</strong>${statusPill(evaluation.allowed ? "ready" : "blocked")}</div><span>${escapeHtml(intent.intentType)} | ${money(intent.amount, intent.currency)}</span><small>Proof ${escapeHtml(intent.proofStatus || "not-required")} | ${escapeHtml(intent.status || "created")}</small></a>`;
}

function reviewIntent(intent, evaluation = {}, spendRequest) {
  const reasons = evaluation.allowed ? evaluation.evidence || [] : evaluation.reasons || [];
  return `<div class="section-heading"><div><span class="section-label">Selected intent</span><h2>${escapeHtml(intent.providerName)}</h2></div>${statusPill(evaluation.allowed ? "ready" : "blocked")}</div>
    <div class="review-amount"><strong>${money(intent.amount, intent.currency)}</strong><span>${escapeHtml(intent.intentType)} | ${escapeHtml(intent.status || "created")}</span></div>
    <div class="detail-block"><span>Agent rationale</span><p>${escapeHtml(intent.agentReason)}</p></div>
    <div class="control-grid"><article><span>Legal context</span><strong>${evaluation.legalDecision?.snapshot ? `Trust level ${escapeHtml(evaluation.legalDecision.trustLevel)}` : "Unavailable"}</strong><code>${escapeHtml(shortHash(evaluation.legalDecision?.termsHash))}</code></article><article><span>Privacy proof</span><strong>${escapeHtml(evaluation.privacyDecision?.privacyLevel || intent.privacyRequirement)}</strong><code>${escapeHtml(shortHash(evaluation.privacyDecision?.proofHash || evaluation.privacyDecision?.commitment))}</code></article></div>
    ${spendRequest ? `<div class="notice verified"><strong>Link spend request</strong><span>${escapeHtml(spendRequest.status)}</span><code>${escapeHtml(shortHash(spendRequest.id))}</code></div>` : ""}
    <div class="check-list">${reasons.map((reason) => `<div><span>${evaluation.allowed ? "OK" : "!"}</span><p>${escapeHtml(reason)}</p></div>`).join("")}</div>
    <div class="button-row"><button class="secondary-button" data-intent-action="prepare">Prepare</button><button class="secondary-button" data-intent-action="proof" ${intent.proofRequired ? "" : "disabled"}>Generate proof</button><button class="primary-button" data-intent-action="approve" ${evaluation.allowed ? "" : "disabled"}>Confirm payment</button></div>`;
}

function policyRow(label, value) {
  return `<div class="policy-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
import { pageHeader, metric, statusPill, receiptRow, emptyState } from "../components.mjs";
import { escapeHtml, money, queryValue, shortHash } from "../format.mjs";

export function createPage() {
  let clickHandler;
  let boundOutlet;
  return {
    async load({ store, signal, url }) {
      const pilotId = queryValue(url, "pilot", "");
      if (pilotId) {
        const payload = await store.load(`pilot:${pilotId}`, `/api/pilot/requests/${encodeURIComponent(pilotId)}`, { signal, maxAgeMs: 0 });
        return { pilotMode: true, pilot: payload.request };
      }
      const data = await store.load("spend", "/api/spend", { signal });
      const requestedId = queryValue(url, "intent", data.intents[0]?.id || "");
      const selected = data.intents.find((intent) => intent.id === requestedId) || data.intents[0] || null;
      return { ...data, selected, evaluation: selected ? data.evaluations[selected.id] : null };
    },
    render(data) {
      if (data.pilotMode) return renderPilotApproval(data.pilot);
      const { selected, evaluation, summary } = data;
      return `<section>
        ${pageHeader({ eyebrow: "User-controlled spending", title: "Approvals", summary: "Review what the agent prepared, then authorize or reject each payment." })}
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
        const pilotButton = event.target.closest("[data-pilot-approve]");
        if (pilotButton && data.pilotMode) {
          pilotButton.disabled = true;
          try {
            const approvalToken = new URLSearchParams(window.location.hash.slice(1)).get("approval");
            if (!approvalToken) throw new Error("This approval link is missing its one-time token.");
            await context.api(`/api/pilot/requests/${encodeURIComponent(data.pilot.requestId)}/approve`, {
              method: "POST",
              body: JSON.stringify({ approvalToken }),
            });
            history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
            context.store.invalidate(`pilot:${data.pilot.requestId}`);
            context.showToast("Pilot payment approved. The local buyer may now claim it.");
            await context.router.refresh();
          } catch (error) {
            context.showToast(error.message);
            pilotButton.disabled = false;
          }
          return;
        }
        const actionButton = event.target.closest("[data-intent-action]");
        if (!actionButton || !data.selected) return;
        actionButton.disabled = true;
        actionButton.textContent = "Approving...";
        const id = encodeURIComponent(data.selected.id);
        try {
          // The agent runs the technical steps; the human performs one approval.
          await context.api(`/api/intents/${id}/prepare`, { method: "POST", body: "{}" });
          if (data.selected.proofRequired && data.selected.proofStatus !== "valid") {
            await context.api(`/api/intents/${id}/proof`, {
              method: "POST",
              body: JSON.stringify({ secretRef: `secret:${data.selected.id}`, salt: "demo-salt" }),
            });
          }
          const result = await context.api(`/api/intents/${id}/approve`, {
            method: "POST",
            body: JSON.stringify({ approvedBy: "user-passkey" }),
          });
          context.store.invalidate("spend", "overview:live", "activity", "agent-home");
          context.showToast("Payment approved. Receipt sanitized and recorded.");
          await context.router.navigate(`/activity?receipt=${encodeURIComponent(result.receipt?.id || "")}`);
        } catch (error) {
          context.showToast(error.message);
          actionButton.disabled = false;
          actionButton.textContent = "Approve payment";
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

function renderPilotApproval(request) {
  const canApprove = request.status === "prepared";
  return `<section>
    ${pageHeader({ eyebrow: "Remote MCP Provider Pilot", title: "Human Approval", summary: "Review the immutable Merchant Lab payment proposal before the local buyer can claim it." })}
    <div class="metric-grid">${metric("Amount", `${escapeHtml(request.amount)} ${escapeHtml(request.asset)}`, "Exact pilot price")}${metric("Network", request.network, "Testnet only")}${metric("Status", request.status, "One-time approval")}${metric("Provider", request.providerName, "Allowlisted")}</div>
    <section class="panel review-panel">
      <div class="section-heading"><div><span class="section-label">Payment proposal</span><h2>${escapeHtml(request.resourceId)}</h2></div>${statusPill(request.status)}</div>
      <dl class="definition-list">
        <div><dt>Recipient</dt><dd><code>${escapeHtml(request.recipient)}</code></dd></div>
        <div><dt>Asset contract</dt><dd><code>${escapeHtml(request.assetContractId)}</code></dd></div>
        <div><dt>Request</dt><dd><code>${escapeHtml(request.requestId)}</code></dd></div>
      </dl>
      <div class="security-callout"><strong>Human boundary</strong><p>Approval changes only the request state. The browser never receives the buyer secret and cannot settle funds.</p></div>
      <div class="button-row"><button class="primary-button" data-pilot-approve ${canApprove ? "" : "disabled"}>Approve 0.01 USDC</button></div>
    </section>
  </section>`;
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
    <div class="button-row"><button class="primary-button" data-intent-action="approve" ${evaluation.allowed ? "" : "disabled"}>Approve payment</button>${evaluation.allowed ? "" : '<small class="blocked-note">Blocked by policy - see the checks above.</small>'}</div>`;
}

function policyRow(label, value) {
  return `<div class="policy-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
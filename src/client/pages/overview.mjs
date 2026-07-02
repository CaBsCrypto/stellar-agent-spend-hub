import { pageHeader, metric, statusPill, emptyState } from "../components.mjs";
import { escapeHtml, money, shortHash } from "../format.mjs";

export function createPage() {
  let boundOutlet;
  let submitHandler;
  let clickHandler;
  return {
    async load({ store, signal }) {
      return store.load("agent-home", "/api/home", { signal });
    },
    render(data) {
      return `<section class="agent-home">
        ${pageHeader({
          eyebrow: "Stellar-native spending agent",
          title: "What should your agent handle?",
          summary: "Describe a digital service you need. The agent finds a Stellar provider, checks your policy, and prepares a USDC payment for your approval.",
          actions: '<a class="secondary-button" href="/wallet" data-link>Review wallet controls</a>',
        })}
        <section class="agent-command" aria-labelledby="agent-command-title">
          <div class="agent-presence"><span class="agent-status-dot" aria-hidden="true"></span><div><strong id="agent-command-title">Spend Agent</strong><small>Supervised | Stellar testnet | USDC</small></div></div>
          <form data-agent-command><label for="agent-request">Ask for a service</label><div class="agent-command-row"><input id="agent-request" name="request" autocomplete="off" maxlength="120" placeholder="Find an API to research a Stellar transaction" required /><button class="primary-button" type="submit">Find services</button></div></form>
          <div class="prompt-suggestions" aria-label="Suggested requests">${["Search the web for my agent", "Analyze a Stellar transaction", "Buy browser sessions"].map((prompt) => `<button type="button" data-agent-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}</div>
        </section>
        <div class="metric-grid home-metrics">
          ${metric("Agent mode", data.agent.mode, "Every payment needs approval")}
          ${metric("Ready proposals", data.summary.ready, `${data.summary.blocked} blocked by policy`)}
          ${metric("Verified payments", data.summary.verifiedPayments, "Public Stellar evidence")}
          ${metric("Spend limit", money(data.policy.perPaymentLimit), "Per payment")}
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Recommended now</span><h2>Services your agent can use</h2></div><a class="text-link" href="/discover" data-link>Browse all services</a></div><div class="recommendation-grid">${data.recommendations.length ? data.recommendations.map(recommendationCard).join("") : emptyState("No recommendations", "Provider discovery is temporarily unavailable.")}</div></section>
        <section class="home-workbench section-block">
          <div><div class="section-heading"><div><span class="section-label">Awaiting you</span><h2>Payment proposals</h2></div><a class="text-link" href="/spend" data-link>Open queue</a></div><div class="proposal-list">${data.proposals.length ? data.proposals.map(proposalRow).join("") : emptyState("Queue clear", "New proposals will wait here for your approval.")}</div></div>
          <aside class="agent-boundary"><span class="section-label">Your control boundary</span><h2>The agent prepares. You authorize.</h2><ol><li><span>1</span><p><strong>Discover</strong> a priced Stellar service.</p></li><li><span>2</span><p><strong>Check</strong> provider, privacy, and budget policy.</p></li><li><span>3</span><p><strong>Confirm</strong> before USDC can move.</p></li></ol><a class="text-link" href="/evidence" data-link>See verified settlements</a></aside>
        </section>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Recent activity</span><h2>Verifiable, privacy-safe receipts</h2></div><a class="text-link" href="/activity" data-link>View activity</a></div><div class="activity-preview">${data.recentActivity.map(activityRow).join("")}</div></section>
      </section>`;
    },
    bind(outlet, data, context) {
      submitHandler = (event) => {
        const form = event.target.closest("[data-agent-command]");
        if (!form) return;
        event.preventDefault();
        const request = new FormData(form).get("request")?.toString().trim();
        if (request) context.router.navigate(`/discover?q=${encodeURIComponent(request)}`);
      };
      clickHandler = async (event) => {
        const prompt = event.target.closest("[data-agent-prompt]");
        if (prompt) {
          const input = outlet.querySelector("#agent-request");
          if (input) { input.value = prompt.dataset.agentPrompt; input.focus(); }
          return;
        }
        const button = event.target.closest("[data-home-intent]");
        if (!button) return;
        button.disabled = true;
        try {
          const provider = data.recommendations.find((item) => item.providerId === button.dataset.homeIntent);
          const result = await context.api("/api/intents", { method: "POST", body: JSON.stringify({ providerId: provider.providerId, intentType: provider.category }) });
          context.store.invalidate("spend", "agent-home");
          context.showToast("Proposal created. Review it before payment.");
          await context.router.navigate(`/spend?intent=${encodeURIComponent(result.intent.id)}`);
        } catch (error) { context.showToast(error.message); button.disabled = false; }
      };
      boundOutlet = outlet;
      outlet.addEventListener("submit", submitHandler);
      outlet.addEventListener("click", clickHandler);
    },
    destroy() {
      if (boundOutlet && submitHandler) boundOutlet.removeEventListener("submit", submitHandler);
      if (boundOutlet && clickHandler) boundOutlet.removeEventListener("click", clickHandler);
    },
  };
}

function recommendationCard(provider) {
  return `<article class="card recommendation-card"><div class="card-heading"><span class="provider-kind">${escapeHtml(provider.categoryLabel)}</span>${statusPill(provider.status)}</div><div><h3>${escapeHtml(provider.name)}</h3><p>${escapeHtml(provider.description)}</p></div><dl><div><dt>Rail</dt><dd>Stellar</dd></div><div><dt>Asset</dt><dd>USDC</dd></div></dl><button class="secondary-button" data-home-intent="${escapeHtml(provider.providerId)}">Prepare proposal</button></article>`;
}
function proposalRow(proposal) {
  return `<a class="proposal-row" href="/spend?intent=${encodeURIComponent(proposal.id)}" data-link><div><strong>${escapeHtml(proposal.providerName)}</strong><small>${escapeHtml(proposal.agentReason)}</small></div><span><strong>${money(proposal.amount, proposal.currency)}</strong>${statusPill(proposal.status)}</span></a>`;
}
function activityRow(item) {
  return `<article class="activity-row"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.network)} | ${escapeHtml(item.asset)}</small></div><strong>${escapeHtml(item.amount || "-")} ${escapeHtml(item.amount ? item.asset : "")}</strong><code>${escapeHtml(shortHash(item.transactionHash || item.id))}</code>${item.explorerUrl ? `<a class="text-link" href="${escapeHtml(item.explorerUrl)}" target="_blank" rel="noreferrer">Verify</a>` : statusPill(item.status)}</article>`;
}
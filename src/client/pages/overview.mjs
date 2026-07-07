import { pageHeader, statusPill, emptyState } from "../components.mjs";
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
          <p class="agent-boundary-note">The agent discovers, checks policy, and prepares. You authorize every payment.</p>
          <div class="agent-steps" data-agent-steps hidden aria-live="polite"></div>
        </section>
        <p class="agent-statusline">${escapeHtml(data.agent.mode)} mode · ${escapeHtml(String(data.summary.ready))} ${data.summary.ready === 1 ? "proposal" : "proposals"} ready · ${escapeHtml(String(data.summary.verifiedPayments))} verified payments · ${escapeHtml(money(data.policy.perPaymentLimit))} per payment · <a class="text-link" href="/discover" data-link>Browse services</a></p>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Awaiting you</span><h2>Payment proposals</h2></div><a class="text-link" href="/spend" data-link>Open queue</a></div><div class="proposal-list">${data.proposals.length ? data.proposals.map(proposalRow).join("") : emptyState("Queue clear", "Ask for a service above and the agent will prepare a proposal for your approval.")}</div></section>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Recent activity</span><h2>Verifiable, privacy-safe receipts</h2></div><a class="text-link" href="/activity" data-link>View activity</a></div><div class="activity-preview">${data.recentActivity.map(activityRow).join("")}</div></section>
      </section>`;
    },
    bind(outlet, data, context) {
      submitHandler = (event) => {
        const form = event.target.closest("[data-agent-command]");
        if (!form) return;
        event.preventDefault();
        const request = new FormData(form).get("request")?.toString().trim();
        if (request) runAgent(request, outlet, context);
      };
      clickHandler = (event) => {
        const prompt = event.target.closest("[data-agent-prompt]");
        if (!prompt) return;
        const input = outlet.querySelector("#agent-request");
        if (input) { input.value = prompt.dataset.agentPrompt; input.focus(); }
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

async function runAgent(request, outlet, context) {
  const stepsEl = outlet.querySelector("[data-agent-steps]");
  if (!stepsEl) return;
  const steps = [];
  const paint = () => { stepsEl.hidden = false; stepsEl.innerHTML = steps.map((step) => `<div class="agent-step ${step.state}"><span aria-hidden="true"></span><div>${step.html}</div></div>`).join(""); };
  const setLast = (state, html) => { steps[steps.length - 1] = { state, html }; paint(); };
  steps.push({ state: "active", html: `Searching Stellar services for "${escapeHtml(request)}"...` });
  paint();
  try {
    const payload = await context.api(`/api/providers?q=${encodeURIComponent(request)}`);
    const provider = (payload.providers || []).find((item) =>
      (item.paymentMethod?.includes("stellar") || item.providerId === "stellar-agent-merchant-lab")
      && !["buy_crypto", "defi_allocate", "bill_pay"].includes(item.category));
    if (!provider) {
      setLast("error", `No Stellar service matched that request. <a class="text-link" href="/discover" data-link>Browse the directory</a> or try describing the outcome.`);
      return;
    }
    setLast("done", `Found <strong>${escapeHtml(provider.name)}</strong> - ${escapeHtml(provider.description || "priced Stellar service")}`);
    steps.push({ state: "active", html: "Checking policy and preparing a USDC proposal..." });
    paint();
    const result = await context.api("/api/intents", { method: "POST", body: JSON.stringify({ providerId: provider.providerId, intentType: provider.category }) });
    context.store.invalidate("spend", "agent-home");
    setLast("done", "Policy checks passed. Proposal prepared.");
    steps.push({ state: "ready", html: `Waiting for you: <strong>${escapeHtml(money(result.intent.amount, result.intent.currency))}</strong> to ${escapeHtml(provider.name)} <a class="primary-button agent-step-cta" href="/spend?intent=${encodeURIComponent(result.intent.id)}" data-link>Review &amp; approve</a>` });
    paint();
  } catch (error) {
    setLast("error", escapeHtml(error.message || "The agent could not complete this request."));
  }
}

function proposalRow(proposal) {
  return `<a class="proposal-row" href="/spend?intent=${encodeURIComponent(proposal.id)}" data-link><div><strong>${escapeHtml(proposal.providerName)}</strong><small>${escapeHtml(proposal.agentReason)}</small></div><span><strong>${money(proposal.amount, proposal.currency)}</strong>${statusPill(proposal.status)}</span></a>`;
}
function activityRow(item) {
  return `<article class="activity-row"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.network)} | ${escapeHtml(item.asset)}</small></div><strong>${escapeHtml(item.amount || "-")} ${escapeHtml(item.amount ? item.asset : "")}</strong><code>${escapeHtml(shortHash(item.transactionHash || item.id))}</code>${item.explorerUrl ? `<a class="text-link" href="${escapeHtml(item.explorerUrl)}" target="_blank" rel="noreferrer">Verify</a>` : statusPill(item.status)}</article>`;
}
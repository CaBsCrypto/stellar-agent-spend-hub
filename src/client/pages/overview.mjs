import { pageHeader, emptyState, actionPanel, approvalCard, evidenceRow } from "../components.mjs";
import { escapeHtml, money } from "../format.mjs";

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
          title: "Your agent prepares Stellar USDC payments. You approve every settlement.",
          summary: "Ask for a digital service, review the proposal, and verify every receipt without exposing private payment data.",
          actions: '<a class="secondary-button" href="/wallet" data-link>Wallet controls</a>',
        })}
        <section class="agent-command" aria-labelledby="agent-command-title">
          <div class="agent-presence"><span class="agent-status-dot" aria-hidden="true"></span><div><strong id="agent-command-title">Spend Agent</strong><small>Supervised | Stellar testnet | USDC</small></div></div>
          <form data-agent-command><label for="agent-request">Ask for a service</label><div class="agent-command-row"><input id="agent-request" name="request" autocomplete="off" maxlength="120" placeholder="Find an API to research a Stellar transaction" required /><button class="primary-button" type="submit">Find services</button></div></form>
          <div class="service-options" aria-label="Suggested service requests">${SERVICE_GROUPS.map(serviceGroup).join("")}</div>
          <p class="agent-boundary-note">Pick an option or write your own request. The agent discovers and prepares; you stay in control of every payment.</p>
          <div class="agent-steps" data-agent-steps hidden aria-live="polite"></div>
        </section>
        <section class="pilot-tasks" aria-labelledby="pilot-tasks-title"><div><span class="section-label">Pilot test</span><h2 id="pilot-tasks-title">Try three things in two minutes</h2></div>${pilotTask("1", "Ask the agent for a digital service", "Use one suggested prompt or describe a paid API task.")}${pilotTask("2", "Review the prepared payment", "Open Approve and check policy, reason, amount and privacy proof.")}${pilotTask("3", "Verify evidence, then leave feedback", "Open Activity or Evidence, then tell us what was clear or confusing.")}</section>
        <div class="home-snapshot">
          ${actionPanel({ eyebrow: "Mode", title: `${data.agent.mode} supervision`, body: `${data.summary.ready} ${data.summary.ready === 1 ? "proposal" : "proposals"} ready, ${data.summary.verifiedPayments} verified payments, ${money(data.policy.perPaymentLimit)} per payment.`, actions: '<a class="text-link" href="/discover" data-link>Browse services</a>', status: "ready" })}
          ${actionPanel({ eyebrow: "Control", title: "Human approval stays on", body: "Autopilot is blocked in this demo. The browser cannot move funds without a supervised approval path.", actions: '<a class="text-link" href="/security" data-link>Review safeguards</a>', status: "disabled" })}
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Awaiting you</span><h2>Payment proposals</h2></div><a class="text-link" href="/spend" data-link>Open queue</a></div><div class="proposal-list">${data.proposals.length ? data.proposals.map(proposalRow).join("") : emptyState("Queue clear", "Ask for a service above and the agent will prepare a proposal for your approval.")}</div></section>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Recent activity</span><h2>Verifiable, privacy-safe receipts</h2></div><a class="text-link" href="/activity" data-link>View activity</a></div><div class="activity-preview">${data.recentActivity.length ? data.recentActivity.map(evidenceRow).join("") : emptyState("No verified activity", "Settled payments will appear here with public hashes only.")}</div></section>
        <section class="section-block feedback-panel"><div class="section-heading"><div><span class="section-label">Feedback loop</span><h2>What should we fix before pilots?</h2></div></div><form data-feedback-form><div class="feedback-grid"><label>Role<select name="role"><option value="builder">Builder</option><option value="founder">Founder</option><option value="provider">Provider</option><option value="investor">Investor</option><option value="stellar">Stellar ecosystem</option><option value="other">Other</option></select></label><label>Was it clear?<select name="clarity"><option value="clear">Clear</option><option value="somewhat-clear">Somewhat clear</option><option value="confusing">Confusing</option></select></label><label>Would you trust this flow?<select name="trust"><option value="somewhat-clear">Maybe, with polish</option><option value="clear">Yes</option><option value="confusing">Not yet</option></select></label></div><label>Most confusing part<textarea name="confusing" maxlength="700" placeholder="No emails, phone numbers, account IDs or secrets."></textarea></label><label>Most useful next improvement<textarea name="next" maxlength="700" placeholder="Example: clearer wallet status, better demo script, provider onboarding..."></textarea></label><button class="primary-button" type="submit">Send feedback</button><p class="feedback-note">Anonymous and privacy-filtered. Please do not include personal data or secrets.</p></form></section>
      </section>`;
    },
    bind(outlet, data, context) {
      submitHandler = async (event) => {
        const feedbackForm = event.target.closest("[data-feedback-form]");
        if (feedbackForm) {
          event.preventDefault();
          await sendFeedback(feedbackForm, context);
          return;
        }
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

const SERVICE_GROUPS = [
  {
    label: "Research",
    prompts: [
      "Analyze a Stellar transaction",
      "Buy a market dataset snapshot",
      "Search the web for my agent",
    ],
  },
  {
    label: "Web and data",
    prompts: [
      "Extract a website into clean markdown",
      "Buy browser sessions",
      "Get a JSON data enrichment sample",
    ],
  },
  {
    label: "MCP and devtools",
    prompts: [
      "Start a temporary MCP sandbox",
      "Buy cloud API credits",
      "Prepare a paid developer API call",
    ],
  },
  {
    label: "Media",
    prompts: [
      "Generate a short voice preview",
      "Render a social image card",
      "Create a demo asset preview",
    ],
  },
];

function serviceGroup(group) {
  return `<article><span>${escapeHtml(group.label)}</span><div>${group.prompts.map((prompt) => `<button type="button" data-agent-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}</div></article>`;
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

async function sendFeedback(form, context) {
  const button = form.querySelector("button[type='submit']");
  if (button) button.disabled = true;
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    body.page = window.location.pathname;
    await context.api("/api/feedback", { method: "POST", body: JSON.stringify(body) });
    form.reset();
    context.showToast("Feedback received. Thank you - no payment was made.");
  } catch (error) {
    context.showToast(error.message || "Feedback could not be sent.");
  } finally {
    if (button) button.disabled = false;
  }
}

function pilotTask(number, title, detail) {
  return `<article><span>${escapeHtml(number)}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></article>`;
}

function proposalRow(proposal) {
  return approvalCard({
    title: proposal.providerName,
    detail: proposal.agentReason,
    amount: money(proposal.amount, proposal.currency),
    status: proposal.status || "Needs approval",
    href: `/spend?intent=${encodeURIComponent(proposal.id)}`,
  });
}

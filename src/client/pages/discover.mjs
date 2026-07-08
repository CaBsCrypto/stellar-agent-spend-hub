import { pageHeader, emptyState, statusPill } from "../components.mjs";
import { escapeHtml, queryValue } from "../format.mjs";

export function createPage() {
  let boundOutlet;
  let submitHandler;
  let clickHandler;
  return {
    async load({ store, api, signal, url }) {
      const query = queryValue(url, "q", "");
      const payload = query ? await api(`/api/providers?q=${encodeURIComponent(query)}`, { signal }) : await store.load("providers", "/api/providers", { signal });
      return { query, providers: (payload.providers || []).filter(isStellarProvider) };
    },
    render({ query, providers }) {
      return `<section>${pageHeader({ eyebrow: "Stellar service directory", title: "Discover services", summary: "Find APIs and agent tools that can be prepared for supervised payment in USDC on Stellar." })}<form class="discover-search" data-discover-search><label for="discover-query">What does your agent need?</label><div><input id="discover-query" name="q" value="${escapeHtml(query)}" placeholder="Search, browser sessions, transaction analysis..." /><button class="primary-button" type="submit">Search</button></div></form><div class="discover-prompts" aria-label="Example searches">${DISCOVER_PROMPTS.map((prompt) => `<a href="/discover?q=${encodeURIComponent(prompt.query)}" data-link>${escapeHtml(prompt.label)}</a>`).join("")}</div><div class="discovery-context"><span>Stellar testnet</span><span>USDC</span><span>Human approval</span><span>No PII in receipts</span></div><div class="provider-grid discover-grid">${providers.length ? providers.map(providerCard).join("") : emptyState("No Stellar service found", "Try describing the outcome rather than a provider name.")}</div></section>`;
    },
    bind(outlet, data, context) {
      submitHandler = (event) => {
        const form = event.target.closest("[data-discover-search]");
        if (!form) return;
        event.preventDefault();
        const query = new FormData(form).get("q")?.toString().trim() || "";
        context.router.navigate(query ? `/discover?q=${encodeURIComponent(query)}` : "/discover");
      };
      clickHandler = async (event) => {
        const button = event.target.closest("[data-create-intent]");
        if (!button) return;
        button.disabled = true;
        try {
          const provider = data.providers.find((item) => item.providerId === button.dataset.createIntent);
          const result = await context.api("/api/intents", { method: "POST", body: JSON.stringify({ providerId: provider.providerId, intentType: provider.category }) });
          context.store.invalidate("spend", "agent-home");
          context.showToast("Proposal created for human review.");
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
const DISCOVER_PROMPTS = [
  { label: "Transaction risk", query: "analyze stellar transaction" },
  { label: "Web extraction", query: "extract website markdown" },
  { label: "Market dataset", query: "dataset snapshot" },
  { label: "MCP sandbox", query: "temporary MCP sandbox" },
  { label: "Cloud credits", query: "cloud API credits" },
  { label: "Media preview", query: "voice preview" },
];

function isStellarProvider(provider) {
  const stellar = provider.paymentMethod?.includes("stellar") || provider.providerId === "stellar-agent-merchant-lab";
  return stellar && !["buy_crypto", "defi_allocate", "bill_pay"].includes(provider.category);
}
function providerCard(provider) {
  const live = provider.paymentMethod === "stellar-mpp-usdc";
  return `<article class="card provider-card discover-card"><div class="card-heading"><span class="provider-kind">API / MCP</span>${statusPill(live ? "pilot-ready" : "sandbox")}</div><div><h2>${escapeHtml(provider.name)}</h2><p>${escapeHtml(provider.description)}</p></div><button class="secondary-button" data-create-intent="${escapeHtml(provider.providerId)}">Prepare payment</button></article>`;
}
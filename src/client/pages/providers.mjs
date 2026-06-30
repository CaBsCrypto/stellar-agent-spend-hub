import { pageHeader, emptyState, statusPill } from "../components.mjs";
import { escapeHtml, queryValue } from "../format.mjs";

export function createPage() {
  let onClick;
  let onSubmit;
  let boundOutlet;
  return {
    async load({ store, api, signal, url }) {
      const query = queryValue(url, "q", "");
      const [directory, kit] = await Promise.all([
        query
          ? api(`/api/providers?q=${encodeURIComponent(query)}`, { signal })
          : store.load("providers", "/api/providers", { signal }),
        store.load("provider-kit", "/api/provider-kit/definition", { signal }),
      ]);
      return { providers: directory.providers || [], providerKit: kit.provider, query };
    },
    render({ providers, providerKit, query }) {
      return `<section>
        ${pageHeader({ eyebrow: "Machine-readable commerce", title: "Providers", summary: "Discover priced services, inspect their privacy requirements, and create a bounded payment intent." })}
        <form class="search-bar" data-provider-search><label><span class="sr-only">Search providers</span><input name="q" value="${escapeHtml(query)}" placeholder="Search MCP, APIs, digital services" /></label><button class="secondary-button" type="submit">Search</button></form>
        <div class="provider-grid">${providers.length ? providers.map(providerCard).join("") : emptyState("No providers found", "Try a broader query.")}</div>
        <section class="section-block panel"><div class="section-heading"><div><span class="section-label">Provider Kit V1</span><h2>Monetize a Node or MCP API</h2></div>${statusPill("ready")}</div><dl class="definition-list"><div><dt>Provider ID</dt><dd>${escapeHtml(providerKit.providerId)}</dd></div><div><dt>Endpoint</dt><dd><code>${escapeHtml(providerKit.endpoint)}</code></dd></div><div><dt>Maximum price</dt><dd>${escapeHtml(providerKit.maxPrice)} ${escapeHtml(providerKit.asset)}</dd></div><div><dt>Network</dt><dd>${escapeHtml(providerKit.network)}</dd></div></dl></section>
      </section>`;
    },
    bind(outlet, data, context) {
      onSubmit = (event) => {
        const form = event.target.closest("[data-provider-search]");
        if (!form) return;
        event.preventDefault();
        const query = new FormData(form).get("q")?.toString().trim() || "";
        context.router.navigate(query ? `/providers?q=${encodeURIComponent(query)}` : "/providers");
      };
      onClick = async (event) => {
        const button = event.target.closest("[data-create-intent]");
        if (!button) return;
        button.disabled = true;
        try {
          const provider = data.providers.find((item) => item.providerId === button.dataset.createIntent);
          const payload = { providerId: provider.providerId, intentType: provider.category };
          if (provider.category === "buy_crypto") payload.asset = "XLM";
          const result = await context.api("/api/intents", { method: "POST", body: JSON.stringify(payload) });
          context.store.invalidate("spend");
          context.showToast("Payment intent created.");
          await context.router.navigate(`/spend?intent=${encodeURIComponent(result.intent.id)}`);
        } catch (error) {
          context.showToast(error.message);
          button.disabled = false;
        }
      };
      boundOutlet = outlet;
      outlet.addEventListener("submit", onSubmit);
      outlet.addEventListener("click", onClick);
    },
    destroy() {
      if (boundOutlet && onSubmit) boundOutlet.removeEventListener("submit", onSubmit);
      if (boundOutlet && onClick) boundOutlet.removeEventListener("click", onClick);
    },
  };
}

function providerCard(provider) {
  return `<article class="card provider-card"><div class="card-heading"><strong>${escapeHtml(provider.name)}</strong>${statusPill(provider.verificationStatus || "available")}</div><p>${escapeHtml(provider.category)} | ${escapeHtml(provider.paymentMethod)}</p><code>${escapeHtml(provider.endpoint)}</code><small>${escapeHtml(provider.privacyRequirement)}</small><button class="secondary-button" data-create-intent="${escapeHtml(provider.providerId)}">Create intent</button></article>`;
}
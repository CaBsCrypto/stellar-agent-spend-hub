import { pageHeader, emptyState } from "../components.mjs";
import { escapeHtml, queryValue } from "../format.mjs";
import { servicePromptGrid, serviceProviderCard } from "../serviceCards.mjs";

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
      return `<section>${pageHeader({ eyebrow: "Opciones para ahorrar tiempo", title: "Elige que quieres que el agente prepare", summary: "Explora servicios digitales de prueba. El agente arma la propuesta y tu decides si aprobarla." })}<form class="discover-search" data-discover-search><label for="discover-query">Que necesitas resolver?</label><div><input id="discover-query" name="q" value="${escapeHtml(query)}" placeholder="Buscar una web, analizar una transaccion, comprar creditos..." /><button class="primary-button" type="submit">Buscar</button></div></form><div class="service-options discover-options" aria-label="Busquedas sugeridas">${servicePromptGrid({ mode: "link" })}</div><div class="discovery-context"><span>Modo demo</span><span>Pago de prueba</span><span>Tu apruebas</span><span>Sin datos privados</span></div><div class="provider-grid discover-grid">${providers.length ? providers.map(serviceProviderCard).join("") : emptyState("No encontre servicios", "Prueba describir el resultado que necesitas, no el nombre del proveedor.")}</div></section>`;
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
          context.showToast("Propuesta creada para revision humana.");
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
function isStellarProvider(provider) {
  const stellar = provider.paymentMethod?.includes("stellar") || provider.providerId === "stellar-agent-merchant-lab";
  return stellar && !["buy_crypto", "defi_allocate", "bill_pay"].includes(provider.category);
}

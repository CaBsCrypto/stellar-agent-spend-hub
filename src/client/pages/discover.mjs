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
      return `<section>${pageHeader({ eyebrow: "Opciones para ahorrar tiempo", title: "Elige que quieres que el agente prepare", summary: "Explora servicios digitales de prueba. El agente arma la propuesta y tu decides si aprobarla." })}<form class="discover-search" data-discover-search><label for="discover-query">Que necesitas resolver?</label><div><input id="discover-query" name="q" value="${escapeHtml(query)}" placeholder="Buscar una web, analizar una transaccion, comprar creditos..." /><button class="primary-button" type="submit">Buscar</button></div></form><div class="discover-prompts" aria-label="Busquedas sugeridas">${DISCOVER_PROMPTS.map((prompt) => `<a href="/discover?q=${encodeURIComponent(prompt.query)}" data-link>${escapeHtml(prompt.label)}</a>`).join("")}</div><div class="discovery-context"><span>Modo demo</span><span>Pago de prueba</span><span>Tu apruebas</span><span>Sin datos privados</span></div><div class="provider-grid discover-grid">${providers.length ? providers.map(providerCard).join("") : emptyState("No encontre servicios", "Prueba describir el resultado que necesitas, no el nombre del proveedor.")}</div></section>`;
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
  { label: "Analizar transaccion", query: "analizar transaccion" },
  { label: "Extraer web", query: "extraer informacion web" },
  { label: "Muestra de datos", query: "muestra datos" },
  { label: "Sandbox MCP", query: "sandbox MCP" },
  { label: "Creditos API", query: "creditos API" },
  { label: "Audio demo", query: "audio corto" },
];

function isStellarProvider(provider) {
  const stellar = provider.paymentMethod?.includes("stellar") || provider.providerId === "stellar-agent-merchant-lab";
  return stellar && !["buy_crypto", "defi_allocate", "bill_pay"].includes(provider.category);
}
function providerCard(provider) {
  const live = provider.paymentMethod === "stellar-mpp-usdc";
  return `<article class="card provider-card discover-card"><div class="card-heading"><span class="provider-kind">Servicio digital</span>${statusPill(live ? "pilot-ready" : "sandbox")}</div><div><h2>${escapeHtml(provider.name)}</h2><p>${escapeHtml(provider.description)}</p></div><dl class="service-card-facts"><div><dt>Costo demo</dt><dd>Pago de prueba</dd></div><div><dt>Recomendacion</dt><dd>${escapeHtml(recommendationFor(provider))}</dd></div><div><dt>Privacidad</dt><dd>No usa datos personales</dd></div></dl><button class="secondary-button" data-create-intent="${escapeHtml(provider.providerId)}">Preparar propuesta</button></article>`;
}

function recommendationFor(provider) {
  const tags = (provider.tags || []).join(" ").toLowerCase();
  if (tags.includes("voice") || tags.includes("audio")) return "Util para crear una muestra rapida.";
  if (tags.includes("cloud") || tags.includes("credits")) return "Ahorra configurar creditos manualmente.";
  if (tags.includes("sandbox")) return "Sirve para probar una herramienta sin setup largo.";
  if (tags.includes("extract") || tags.includes("website")) return "Convierte una web en datos reutilizables.";
  if (tags.includes("dataset") || tags.includes("research")) return "Acelera investigacion con una muestra lista.";
  if (tags.includes("browser")) return "Automatiza una tarea web controlada.";
  return "El agente puede preparar el pago y dejarlo listo para revisar.";
}
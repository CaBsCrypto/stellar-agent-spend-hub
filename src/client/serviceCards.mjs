import { statusPill } from "./components.mjs";
import { escapeHtml } from "./format.mjs";

export function serviceProviderCard(provider) {
  const live = provider.paymentMethod === "stellar-mpp-usdc";
  return `<article class="card provider-card discover-card"><div class="card-heading"><span class="provider-kind">Servicio digital</span>${statusPill(live ? "pilot-ready" : "sandbox")}</div><div><h2>${escapeHtml(provider.name)}</h2><p>${escapeHtml(provider.description)}</p></div>${serviceFacts(provider)}<button class="secondary-button" data-create-intent="${escapeHtml(provider.providerId)}">Preparar propuesta</button></article>`;
}

export function serviceFacts(provider) {
  return `<dl class="service-card-facts"><div><dt>Costo demo</dt><dd>Pago de prueba</dd></div><div><dt>Recomendacion</dt><dd>${escapeHtml(serviceRecommendation(provider))}</dd></div><div><dt>Privacidad</dt><dd>No usa datos personales</dd></div></dl>`;
}

export function serviceRecommendation(provider) {
  const tags = (provider.tags || []).join(" ").toLowerCase();
  if (tags.includes("voice") || tags.includes("audio")) return "Util para crear una muestra rapida.";
  if (tags.includes("cloud") || tags.includes("credits")) return "Ahorra configurar creditos manualmente.";
  if (tags.includes("sandbox")) return "Sirve para probar una herramienta sin setup largo.";
  if (tags.includes("extract") || tags.includes("website")) return "Convierte una web en datos reutilizables.";
  if (tags.includes("dataset") || tags.includes("research")) return "Acelera investigacion con una muestra lista.";
  if (tags.includes("browser")) return "Automatiza una tarea web controlada.";
  return "El agente puede preparar el pago y dejarlo listo para revisar.";
}
import { statusPill } from "./components.mjs";
import { escapeHtml } from "./format.mjs";

export const SERVICE_PROMPTS = [
  { label: "Analizar una transaccion", detail: "Recibe un resumen simple de riesgo y actividad publica.", query: "analizar transaccion", group: "Investigar" },
  { label: "Extraer datos de una web", detail: "Convierte una pagina en datos reutilizables para tu agente.", query: "extraer informacion web", group: "Web y datos" },
  { label: "Comprar creditos de API", detail: "Prepara un paquete pequeno de creditos para una tarea.", query: "creditos API", group: "APIs y herramientas" },
  { label: "Preparar un sandbox MCP", detail: "Deja listo un entorno de prueba para conectar herramientas.", query: "sandbox MCP", group: "APIs y herramientas" },
  { label: "Generar un audio corto", detail: "Crea una muestra de voz o audio para una demo.", query: "audio corto", group: "Media" },
  { label: "Crear una imagen para demo", detail: "Genera un recurso visual ligero para presentar una idea.", query: "crear imagen demo", group: "Media" },
];

export function servicePromptGrid({ mode = "button" } = {}) {
  const groups = [...new Set(SERVICE_PROMPTS.map((prompt) => prompt.group))];
  return groups.map((group) => {
    const prompts = SERVICE_PROMPTS.filter((prompt) => prompt.group === group);
    return `<article><span>${escapeHtml(group)}</span><div>${prompts.map((prompt) => servicePromptAction(prompt, mode)).join("")}</div></article>`;
  }).join("");
}

export function fallbackPromptLinks() {
  return SERVICE_PROMPTS.slice(0, 3).map((prompt) => `<a class="text-link" href="/discover?q=${encodeURIComponent(prompt.query)}" data-link>${escapeHtml(prompt.label)}</a>`).join("");
}

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

function servicePromptAction(prompt, mode) {
  const body = `<strong>${escapeHtml(prompt.label)}</strong><small>${escapeHtml(prompt.detail)}</small>`;
  if (mode === "link") return `<a href="/discover?q=${encodeURIComponent(prompt.query)}" data-link>${body}</a>`;
  return `<button type="button" data-agent-prompt="${escapeHtml(prompt.label)}">${body}</button>`;
}

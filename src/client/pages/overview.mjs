import { pageHeader, emptyState, actionPanel, approvalCard, evidenceRow } from "../components.mjs";
import { escapeHtml, money } from "../format.mjs";
import { fallbackPromptLinks, servicePromptGrid } from "../serviceCards.mjs";

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
          eyebrow: "Ahorra tiempo en compras digitales",
          title: "Dile que necesitas. El agente busca opciones, prepara el pago y tu apruebas.",
          summary: "Elige un servicio digital, revisa una propuesta clara y decide si aprobarla o descartarla. Todo corre en modo demo con pagos de prueba.",
          actions: '<a class="secondary-button" href="/wallet" data-link>Permisos del agente</a>',
        })}
        <section class="agent-command" aria-labelledby="agent-command-title">
          <div class="agent-presence"><span class="agent-status-dot" aria-hidden="true"></span><div><strong id="agent-command-title">Agente de compras</strong><small>Modo demo | Pago de prueba | Tu apruebas</small></div></div>
          <form data-agent-command><p class="agent-command-help">Describe lo que quieres resolver y el agente preparara una propuesta de pago de prueba.</p><label for="agent-request">Que necesitas resolver?</label><div class="agent-command-row"><input id="agent-request" name="request" autocomplete="off" maxlength="120" placeholder="Ej: analizar una transaccion o extraer datos de una web" required /><button class="primary-button" type="submit">Buscar opciones</button></div></form>
          <div class="service-options" aria-label="Opciones de servicios">${servicePromptGrid()}</div>
          <p class="agent-boundary-note">Elige una opcion o escribe la tuya. El agente hace la busqueda y prepara la propuesta; tu mantienes el control.</p>
          <div class="agent-steps" data-agent-steps hidden aria-live="polite"></div>
        </section>
        <section class="pilot-tasks user-flow" aria-labelledby="pilot-tasks-title"><div><span class="section-label">Flujo guiado</span><h2 id="pilot-tasks-title">Tres pasos, sin configurar nada</h2></div>${pilotTask("1", "Pide un servicio", "Elige una opcion o describe lo que necesitas.")}${pilotTask("2", "Revisa la propuesta", "Mira que compra, cuanto cuesta y por que lo recomienda.")}${pilotTask("3", "Aprueba o descarta", "Nada se mueve sin tu decision final.")}</section>
        <div class="home-snapshot">
          ${actionPanel({ eyebrow: "Modo", title: "Demo supervisada", body: `${data.summary.ready} ${data.summary.ready === 1 ? "propuesta lista" : "propuestas listas"}. Limite por pago de prueba: ${money(data.policy.perPaymentLimit)}.`, actions: '<a class="text-link" href="/discover" data-link>Ver servicios</a>', status: "ready" })}
          ${actionPanel({ eyebrow: "Control", title: "Tu apruebas siempre", body: "El agente puede preparar, pero no puede pagar solo. El navegador no recibe llaves privadas ni credenciales.", actions: '<a class="text-link" href="/security" data-link>Ver seguridad</a>', status: "disabled" })}
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Propuestas listas</span><h2>Lo que el agente preparo para ti</h2></div><a class="text-link" href="/spend" data-link>Revisar</a></div><div class="proposal-list">${data.proposals.length ? data.proposals.map(proposalRow).join("") : emptyState("Sin propuestas pendientes", "Pide un servicio arriba y el agente preparara una opcion para revisar.")}</div></section>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Historial</span><h2>Pagos de prueba y evidencia</h2></div><a class="text-link" href="/activity" data-link>Ver historial</a></div><div class="activity-preview">${data.recentActivity.length ? data.recentActivity.map(evidenceRow).join("") : emptyState("Sin actividad verificada", "Las aprobaciones y comprobantes apareceran aqui sin datos privados.")}</div></section>
        <section class="section-block feedback-panel" id="feedback"><div class="section-heading"><div><span class="section-label">Feedback</span><h2>Que deberiamos simplificar?</h2></div></div><form data-feedback-form><div class="feedback-grid"><label>Rol<select name="role"><option value="builder">Builder</option><option value="founder">Founder</option><option value="provider">Proveedor</option><option value="investor">Inversionista</option><option value="stellar">Ecosistema Stellar</option><option value="other">Otro</option></select></label><label>Se entendio?<select name="clarity"><option value="clear">Claro</option><option value="somewhat-clear">Mas o menos</option><option value="confusing">Confuso</option></select></label><label>Confiarias en este flujo?<select name="trust"><option value="somewhat-clear">Quizas, con mejoras</option><option value="clear">Si</option><option value="confusing">Todavia no</option></select></label></div><label>Parte mas confusa<textarea name="confusing" maxlength="700" placeholder="Sin emails, telefonos, IDs de cuenta ni secretos."></textarea></label><label>Mejora mas util<textarea name="next" maxlength="700" placeholder="Ej: estado mas claro, mejor guia, mas opciones de servicios..."></textarea></label><button class="primary-button" type="submit">Enviar feedback</button><p class="feedback-note">Anonimo y filtrado por privacidad. No incluyas datos personales ni secretos.</p></form></section>
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

async function runAgent(request, outlet, context) {
  const stepsEl = outlet.querySelector("[data-agent-steps]");
  if (!stepsEl) return;
  const steps = [];
  const paint = () => { stepsEl.hidden = false; stepsEl.innerHTML = steps.map((step) => `<div class="agent-step ${step.state}"><span aria-hidden="true"></span><div>${step.html}</div></div>`).join(""); };
  const setLast = (state, html) => { steps[steps.length - 1] = { state, html }; paint(); };
  steps.push({ state: "active", html: `Buscando: servicios para "${escapeHtml(request)}"...` });
  paint();
  try {
    const payload = await context.api(`/api/providers?q=${encodeURIComponent(request)}`);
    const provider = (payload.providers || []).find((item) =>
      (item.paymentMethod?.includes("stellar") || item.providerId === "stellar-agent-merchant-lab")
      && !["buy_crypto", "defi_allocate", "bill_pay"].includes(item.category));
    if (!provider) {
      setLast("error", `No encontre un servicio para esa solicitud. Prueba una de estas opciones: <span class="agent-fallback-links">${fallbackPromptLinks()}</span>`);
      return;
    }
    setLast("done", `Servicio encontrado: <strong>${escapeHtml(provider.name)}</strong> - ${escapeHtml(provider.description || "servicio con pago de prueba")}`);
    steps.push({ state: "active", html: "Revisando controles y preparando una propuesta de pago de prueba..." });
    paint();
    const result = await context.api("/api/intents", { method: "POST", body: JSON.stringify({ providerId: provider.providerId, intentType: provider.category }) });
    context.store.invalidate("spend", "agent-home");
    setLast("done", "Propuesta lista: controles revisados y pago de prueba preparado.");
    steps.push({ state: "ready", html: `Esperando tu revision: <strong>${escapeHtml(money(result.intent.amount, result.intent.currency))}</strong> para ${escapeHtml(provider.name)} <a class="primary-button agent-step-cta" href="/spend?intent=${encodeURIComponent(result.intent.id)}" data-link>Revisar propuesta</a>` });
    paint();
  } catch (error) {
    setLast("error", escapeHtml(error.message || "El agente no pudo completar esta solicitud."));
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
    context.showToast("Feedback recibido. Gracias: no se hizo ningun pago.");
  } catch (error) {
    context.showToast(error.message || "No se pudo enviar el feedback.");
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
    status: proposal.status || "Necesita aprobacion",
    href: `/spend?intent=${encodeURIComponent(proposal.id)}`,
  });
}


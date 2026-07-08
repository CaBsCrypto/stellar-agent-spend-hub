import { pageHeader, metric, statusPill, receiptRow, emptyState, guardedAction } from "../components.mjs";
import { escapeHtml, money, queryValue, shortHash } from "../format.mjs";

export function createPage() {
  let clickHandler;
  let boundOutlet;
  return {
    async load({ store, signal, url }) {
      const pilotId = queryValue(url, "pilot", "");
      if (pilotId) {
        const payload = await store.load(`pilot:${pilotId}`, `/api/pilot/requests/${encodeURIComponent(pilotId)}`, { signal, maxAgeMs: 0 });
        return { pilotMode: true, pilot: payload.request };
      }
      const data = await store.load("spend", "/api/spend", { signal });
      const requestedId = queryValue(url, "intent", data.intents[0]?.id || "");
      const selected = data.intents.find((intent) => intent.id === requestedId) || data.intents[0] || null;
      return { ...data, selected, evaluation: selected ? data.evaluations[selected.id] : null };
    },
    render(data) {
      if (data.pilotMode) return renderPilotApproval(data.pilot);
      const { selected, evaluation, summary } = data;
      return `<section>
        ${pageHeader({ eyebrow: "Decision final", title: "Revisar propuesta", summary: "El agente ya hizo el trabajo preliminar. Revisa que va a comprar, cuanto cuesta y decide si aprobar o descartar." })}
        <div class="metric-grid">${metric("Propuestas listas", summary.ready, `${summary.blocked} bloqueadas`)}${metric("Comprobantes", summary.receipts, "Sin datos privados")}${metric("Limite por pago", money(data.policy.perPaymentLimit), "Control activo")}${metric("Decision humana", data.policy.requireHumanConfirmation ? "Siempre" : "Desactivada", "Modo demo")}</div>
        <div class="spend-layout">
          <aside class="panel intent-panel"><div class="section-heading"><div><span class="section-label">Pendientes</span><h2>Propuestas</h2></div></div><div class="intent-list">${data.intents.length ? data.intents.map((intent) => intentLink(intent, data.evaluations[intent.id], selected?.id)).join("") : emptyState("No hay propuestas", "Pide un servicio desde Home o Discover.")}</div></aside>
          <section class="panel review-panel">${selected ? reviewIntent(selected, evaluation, data.spendRequests?.[selected.id]) : emptyState("Elige una propuesta", "Selecciona una compra preparada para revisarla.")}</section>
          <aside class="panel policy-panel"><div class="section-heading"><div><span class="section-label">Tus reglas</span><h2>Controles activos</h2></div></div>${policyRow("Limite diario", money(data.policy.dailyLimit))}${policyRow("Limite mensual", money(data.policy.monthlyLimit))}${policyRow("Monedas permitidas", data.policy.allowedAssets.join(", "))}${policyRow("Variacion maxima", `${data.policy.maxSlippageBps} bps`)}${policyRow("Pago automatico", data.policy.autopilotEnabled ? "Activo" : "Bloqueado")}<div class="security-callout"><strong>Datos privados protegidos</strong><p>No se publican identificadores personales, credenciales ni referencias de cliente.</p></div></aside>
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Historial</span><h2>Comprobantes</h2></div></div><div class="receipt-list">${data.receipts.length ? data.receipts.map(receiptRow).join("") : emptyState("Sin comprobantes", "Las aprobaciones apareceran aqui sin datos privados.")}</div></section>
      </section>`;
    },
    bind(outlet, data, context) {
      clickHandler = async (event) => {
        const pilotButton = event.target.closest("[data-pilot-approve]");
        if (pilotButton && data.pilotMode) {
          pilotButton.disabled = true;
          try {
            const approvalToken = new URLSearchParams(window.location.hash.slice(1)).get("approval");
            if (!approvalToken) throw new Error("This approval link is missing its one-time token.");
            await context.api(`/api/pilot/requests/${encodeURIComponent(data.pilot.requestId)}/approve`, {
              method: "POST",
              body: JSON.stringify({ approvalToken }),
            });
            history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
            context.store.invalidate(`pilot:${data.pilot.requestId}`);
            context.showToast("Pilot payment approved. The local buyer may now claim it.");
            await context.router.refresh();
          } catch (error) {
            context.showToast(error.message);
            pilotButton.disabled = false;
          }
          return;
        }
        const actionButton = event.target.closest("[data-intent-action]");
        if (!actionButton || !data.selected) return;
        actionButton.disabled = true;
        const id = encodeURIComponent(data.selected.id);
        if (actionButton.dataset.intentAction === "dismiss") {
          try {
            await context.api(`/api/intents/${id}/dismiss`, { method: "POST", body: "{}" });
            context.store.invalidate("spend", "agent-home");
            context.showToast("Propuesta descartada. No se hizo ningun pago.");
            await context.router.navigate("/spend");
          } catch (error) {
            context.showToast(error.message);
            actionButton.disabled = false;
          }
          return;
        }
        actionButton.textContent = "Aprobando...";
        try {
          // The agent runs the technical steps; the human performs one approval.
          await context.api(`/api/intents/${id}/prepare`, { method: "POST", body: "{}" });
          if (data.selected.proofRequired && data.selected.proofStatus !== "valid") {
            await context.api(`/api/intents/${id}/proof`, {
              method: "POST",
              body: JSON.stringify({ secretRef: `secret:${data.selected.id}`, salt: "demo-salt" }),
            });
          }
          const result = await context.api(`/api/intents/${id}/approve`, {
            method: "POST",
            body: JSON.stringify({ approvedBy: "user-passkey" }),
          });
          context.store.invalidate("spend", "overview:live", "activity", "agent-home");
          context.showToast("Pago de prueba aprobado. Comprobante registrado sin datos privados.");
          await context.router.navigate(`/activity?receipt=${encodeURIComponent(result.receipt?.id || "")}`);
        } catch (error) {
          context.showToast(error.message);
          actionButton.disabled = false;
          actionButton.textContent = "Aprobar pago de prueba";
        }
      };
      boundOutlet = outlet;
      outlet.addEventListener("click", clickHandler);
    },
    destroy() {
      if (boundOutlet && clickHandler) boundOutlet.removeEventListener("click", clickHandler);
    },
  };
}

function renderPilotApproval(request) {
  const canApprove = request.status === "prepared";
  return `<section>
    ${pageHeader({ eyebrow: "Remote MCP Provider Pilot", title: "Aprobacion humana", summary: "Revisa esta propuesta antes de permitir que el comprador local la reclame." })}
    <div class="metric-grid">${metric("Monto", `${escapeHtml(request.amount)} ${escapeHtml(request.asset)}`, "Precio exacto")}${metric("Red", request.network, "Solo prueba")}${metric("Estado", request.status, "Un solo uso")}${metric("Proveedor", request.providerName, "Permitido")}</div>
    <section class="panel review-panel">
      <div class="section-heading"><div><span class="section-label">Propuesta</span><h2>${escapeHtml(request.resourceId)}</h2></div>${statusPill(request.status)}</div>
      <dl class="definition-list">
        <div><dt>Recipient</dt><dd><code>${escapeHtml(request.recipient)}</code></dd></div>
        <div><dt>Asset contract</dt><dd><code>${escapeHtml(request.assetContractId)}</code></dd></div>
        <div><dt>Request</dt><dd><code>${escapeHtml(request.requestId)}</code></dd></div>
      </dl>
      <div class="security-callout"><strong>Limite de seguridad</strong><p>Aprobar solo cambia el estado de la solicitud. El navegador no recibe secretos ni puede mover fondos.</p></div>
      <div class="button-row"><button class="primary-button" data-pilot-approve ${canApprove ? "" : "disabled"}>Aprobar pago de prueba</button></div>
    </section>
  </section>`;
}

function intentLink(intent, evaluation = {}, selectedId) {
  return `<a class="intent-item ${intent.id === selectedId ? "selected" : ""}" href="/spend?intent=${encodeURIComponent(intent.id)}" data-link><div><strong>${escapeHtml(intent.providerName)}</strong>${statusPill(evaluation.allowed ? "ready" : "blocked")}</div><span>${escapeHtml(intent.intentType)} | ${money(intent.amount, intent.currency)}</span><small>Privacidad ${escapeHtml(intent.proofStatus || "ok")} | ${escapeHtml(intent.status || "creada")}</small></a>`;
}

function reviewIntent(intent, evaluation = {}, spendRequest) {
  const reasons = evaluation.allowed ? evaluation.evidence || [] : evaluation.reasons || [];
  return `<div class="section-heading"><div><span class="section-label">Propuesta seleccionada</span><h2>${escapeHtml(intent.providerName)}</h2></div>${statusPill(evaluation.allowed ? "ready" : "blocked")}</div>
    <div class="review-amount"><strong>${money(intent.amount, intent.currency)}</strong><span>Pago de prueba | ${escapeHtml(intent.status || "creada")}</span></div>
    <div class="decision-grid"><article><span>Que va a comprar</span><strong>${escapeHtml(intent.providerName)}</strong><p>${escapeHtml(intent.intentType)}</p></article><article><span>Cuanto cuesta</span><strong>${money(intent.amount, intent.currency)}</strong><p>Dentro de tus limites</p></article><article><span>Por que lo recomienda</span><p>${escapeHtml(intent.agentReason)}</p></article><article><span>Datos que NO se comparten</span><p>Sin llaves privadas, credenciales, RUT, telefono, email ni identificadores de cliente.</p></article></div>
    <div class="control-grid"><article><span>Terminos y proveedor</span><strong>${evaluation.legalDecision?.snapshot ? `Confianza ${escapeHtml(evaluation.legalDecision.trustLevel)}` : "No disponible"}</strong><code>${escapeHtml(shortHash(evaluation.legalDecision?.termsHash))}</code></article><article><span>Privacidad</span><strong>${escapeHtml(evaluation.privacyDecision?.privacyLevel || intent.privacyRequirement)}</strong><code>${escapeHtml(shortHash(evaluation.privacyDecision?.proofHash || evaluation.privacyDecision?.commitment))}</code></article></div>
    ${spendRequest ? `<div class="notice verified"><strong>Solicitud preparada</strong><span>${escapeHtml(spendRequest.status)}</span><code>${escapeHtml(shortHash(spendRequest.id))}</code></div>` : ""}
    <div class="check-list">${reasons.map((reason) => `<div><span>${evaluation.allowed ? "OK" : "!"}</span><p>${escapeHtml(reason)}</p></div>`).join("")}</div>
    <div class="button-row">${guardedAction({ label: "Aprobar pago de prueba", enabled: Boolean(evaluation.allowed), reason: "Bloqueado por los controles anteriores.", action: { name: "intent-action", value: "approve" } })}${intent.status === "settled" ? "" : guardedAction({ label: "Descartar", enabled: true, action: { name: "intent-action", value: "dismiss" }, kind: "secondary" })}</div>`;
}

function policyRow(label, value) {
  return `<div class="policy-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
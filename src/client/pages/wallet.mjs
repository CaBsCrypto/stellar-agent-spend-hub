import { pageHeader, metric, statusPill, receiptRow, emptyState, evidenceCard, guardedAction } from "../components.mjs";
import { escapeHtml, shortHash } from "../format.mjs";

export function createPage() {
  let clickHandler;
  let boundOutlet;
  return {
    async load({ store, signal }) {
      const passkey = await import("../passkey.mjs");
      const [account, overview] = await Promise.all([
        store.load("wallet", "/api/contract-account/status", { signal }),
        store.load("overview:live", "/api/overview?mode=live", { signal }),
      ]);
      return {
        account,
        overview,
        localPasskey: passkey.publicRegistration(passkey.loadLocalPasskey()),
      };
    },
    render({ account, overview, localPasskey }) {
      const readiness = account.readiness || {};
      const receipts = account.receipts || [];
      const latest = receipts[0];
      const coordinated = overview.evidence.coordinatedDemo?.contractAccount || {};
      return `<section>
        ${pageHeader({ eyebrow: "Permisos del agente", title: "Define que puede hacer el agente", summary: "Aqui controlas los permisos de prueba: crear una llave de aprobacion, permitir una sesion limitada o revocarla cuando quieras." })}
        <div class="metric-grid">${metric("Permisos", readiness.status || "disabled", readiness.contractId ? shortHash(readiness.contractId) : "Pendiente")}${metric("Llave de aprobacion", localPasskey ? "Lista" : "No creada", localPasskey?.rpId || "Dominio seguro")}${metric("Por pago", "0.01 USDC", "Limite fijo")}${metric("Presupuesto", "0.02 USDC", "Sesion de 24 horas")}</div>
        <div class="wallet-layout">
          <section class="panel"><div class="section-heading"><div><span class="section-label">Control del usuario</span><h2>Permisos y sesion</h2></div>${statusPill(readiness.status || "disabled")}</div><div class="wallet-steps">${walletStep("1", "Crear llave de aprobacion", localPasskey ? "ready" : "pending", localPasskey?.rpId || "Este dispositivo")}${walletStep("2", "Crear cuenta de prueba", readiness.contractId ? "ready" : "guarded", readiness.contractId || "Pendiente")}${walletStep("3", "Permitir al agente", latest?.action === "grant" ? "ready" : "guarded", "Proveedor + monto + limite")}${walletStep("4", "Agente prepara pago", latest?.action === "transfer" ? "ready" : "guarded", "Sesion local limitada")}${walletStep("5", "Ver comprobante", latest ? "ready" : "pending", latest?.transactionHash || "Sin pago")}</div><div class="button-row">${guardedAction({ label: "Crear llave", enabled: true, action: { name: "wallet-action", value: "create-passkey" }, kind: "secondary" })}${guardedAction({ label: "Copiar datos publicos", enabled: Boolean(localPasskey), reason: "Crea una llave primero.", action: { name: "wallet-action", value: "copy-passkey" }, kind: "secondary" })}${guardedAction({ label: "Permitir agente", enabled: Boolean(readiness.submitEnabled && localPasskey), reason: "La compuerta de envio esta cerrada por seguridad.", action: { name: "wallet-action", value: "grant" } })}${guardedAction({ label: "Revocar", enabled: Boolean(readiness.submitEnabled && localPasskey), reason: "La compuerta de envio esta cerrada por seguridad.", action: { name: "wallet-action", value: "revoke" }, kind: "danger" })}</div></section>
          <section><div class="section-heading"><div><span class="section-label">Comprobante tecnico</span><h2>Pago de prueba verificado</h2></div></div>${evidenceCard("Sesion del agente", coordinated)}<div class="notice pending"><strong>Limite del agente</strong><p>El secreto de sesion queda fuera del navegador. Esta pantalla no puede mover fondos por si sola.</p></div><div class="notice verified"><strong>Detalles tecnicos</strong><p>La cuenta programable vive en Stellar/Soroban. Los laboratorios experimentales no aparecen en el flujo principal.</p></div></section>
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Historial</span><h2>Comprobantes sin datos privados</h2></div></div><div class="receipt-list">${receipts.length ? receipts.map(receiptRow).join("") : emptyState("Sin comprobantes", "Las acciones de permisos y pagos de prueba apareceran aqui.")}</div></section>
      </section>`;
    },
    bind(outlet, data, context) {
      clickHandler = async (event) => {
        const button = event.target.closest("[data-wallet-action]");
        if (!button) return;
        button.disabled = true;
        try {
          const passkey = await import("../passkey.mjs");
          const action = button.dataset.walletAction;
          if (action === "create-passkey") {
            await passkey.createDemoPasskey();
            context.showToast("Llave creada en este dispositivo.");
          } else if (action === "copy-passkey") {
            await navigator.clipboard.writeText(JSON.stringify(data.localPasskey));
            context.showToast("Datos publicos copiados.");
          } else {
            const prepared = await context.api("/api/contract-account/prepare", {
              method: "POST",
              body: JSON.stringify({ action }),
            });
            const assertion = await passkey.signPasskeyPayload(prepared.auth.signaturePayloadHex);
            await context.api("/api/contract-account/submit", {
              method: "POST",
              body: JSON.stringify({ requestId: prepared.requestId, assertion }),
            });
            context.showToast(action === "grant" ? "Permiso del agente concedido." : "Permiso del agente revocado.");
          }
          context.store.invalidate("wallet", "overview:live");
          await context.router.refresh();
        } catch (error) {
          context.showToast(error.message);
          button.disabled = false;
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

function walletStep(number, label, status, detail) {
  return `<article class="wallet-step"><span>${number}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div>${statusPill(status)}</article>`;
}

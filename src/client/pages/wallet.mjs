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
        ${pageHeader({ eyebrow: "Soroban Contract Account V1", title: "Smart Wallet controls", summary: "Use a passkey to grant or revoke a short-lived Stellar agent session. The session can only pay the merchant, asset, amount, budget, and expiry you approved." })}
        <div class="metric-grid">${metric("Wallet", readiness.status || "disabled", readiness.contractId ? shortHash(readiness.contractId) : "Awaiting deployment")}${metric("Passkey", localPasskey ? "Registered" : "Not registered", localPasskey?.rpId || "Production RP")}${metric("Per payment", "0.01 USDC", "Fixed policy")}${metric("Total budget", "0.02 USDC", "24-hour session")}</div>
        <div class="wallet-layout">
          <section class="panel"><div class="section-heading"><div><span class="section-label">Owner authority</span><h2>Passkey and session</h2></div>${statusPill(readiness.status || "disabled")}</div><div class="wallet-steps">${walletStep("1", "Create passkey", localPasskey ? "ready" : "pending", localPasskey?.rpId || "WebAuthn")}${walletStep("2", "Deploy wallet", readiness.contractId ? "ready" : "guarded", readiness.contractId || "Testnet instance pending")}${walletStep("3", "Grant agent", latest?.action === "grant" ? "ready" : "guarded", "Merchant + USDC + limits")}${walletStep("4", "Agent pays", latest?.action === "transfer" ? "ready" : "guarded", "Local session signer")}${walletStep("5", "Verify receipt", latest ? "ready" : "pending", latest?.transactionHash || "No settlement")}</div><div class="button-row">${guardedAction({ label: "Create passkey", enabled: true, action: { name: "wallet-action", value: "create-passkey" }, kind: "secondary" })}${guardedAction({ label: "Copy public deploy data", enabled: Boolean(localPasskey), reason: "Create a passkey first.", action: { name: "wallet-action", value: "copy-passkey" }, kind: "secondary" })}${guardedAction({ label: "Grant agent", enabled: Boolean(readiness.submitEnabled && localPasskey), reason: "Submit gate is closed for production safety.", action: { name: "wallet-action", value: "grant" } })}${guardedAction({ label: "Revoke", enabled: Boolean(readiness.submitEnabled && localPasskey), reason: "Submit gate is closed for production safety.", action: { name: "wallet-action", value: "revoke" }, kind: "danger" })}</div></section>
          <section><div class="section-heading"><div><span class="section-label">Coordinated proof</span><h2>Contract Account settlement</h2></div></div>${evidenceCard("C-account session", coordinated)}<div class="notice pending"><strong>Agent transfer boundary</strong><p>The session secret stays in the supervised local agent. It is never loaded into this browser.</p></div><div class="notice verified"><strong>Stellar-first boundary</strong><p>This route only controls the Soroban Contract Account. Experimental EVM labs stay hidden from the user flow.</p></div></section>
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Account history</span><h2>Sanitized receipts</h2></div></div><div class="receipt-list">${receipts.length ? receipts.map(receiptRow).join("") : emptyState("No Contract Account receipts", "Deployment and USDC acceptance remain supervised.")}</div></section>
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
            context.showToast("Passkey registered on this device.");
          } else if (action === "copy-passkey") {
            await navigator.clipboard.writeText(JSON.stringify(data.localPasskey));
            context.showToast("Public deployment data copied.");
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
            context.showToast(action === "grant" ? "Agent session granted." : "Agent session revoked.");
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

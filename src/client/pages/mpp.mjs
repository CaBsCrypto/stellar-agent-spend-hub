import { pageHeader, metric, statusPill, receiptRow, dependencyStrip, emptyState } from "../components.mjs";
import { escapeHtml } from "../format.mjs";

export function createPage() {
  return {
    async load({ store, signal }) {
      const [overview, receiptPayload, providerPayload] = await Promise.all([
        store.load("overview:live", "/api/overview?mode=live", { signal }),
        store.load("mpp:receipts", "/api/mpp/receipts", { signal }),
        store.load("provider-kit", "/api/provider-kit/definition", { signal }),
      ]);
      return { overview, receipts: receiptPayload.receipts || [], provider: providerPayload.provider };
    },
    render({ overview, receipts, provider }) {
      const readiness = overview.diagnostics.mpp || {};
      const evidence = overview.evidence.coordinatedDemo?.mpp || {};
      return `<section>
        ${pageHeader({ eyebrow: "Official Stellar MPP Charge", title: "Machine Payments", summary: "A buyer agent pays a fixed USDC price and unlocks a Horizon-backed digital resource." })}
        <div class="metric-grid">${metric("Price", `${provider.maxPrice} ${provider.asset}`, "Fixed maximum")}${metric("Network", provider.network, "Testnet only")}${metric("Seller", readiness.status || "disabled", readiness.enabled ? "Gate open" : "Gate closed")}${metric("Settlement", evidence.verificationStatus || "pending", "Public receipt required")}</div>
        <div class="two-column">
          <section class="panel"><div class="section-heading"><div><span class="section-label">Paid resource</span><h2>Stellar Risk API</h2></div>${statusPill(readiness.status || "disabled")}</div><dl class="definition-list"><div><dt>Endpoint</dt><dd><code>${escapeHtml(provider.endpoint)}</code></dd></div><div><dt>Asset contract</dt><dd><code>${escapeHtml(provider.assetContractId)}</code></dd></div><div><dt>Protocol</dt><dd>stellar/charge</dd></div><div><dt>Privacy</dt><dd>${escapeHtml(provider.privacyRequirements.join(" | "))}</dd></div></dl></section>
          <section class="panel"><div class="section-heading"><div><span class="section-label">Interoperable lifecycle</span><h2>402 to resource</h2></div></div><ol class="vertical-flow"><li><span>1</span><div><strong>Request</strong><p>Agent requests a priced resource.</p></div></li><li><span>2</span><div><strong>Challenge</strong><p>Seller returns the exact Stellar MPP terms.</p></div></li><li><span>3</span><div><strong>Confirm and settle</strong><p>Local buyer validates policy before signing.</p></div></li><li><span>4</span><div><strong>Deliver</strong><p>Resource and sanitized receipt are returned.</p></div></li></ol></section>
        </div>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Public history</span><h2>MPP receipts</h2></div></div><div class="receipt-list">${receipts.length ? receipts.map(receiptRow).join("") : emptyState("No MPP settlement yet", "The supervised USDC acceptance session remains pending.")}</div></section>
        ${dependencyStrip(overview.diagnostics.dependencies)}
      </section>`;
    },
    bind() {},
    destroy() {},
  };
}
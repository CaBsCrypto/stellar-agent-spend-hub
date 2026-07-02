import { pageHeader, statusPill } from "../components.mjs";
import { escapeHtml } from "../format.mjs";

export function createPage() {
  return {
    async load({ store, signal }) {
      const [kit, pilot] = await Promise.all([
        store.load("provider-kit", "/api/provider-kit/definition", { signal }),
        store.load("pilot-readiness", "/api/pilot/readiness", { signal }),
      ]);
      return { providerKit: kit.provider, pilot };
    },
    render({ providerKit, pilot }) {
      return `<section>${pageHeader({ eyebrow: "Build on Stellar", title: "Charge your API in USDC", summary: "Provider Kit gives Node and MCP services a bounded Stellar MPP flow: challenge, payment, retry, resource, and sanitized receipt." })}<div class="two-column"><section class="panel"><div class="section-heading"><div><span class="section-label">Provider Kit V1</span><h2>Machine-readable definition</h2></div>${statusPill("ready")}</div><dl class="definition-list"><div><dt>Provider ID</dt><dd>${escapeHtml(providerKit.providerId)}</dd></div><div><dt>Endpoint</dt><dd><code>${escapeHtml(providerKit.endpoint)}</code></dd></div><div><dt>Maximum price</dt><dd>${escapeHtml(providerKit.maxPrice)} ${escapeHtml(providerKit.asset)}</dd></div><div><dt>Network</dt><dd>${escapeHtml(providerKit.network)}</dd></div></dl></section><section class="panel"><div class="section-heading"><div><span class="section-label">Reference pilot</span><h2>Merchant Lab</h2></div>${statusPill(pilot.pilot.status)}</div><dl class="definition-list"><div><dt>MCP endpoint</dt><dd><code>/api/mcp</code></dd></div><div><dt>Tenant</dt><dd>${escapeHtml(pilot.pilot.tenantId)}</dd></div><div><dt>Persistence</dt><dd>${escapeHtml(pilot.repository.status)}</dd></div><div><dt>Settlement</dt><dd>Local supervised buyer</dd></div></dl></section></div><section class="section-block"><div class="section-heading"><div><span class="section-label">Integration flow</span><h2>From request to verified resource</h2></div></div><ol class="trust-flow" aria-label="Provider integration flow"><li><span>1</span><strong>Define</strong></li><li><span>2</span><strong>Challenge</strong></li><li><span>3</span><strong>Settle</strong></li><li><span>4</span><strong>Deliver</strong></li><li><span>5</span><strong>Receipt</strong></li></ol><p class="body-copy section-block">The provider never receives wallet secrets. Spend Hub validates the provider definition, preserves the official MPP challenge, and records only public settlement evidence.</p></section><div class="button-row section-block"><a class="primary-button" href="/mpp" data-link>Inspect MPP flow</a><a class="secondary-button" href="/evidence" data-link>View live evidence</a></div></section>`;
    },
    bind() {},
    destroy() {},
  };
}
import { pageHeader, evidenceCard, foundationCard, dependencyStrip, trustFlow } from "../components.mjs";

export function createPage() {
  return {
    async load({ store, signal }) {
      return store.load("overview:live", "/api/overview?mode=live", { signal });
    },
    render({ evidence, diagnostics }) {
      const coordinated = evidence.coordinatedDemo || {};
      return `<section class="overview-page">
        ${pageHeader({
          eyebrow: "Stellar-native agentic payments",
          title: "Stellar Agent Spend Hub",
          summary: "AI agents pay for digital services while users keep control through explicit authorization, bounded policy, and public receipts.",
          actions: '<a class="primary-button" href="/evidence" data-link>View live evidence</a><a class="secondary-button" href="/spend" data-link>Open Agent Spend</a>',
        })}
        <section class="overview-proof" aria-label="Coordinated USDC proofs">
          <div class="proof-intro"><span class="section-label">Coordinated testnet proof</span><h2>Two payment paths. One trust model.</h2><p>Official MPP proves interoperability. A Soroban Contract Account proves programmable authority.</p></div>
          <div class="proof-grid">${evidenceCard("MPP G-account", coordinated.mpp)}${evidenceCard("Contract Account session", coordinated.contractAccount)}</div>
        </section>
        ${trustFlow()}
        <section class="section-block">
          <div class="section-heading"><div><span class="section-label">Verified foundations</span><h2>Public XLM settlements</h2></div><a class="text-link" href="/evidence" data-link>Inspect all evidence</a></div>
          <div class="foundation-list">${(evidence.verifiedFoundations || []).map(foundationCard).join("")}</div>
        </section>
        ${dependencyStrip(diagnostics.dependencies)}
      </section>`;
    },
    bind() {},
    destroy() {},
  };
}
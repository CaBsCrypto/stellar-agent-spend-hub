import { pageHeader, evidenceCard, foundationCard, lifecycleRow, dependencyStrip, trustFlow } from "../components.mjs";
import { escapeHtml, queryValue } from "../format.mjs";

export function createPage() {
  return {
    async load({ store, signal, url }) {
      const mode = queryValue(url, "mode", "live") === "replay" ? "replay" : "live";
      const payload = await store.load(`overview:${mode}`, `/api/overview?mode=${mode}`, { signal });
      return { ...payload, mode };
    },
    render({ evidence, diagnostics, mode }) {
      const coordinated = evidence.coordinatedDemo || {};
      const lifecycle = evidence.contractAccountLifecycle || {};
      return `<section>
        ${pageHeader({
          eyebrow: "Public verification",
          title: "Evidence",
          summary: "Verified means a real public transaction exists. Pending evidence never carries a fabricated hash.",
          actions: `<div class="segmented-control" role="group" aria-label="Evidence mode"><a href="/evidence?mode=live" data-link aria-current="${mode === "live" ? "true" : "false"}">Live</a><a href="/evidence?mode=replay" data-link aria-current="${mode === "replay" ? "true" : "false"}">Replay</a></div>`,
        })}
        <div class="notice ${mode === "replay" ? "pending" : "verified"}"><strong>${mode === "replay" ? "Replay is read-only" : "Live evidence"}</strong><span>${escapeHtml(evidence.generatedAt)}</span><p>No signing or settlement is available from this route.</p></div>
        <div class="proof-grid">${evidenceCard("MPP G-account", coordinated.mpp)}${evidenceCard("Contract Account session", coordinated.contractAccount)}</div>
${trustFlow()}
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Passkey Contract Account</span><h2>Acceptance lifecycle</h2></div><span>${escapeHtml(lifecycle.status || "pending")}</span></div><div class="foundation-list">${lifecycleRow("Deploy", lifecycle.deploy)}${lifecycleRow("Fund 0.02 USDC", lifecycle.funding)}${lifecycleRow("Passkey grant", lifecycle.grant)}${lifecycleRow("Session payment", lifecycle.payment)}${lifecycleRow("Owner revoke", lifecycle.revoke)}</div><div class="notice ${lifecycle.gatesClosed ? "verified" : "pending"}"><strong>Replay and gates</strong><p>First submit ${escapeHtml(lifecycle.replay?.firstSubmitStatus || "-")}; identical replay ${escapeHtml(lifecycle.replay?.replaySubmitStatus || "-")}. Gates ${lifecycle.gatesClosed ? "closed" : "open"}.</p></div></section>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Stellar testnet</span><h2>Verified foundations</h2></div><a class="text-link" href="/api/evidence" target="_blank" rel="noreferrer">Open raw manifest</a></div><div class="foundation-list">${(evidence.verifiedFoundations || []).map(foundationCard).join("")}</div></section>
        <section class="section-block"><div class="section-heading"><div><span class="section-label">Infrastructure</span><h2>Dependency diagnostics</h2></div><a class="text-link" href="/api/diagnostics/public" target="_blank" rel="noreferrer">Open diagnostics</a></div>${dependencyStrip(diagnostics.dependencies)}</section>
      </section>`;
    },
    bind() {},
    destroy() {},
  };
}
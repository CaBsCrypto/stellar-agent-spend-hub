import { pageHeader, metric, statusPill, emptyState } from "../components.mjs";
import { escapeHtml, shortHash } from "../format.mjs";
import { PrivyAdapter, readOAuthCallback } from "../privyAdapter.mjs";
import { inspectX402Challenge, payX402Resource } from "../baseX402Client.mjs";

export function createPage() {
  let clickHandler;
  let boundOutlet;
  let privy;
  let inspectedPayment = null;
  let preparedBridge = null;

  return {
    async load({ store, signal }) {
      const [chains, treasury] = await Promise.all([
        store.load("chains", "/api/chains", { signal }),
        store.load("treasury", "/api/treasury", { signal }),
      ]);
      privy ||= new PrivyAdapter();
      await privy.initialize();
      const callback = readOAuthCallback();
      if (callback) {
        await privy.completeGoogleOAuth(callback);
        history.replaceState({}, "", "/treasury");
      }
      return {
        chains,
        treasury,
        privy: privy.getState(),
        inspectedPayment,
        preparedBridge,
      };
    },
    render(data) {
      const base = data.chains.chains.find((chain) => chain.network === "eip155:84532");
      const avalanche = data.chains.chains.find((chain) => chain.network === "eip155:43113");
      const stellar = data.chains.chains.find((chain) => chain.network === "stellar:testnet");
      const x402 = data.chains.baseX402 || {};
      const cctp = data.treasury.bridge || {};
      return `<section>
        ${pageHeader({ eyebrow: "Stellar-first multichain control", title: "Treasury", summary: "One policy surface for separate Stellar and EVM authorities, with explicit routing and supervised liquidity movement." })}
        <div class="metric-grid">${metric("Stellar", stellar?.enabled ? "Primary" : "Unavailable", "MPP + Contract Account")}${metric("Base Sepolia", base?.enabled ? "Ready" : "Guarded", "x402 execution")}${metric("Avalanche Fuji", avalanche?.submitEnabled ? "Ready" : "Dry run", "No settlement")}${metric("Auto bridge", "Off", "Separate BridgeIntent")}</div>
        <div class="treasury-grid">
          ${identityPanel(data.privy)}
          ${networkPanel(data.chains.chains)}
        </div>
        <div class="treasury-grid">
          ${x402Panel(x402, data.inspectedPayment, data.privy)}
          ${bridgePanel(cctp, data.preparedBridge, data.privy)}
        </div>
      </section>`;
    },
    bind(outlet, data, context) {
      clickHandler = async (event) => {
        const button = event.target.closest("[data-treasury-action]");
        if (!button) return;
        button.disabled = true;
        try {
          const action = button.dataset.treasuryAction;
          if (action === "email-send") {
            await privy.sendEmailCode(value(outlet, "[data-privy-email]"));
            context.showToast("Privy verification code sent.");
          } else if (action === "email-login") {
            await privy.loginWithEmail(
              value(outlet, "[data-privy-email]"),
              value(outlet, "[data-privy-code]"),
            );
            context.showToast("Privy wallet connected.");
          } else if (action === "google-login") {
            await privy.loginWithGoogle();
            return;
          } else if (action === "logout") {
            await privy.logout();
            inspectedPayment = null;
            preparedBridge = null;
          } else if (action === "x402-inspect") {
            const tx = value(outlet, "[data-base-tx]");
            const expectedRecipient = data.chains.baseX402?.recipient;
            inspectedPayment = await inspectX402Challenge(
              `/api/x402/base-risk?tx=${encodeURIComponent(tx)}`,
              { expectedRecipient },
            );
            context.showToast("Base x402 quote verified. Review before signing.");
          } else if (action === "x402-pay") {
            if (!inspectedPayment) throw new Error("Inspect the x402 challenge first.");
            const signer = await privy.getX402Signer();
            const tx = value(outlet, "[data-base-tx]");
            await payX402Resource(`/api/x402/base-risk?tx=${encodeURIComponent(tx)}`, {
              signer,
              expectedRecipient: data.chains.baseX402?.recipient,
            });
            inspectedPayment = null;
            context.store.invalidate("treasury", "chains");
            context.showToast("Base x402 payment settled and verified.");
          } else if (action === "bridge-prepare") {
            if (!data.privy.walletAddress) throw new Error("Connect Privy before preparing CCTP.");
            const created = await context.api("/api/bridges", {
              method: "POST",
              body: JSON.stringify({ sourceAddress: data.privy.walletAddress, amount: "1" }),
            });
            preparedBridge = await context.api(`/api/bridges/${created.bridge.id}/prepare`, {
              method: "POST",
              body: "{}",
            });
            context.showToast("CCTP burn prepared. Verify every destination field.");
          } else if (action === "bridge-submit") {
            if (!preparedBridge) throw new Error("Prepare the bridge first.");
            if (!data.chains.gates.cctpSubmit) throw new Error("CCTP submit gate is closed.");
            let burnHash;
            for (const transaction of preparedBridge.transactions) {
              const hash = await privy.sendTransaction({
                to: transaction.to,
                data: transaction.data,
                value: transaction.value,
              });
              if (transaction.step === "burn") burnHash = hash;
            }
            await context.api(`/api/bridges/${preparedBridge.intent.id}/record-burn`, {
              method: "POST",
              body: JSON.stringify({ transactionHash: burnHash }),
            });
            preparedBridge = null;
            context.showToast("CCTP burn recorded. Circle forwarding is being monitored.");
          }
          context.store.invalidate("treasury", "chains");
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

function identityPanel(privy) {
  if (privy.authenticated) {
    return `<section class="panel"><div class="section-heading"><div><span class="section-label">EVM authority</span><h2>Privy embedded wallet</h2></div>${statusPill("connected")}</div><dl class="definition-list"><div><dt>Address</dt><dd><code>${escapeHtml(privy.walletAddress)}</code></dd></div><div><dt>Networks</dt><dd>Base Sepolia, Avalanche Fuji</dd></div><div><dt>Custody</dt><dd>User controlled</dd></div></dl><button class="secondary-button" data-treasury-action="logout">Disconnect</button></section>`;
  }
  return `<section class="panel"><div class="section-heading"><div><span class="section-label">EVM authority</span><h2>Connect Privy</h2></div>${statusPill(privy.status)}</div><div class="form-stack"><label>Email<input type="email" autocomplete="email" data-privy-email placeholder="you@example.com"></label><div class="button-row"><button class="secondary-button" data-treasury-action="email-send" ${privy.configured ? "" : "disabled"}>Send code</button><button class="secondary-button" data-treasury-action="google-login" ${privy.configured ? "" : "disabled"}>Continue with Google</button></div><label>Verification code<input inputmode="numeric" autocomplete="one-time-code" data-privy-code placeholder="000000"></label><button class="primary-button" data-treasury-action="email-login" ${privy.configured ? "" : "disabled"}>Verify and connect</button></div></section>`;
}

function networkPanel(chains) {
  return `<section class="panel"><div class="section-heading"><div><span class="section-label">Chain registry</span><h2>Execution networks</h2></div>${statusPill("testnet")}</div><div class="network-list">${chains.map((chain) => `<article class="network-row"><div><strong>${escapeHtml(chain.name)}</strong><small>${escapeHtml(chain.network)}</small></div><div><span>${escapeHtml(chain.asset.symbol)}</span>${statusPill(chain.submitEnabled ? "submit-ready" : chain.enabled ? "preview" : "guarded")}</div></article>`).join("")}</div></section>`;
}

function x402Panel(readiness, inspected, privy) {
  return `<section class="panel"><div class="section-heading"><div><span class="section-label">Base x402</span><h2>Paid risk API</h2></div>${statusPill(readiness.status || "disabled")}</div><div class="form-stack"><label>Base Sepolia transaction<input data-base-tx placeholder="0x..."></label><div class="button-row"><button class="secondary-button" data-treasury-action="x402-inspect" ${readiness.enabled ? "" : "disabled"}>Inspect challenge</button><button class="primary-button" data-treasury-action="x402-pay" ${inspected && privy.authenticated ? "" : "disabled"}>Confirm 0.01 USDC</button></div>${inspected ? `<div class="quote-summary"><strong>${escapeHtml(inspected.summary.amount)} USDC</strong><span>${escapeHtml(inspected.summary.network)}</span><code>${escapeHtml(shortHash(inspected.summary.recipient))}</code></div>` : emptyState("No active quote", "Inspect a valid Base Sepolia transaction before signing.")}</div></section>`;
}

function bridgePanel(readiness, prepared, privy) {
  return `<section class="panel"><div class="section-heading"><div><span class="section-label">CCTP Standard</span><h2>Base to Stellar</h2></div>${statusPill(readiness.status || "disabled")}</div><dl class="definition-list"><div><dt>Amount</dt><dd>1 USDC</dd></div><div><dt>Destination</dt><dd>Dedicated Stellar treasury</dd></div><div><dt>Forwarding</dt><dd>Circle CctpForwarder</dd></div></dl><div class="button-row"><button class="secondary-button" data-treasury-action="bridge-prepare" ${readiness.enabled && privy.authenticated ? "" : "disabled"}>Prepare bridge</button><button class="primary-button" data-treasury-action="bridge-submit" ${prepared && readiness.submitEnabled ? "" : "disabled"}>Confirm burn</button></div>${prepared ? `<div class="notice pending"><strong>Burn prepared</strong><p>${escapeHtml(prepared.intent.amount)} USDC to ${escapeHtml(shortHash(prepared.intent.destinationAddress))}</p></div>` : ""}</section>`;
}

function value(outlet, selector) {
  return outlet.querySelector(selector)?.value?.trim() || "";
}

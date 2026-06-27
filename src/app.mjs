import { money, ReceiptStatus } from "./domain.mjs";
import { TempoAdapter } from "./tempoAdapter.mjs";
import { CircleX402Adapter } from "./circleX402Adapter.mjs";

const state = {
  data: null,
  selectedIntentId: null,
  directoryQuery: "mcp",
  lastPreparedPayment: null,
  tempoBenchmark: TempoAdapter.benchmark(),
  circleBenchmark: CircleX402Adapter.benchmark(),
  mppReceipts: [],
  toast: "",
};

const app = document.querySelector("#app");

await refreshState();
render();

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function refreshState() {
  state.data = await api("/api/state");
  state.mppReceipts = await api("/api/mpp/receipts")
    .then((result) => result.receipts || [])
    .catch(() => []);
  if (!state.selectedIntentId || !state.data.intents.some((intent) => intent.id === state.selectedIntentId)) {
    state.selectedIntentId = state.data.intents[0]?.id || null;
  }
}

function selectedIntent() {
  return state.data.intents.find((intent) => intent.id === state.selectedIntentId) || state.data.intents[0];
}

function selectedEvaluation() {
  return state.data.evaluations[selectedIntent()?.id] || { allowed: false, reasons: ["No intent selected"], evidence: [], trustFlow: [] };
}

function render() {
  const intent = selectedIntent();
  const evaluation = selectedEvaluation();
  const summary = state.data.summary;
  const stellarStatus = state.data.readiness.connectors.stellarTestnet;
  const linkStatus = state.data.readiness.connectors.linkAgentWallet;
  const circleStatus = state.data.readiness.connectors.circleX402;
  const machineChallengeCount = Object.keys(state.data.machineChallenges || {}).length;
  const smartWalletStatus = state.data.readiness.connectors.sorobanSmartWallet;
  const paymentRuntime = state.data.readiness.connectors.paymentRuntime || { mode: "simulated", detail: "Local simulated rail selected." };
  const mppStatus = state.data.readiness.connectors.mpp || { status: "disabled", detail: "Official MPP Charge is disabled." };
  const latestMppReceipt = state.mppReceipts[0] || null;

  app.innerHTML = `
    <main class="shell">
      <section class="hero spend-hero">
        <div class="hero-copy">
          <p class="eyebrow">Stellar Agent Spend Hub | Functional local API | Privacy-first</p>
          <h1>Pagos agenticos y acciones crypto sin filtrar datos privados</h1>
          <p class="hero-text">
            El agente descubre servicios, crea intentos persistidos, genera proofs demo, valida policy/LCP
            y exige confirmacion humana antes de cualquier settlement testnet.
          </p>
        </div>
        <div class="wallet-strip" aria-label="Estado de wallet">
          <div><span class="label">Modo activo</span><strong>Training + Privacy</strong></div>
          <div><span class="label">API local</span><strong>/api/state</strong></div>
          <div><span class="label">Autopilot</span><strong>Bloqueado v1</strong></div>
        </div>
      </section>

      <section class="metrics" aria-label="Metricas de piloto">
        ${metric("Intentos listos", summary.ready, `${summary.blocked} bloqueados por policy/privacy`)}
        ${metric("Directory providers", summary.providers, "Stripe Directory / MPP pattern")}
        ${metric("Recibos", summary.receipts, "persistidos localmente")}
        ${metric("Privacy depth", "Commitments", "ZK proof demo, sin PII")}
        ${metric("Smart wallet", smartWalletStatus.status, smartWalletStatus.detail)}
        ${metric("Stellar readiness", stellarStatus.status, state.data.readiness.status)}
        ${metric("Link wallet", linkStatus.status, "Fiat/SPT approval simulation")}
        ${metric("Legacy 402", machineChallengeCount, "deshabilitable en produccion")}
        ${metric("MPP Charge", mppStatus.status, "USDC testnet oficial")}
        ${metric("Circle x402", circleStatus.status, "USDC agent benchmark")}
      </section>

      <section class="rail-status" aria-label="Rail readiness">
        <article><span class="label">Active rail</span><strong>${paymentRuntime.mode}</strong><small>${paymentRuntime.detail}</small></article>
        <article><span class="label">Soroban wallet</span><strong>${smartWalletStatus.status}</strong><small>${smartWalletStatus.detail}</small></article>
        <article><span class="label">Testnet rail</span><strong>${stellarStatus.status}</strong><small>${stellarStatus.detail}</small></article>
        <article><span class="label">Missing env</span><strong>${stellarStatus.missing?.length || 0}</strong><small>${(stellarStatus.missing || []).join(", ") || "None"}</small></article>
        <article><span class="label">Link Agent Wallet</span><strong>${linkStatus.status}</strong><small>${linkStatus.detail}</small></article>
        <article><span class="label">Circle x402</span><strong>${circleStatus.status}</strong><small>${circleStatus.detail}</small></article>
        <article><span class="label">Official MPP</span><strong>${mppStatus.status}</strong><small>${mppStatus.detail}</small></article>
      </section>

      <section class="mode-grid" aria-label="Modos del producto">
        ${modeCard("Training Mode", "Usuario confirma todo", "active")}
        ${modeCard("Privacy Mode", "Commitments/proofs visibles", "active")}
        ${modeCard("Agent Spend", "MCP/API, servicios y Link", "active")}
        ${modeCard("Machine Payments", "MPP Charge + USDC testnet", mppStatus.ready ? "active" : "guarded")}
        ${modeCard("Soroban Wallet", "limits, allowlist, session key", "active")}
        ${modeCard("Portfolio Actions", "Swap y DeFi bajo policy", "active")}
      </section>

      <section class="panel mpp-proof-panel">
        <div class="panel-heading split">
          <div><p class="eyebrow">Official Stellar MPP Charge</p><h2>Stellar Risk API</h2></div>
          <strong>${mppStatus.price || "0.01"} USDC</strong>
        </div>
        ${latestMppReceipt
          ? `<div class="review-summary approved"><span>Latest settlement</span><strong>${latestMppReceipt.amount} ${latestMppReceipt.asset}</strong><small>${latestMppReceipt.network} | ${latestMppReceipt.protocol}</small><a href="https://stellar.expert/explorer/testnet/tx/${latestMppReceipt.transactionHash}" target="_blank" rel="noreferrer">Verify transaction</a></div>`
          : `<div class="review-summary blocked"><span>No public MPP settlement yet</span><strong>${mppStatus.status}</strong><small>Seller remains testnet-only and buyer signing stays local.</small></div>`}
      </section>
      <section class="trust-flow" aria-label="Flujo privacy-first">
        ${evaluation.trustFlow.map((step) => trustStep(step)).join("")}
      </section>

      <section class="workspace">
        <aside class="panel policy-panel">
          <div class="panel-heading"><p class="eyebrow">Spending + Privacy Constitution</p><h2>Reglas activas</h2></div>
          ${policyRow("Limite diario", money(state.data.policy.dailyLimit))}
          ${policyRow("Max por pago", money(state.data.policy.perPaymentLimit))}
          ${policyRow("Portfolio max", money(state.data.policy.maxPortfolioActionAmount))}
          ${policyRow("Slippage max", `${state.data.policy.maxSlippageBps} bps`)}
          ${policyRow("Assets", state.data.policy.allowedAssets.join(", "))}
          ${policyRow("Confirmacion", "Siempre requerida")}
          <div class="security-note"><strong>PII Firewall</strong><p>RUT, telefono, email, numeros de cuenta, card data y client secrets quedan prohibidos en memos, logs, receipts y metadata.</p></div>
        </aside>

        <section class="panel">
          <div class="panel-heading split">
            <div><p class="eyebrow">Agent Spend Queue</p><h2>Pagos y acciones propuestas</h2></div>
            <button class="ghost-button" data-action="prepare">Preparar intento</button>
          </div>
          <div class="intent-list">${state.data.intents.map((item) => intentCard(item)).join("")}</div>
        </section>

        <section class="panel review-panel">
          <div class="panel-heading"><p class="eyebrow">Revision</p><h2>${intent?.providerName || "Sin intento"}</h2></div>
          ${intent ? reviewBlock(intent, evaluation) : ""}
        </section>
      </section>

      <section class="lower-grid">
        <section class="panel">
          <div class="panel-heading split">
            <div><p class="eyebrow">Provider Directory</p><h2>Discovery estructurado</h2></div>
            <div class="directory-actions">
              <input value="${escapeAttr(state.directoryQuery)}" data-field="directory-query" aria-label="Buscar proveedores" />
              <button class="ghost-button" data-action="search-directory">Buscar</button>
            </div>
          </div>
          <div class="provider-grid">${state.data.providers.map((provider) => providerCard(provider)).join("")}</div>
        </section>

        <section class="panel">
          <div class="panel-heading"><p class="eyebrow">Auditoria sin PII</p><h2>Recibos y proof hashes</h2></div>
          <div class="receipt-list">${state.data.receipts.map((receipt) => receiptRow(receipt)).join("")}</div>
        </section>
      </section>

      <section class="lower-grid">
        <section class="panel">
          <div class="panel-heading"><p class="eyebrow">Machine Payments 402</p><h2>Challenge, approve, retry</h2></div>
          ${machinePaymentPanel(machineChallengeCount)}
        </section>
        <section class="panel tempo-panel compact-tempo"><div><p class="eyebrow">x402 ecosystem benchmark</p><h2>Circle / Tempo como comparadores</h2></div><div class="tempo-grid">${state.tempoBenchmark.slice(0, 2).map((item) => tempoItem(item)).join("")}${state.circleBenchmark.slice(0, 2).map((item) => circleItem(item)).join("")}</div></section>
      </section>

      <section class="lower-grid">
        <section class="panel">
          <div class="panel-heading"><p class="eyebrow">LatAm bill pay roadmap</p><h2>Cuentas IRL bloqueadas hasta ZK proof</h2></div>
          <div class="bill-grid">${state.data.roadmapAccounts.map((account) => billCard(account)).join("")}</div>
        </section>
      </section>
    </main>
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `;

  bindEvents();
}

function metric(title, value, detail) {
  return `<article class="metric"><span>${title}</span><strong>${value}</strong><small>${detail}</small></article>`;
}

function modeCard(title, detail, status) {
  return `<article class="mode-card ${status}"><strong>${title}</strong><span>${detail}</span></article>`;
}

function policyRow(label, value) {
  return `<div class="policy-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function trustStep(step) {
  return `<article class="trust-step ${step.status}"><span>${step.stage}</span><strong>${step.status}</strong><small>${step.label}</small></article>`;
}

function intentCard(intent) {
  const evaluation = state.data.evaluations[intent.id];
  const selected = intent.id === state.selectedIntentId ? "selected" : "";
  return `
    <button class="intent-card ${selected}" data-action="select-intent" data-id="${intent.id}">
      <span class="intent-top"><strong>${intent.providerName}</strong><span class="risk ${intent.riskLevel}">${intent.intentType}</span></span>
      <span>${intent.category} | ${money(intent.amount, intent.currency)}</span>
      <span>status ${intent.status || "created"} | proof ${intent.proofStatus}</span>
      <span>privacy ${evaluation.privacyDecision?.privacyLevel || intent.privacyRequirement}</span>
      <span class="intent-bottom"><strong>${evaluation.allowed ? "Ready" : "Blocked"}</strong><em>${evaluation.allowed ? "requiere passkey" : evaluation.reasons[0]}</em></span>
    </button>`;
}

function reviewBlock(intent, evaluation) {
  const spendRequest = state.data.spendRequests?.[intent.id];
  return `
    <div class="review-summary ${evaluation.allowed ? "approved" : "blocked"}"><span>${evaluation.allowed ? "Permitido por policy + privacy" : "No se puede enviar"}</span><strong>${money(intent.amount, intent.currency)}</strong><small>${intent.intentType} | ${intent.status || "created"} | passkey requerida</small></div>
    <div class="reason-box"><span class="label">Razon del agente</span><p>${intent.agentReason}</p></div>
    <div class="legal-box ${evaluation.legalDecision?.allowed ? "approved" : "blocked"}"><span class="label">Legal Context Protocol</span><strong>${evaluation.legalDecision?.snapshot ? `Level ${evaluation.legalDecision.trustLevel}` : "Sin LCP"}</strong><code>${evaluation.legalDecision?.termsHash || "No terms hash"}</code></div>
    <div class="privacy-box ${evaluation.privacyDecision?.allowed ? "approved" : "blocked"}"><span class="label">Privacy / ZK proof demo</span><strong>${evaluation.privacyDecision?.privacyLevel || intent.privacyRequirement}</strong><code>${evaluation.privacyDecision?.commitment || intent.secretRefCommitment || "No commitment required"}</code><code>${evaluation.privacyDecision?.proofHash || "No proof hash"}</code></div>
    ${actionBox(evaluation)}
    ${linkSpendBox(spendRequest)}
    <div class="check-list">${(evaluation.allowed ? evaluation.evidence : evaluation.reasons).map((item) => `<div><span>${evaluation.allowed ? "OK" : "!"}</span>${item}</div>`).join("")}</div>
    <div class="prepared-box"><span class="label">Intent preparado</span><code>${state.lastPreparedPayment ? state.lastPreparedPayment.memo || state.lastPreparedPayment.id : "Aun no preparado"}</code></div>
    <div class="button-row">
      <button class="ghost-button" data-action="proof" ${intent.proofRequired ? "" : "disabled"}>Generar proof demo</button>
      <button class="primary-button" data-action="approve" ${evaluation.allowed ? "" : "disabled"}>Confirmar pago</button>
    </div>`;
}

function linkSpendBox(spendRequest) {
  if (!spendRequest) return "";
  return `<div class="link-box approved"><span class="label">Link spend request</span><strong>${spendRequest.status}</strong><code>${spendRequest.id}</code><code>${spendRequest.credentialType}</code></div>`;
}

function actionBox(evaluation) {
  const decision = evaluation.defiDecision?.allocation ? evaluation.defiDecision : evaluation.cryptoDecision;
  if (!decision?.action && !decision?.allocation) return "";
  return `<div class="action-box ${decision.allowed ? "approved" : "blocked"}"><span class="label">Portfolio action</span><strong>${decision.action?.asset || decision.allocation?.strategy || "prepared"}</strong><code>${decision.action ? JSON.stringify(decision.action) : JSON.stringify(decision.allocation)}</code></div>`;
}

function providerCard(provider) {
  return `<article class="provider-card"><strong>${provider.name}</strong><span>${provider.category} | ${provider.paymentMethod}</span><small>${provider.endpoint}</small><em>${provider.privacyRequirement}</em><button class="ghost-button" data-action="create-intent" data-provider="${provider.providerId}">Crear intento</button></article>`;
}


function machinePaymentPanel(challengeCount) {
  return `<div class="machine-panel">
    <article><span class="label">First request</span><strong>402 Payment Required</strong><code>GET /api/machine-resource/browserbase-mcp?resource=browser-session-demo</code></article>
    <article><span class="label">Agent loop</span><strong>prepare + approve</strong><code>POST /api/intents/:id/prepare</code><code>POST /api/intents/:id/approve</code></article>
    <article><span class="label">Retry credential</span><strong>receipt:&lt;id&gt;</strong><code>X-Payment-Credential</code></article>
    <article><span class="label">Challenges</span><strong>${challengeCount}</strong><code>stored without PII</code></article>
  </div>`;
}
function billCard(account) {
  return `<article class="bill-card"><span class="bill-icon">ZK</span><div><strong>${account.alias}</strong><span>${account.providerName}</span><small>${account.domain} | ${account.customerRefCommitment}</small></div><em>${account.verificationStatus.replace("_", " ")}</em></article>`;
}

function receiptRow(receipt) {
  const status = receipt.status === ReceiptStatus.settled ? "settled" : "blocked";
  return `<article class="receipt ${status}"><div><strong>${receipt.providerName}</strong><span>${formatDate(receipt.timestamp)} | ${receipt.approvedBy}</span><small>${receipt.rail || "No rail"} | ${receipt.network || "No network"} | ${receipt.privacyLevel || "standard"}</small></div><div><strong>${money(receipt.amount, receipt.currency)}</strong><code>${receipt.transactionHash || "sin movimiento onchain"}</code><code>${receipt.proofHash || receipt.termsHash || "sin proof hash"}</code></div></article>`;
}

function circleItem(item) {
  return `<article><strong>${item.criterion}</strong><span>Hub: ${item.ourHub}</span><span>Circle: ${item.circle}</span></article>`;
}

function tempoItem(item) {
  return `<article><strong>${item.criterion}</strong><span>Stellar: ${item.stellar}</span><span>Tempo: ${item.tempo}</span></article>`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(new Date(value));
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function showToast(message) {
  state.toast = message;
  render();
  window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2600);
}

function bindEvents() {
  document.querySelectorAll("[data-action='select-intent']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedIntentId = button.dataset.id;
      state.lastPreparedPayment = null;
      render();
    });
  });

  document.querySelector("[data-field='directory-query']")?.addEventListener("input", (event) => {
    state.directoryQuery = event.target.value;
  });

  document.querySelectorAll("[data-action='create-intent']").forEach((button) => {
    button.addEventListener("click", () => runAction(async () => {
      const providerId = button.dataset.provider;
      const provider = state.data.providers.find((item) => item.providerId === providerId);
      const payload = { providerId, intentType: provider.category };
      if (provider.category === "buy_crypto") payload.asset = "XLM";
      const { intent } = await api("/api/intents", { method: "POST", body: JSON.stringify(payload) });
      state.selectedIntentId = intent.id;
      await refreshState();
      showToast("Intent creado desde directory demo.");
    }));
  });

  document.querySelector("[data-action='search-directory']")?.addEventListener("click", () => runAction(async () => {
    const result = await api(`/api/providers/search?q=${encodeURIComponent(state.directoryQuery)}`);
    showToast(`${result.providers.length} proveedores encontrados.`);
  }));

  document.querySelector("[data-action='prepare']")?.addEventListener("click", () => runAction(async () => {
    const { prepared } = await api(`/api/intents/${state.selectedIntentId}/prepare`, { method: "POST", body: "{}" });
    state.lastPreparedPayment = prepared;
    showToast(prepared.credentialType ? "Solicitud Link creada; espera aprobacion." : "Intent preparado por API local.");
  }));

  document.querySelector("[data-action='proof']")?.addEventListener("click", () => runAction(async () => {
    await api(`/api/intents/${state.selectedIntentId}/proof`, { method: "POST", body: JSON.stringify({ secretRef: `secret:${state.selectedIntentId}`, salt: "demo-salt" }) });
    await refreshState();
    showToast("Proof demo generado sin revelar identificador.");
  }));

  document.querySelector("[data-action='approve']")?.addEventListener("click", () => runAction(async () => {
    await api(`/api/intents/${state.selectedIntentId}/approve`, { method: "POST", body: JSON.stringify({ approvedBy: "user-passkey" }) });
    await refreshState();
    state.lastPreparedPayment = null;
    showToast("Confirmado: recibo persistido sin PII ni credenciales expuestas.");
  }));
}

async function runAction(action) {
  try {
    await action();
    render();
  } catch (error) {
    showToast(error.message);
  }
}

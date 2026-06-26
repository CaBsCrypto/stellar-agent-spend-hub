import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePaymentIntent, IntentType, ReceiptStatus, RiskLevel } from "../src/domain.mjs";
import { CircleX402Adapter } from "../src/circleX402Adapter.mjs";
import { CryptoActionAdapter } from "../src/cryptoActionAdapter.mjs";
import { DeFindexAdapter } from "../src/defindexAdapter.mjs";
import { LegalContextAdapter, sha256Hex } from "../src/legalContextAdapter.mjs";
import { LinkAgentWalletAdapter } from "../src/linkAgentWalletAdapter.mjs";
import { MachinePaymentAdapter } from "../src/machinePaymentAdapter.mjs";
import { runMachinePayment } from "../scripts/machine-agent-client.mjs";
import { buildDoctorReport } from "../scripts/doctor.mjs";
import { buildSorobanCommand, buildSorobanTestnetPlan, runSorobanTestnetDemo } from "../scripts/soroban-testnet-demo.mjs";
import { PrivacyVaultAdapter } from "../src/privacyVaultAdapter.mjs";
import { ProviderDirectoryAdapter } from "../src/providerDirectoryAdapter.mjs";
import { StellarTestnetAdapter } from "../src/paymentRailAdapter.mjs";
import { StellarTestnetRealAdapter, redactPublicKey } from "../src/stellarTestnetRealAdapter.mjs";
import { SorobanSmartWalletAdapter } from "../src/sorobanSmartWalletAdapter.mjs";
import { TempoAdapter } from "../src/tempoAdapter.mjs";
import { ZkCommitmentAdapter } from "../src/zkCommitmentAdapter.mjs";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const termsText = "Demo API terms: pay-per-call service with no PII in metadata.";
const termsUrl = "https://api.example/terms/v1.md";
const legalContextUrl = "https://api.example/.well-known/legal-context.json";
const validTermsHash = await sha256Hex(termsText);

const basePolicy = {
  dailyLimit: 120,
  monthlyLimit: 620,
  perPaymentLimit: 90,
  currency: "USDC",
  requireHumanConfirmation: true,
  autopilotEnabled: false,
  requireLegalContext: true,
  minLegalTrustLevel: 2,
  allowedAssets: ["USDC", "XLM"],
  allowedDefiProtocols: ["defindex"],
  maxPortfolioActionAmount: 75,
  maxSlippageBps: 80,
  allowlistedProviders: ["api-mcp", "stellar-swap", "defindex-vault", "enel-cl"],
  categoryRules: {},
};

const apiIntent = {
  id: "intent-api-test",
  intentType: IntentType.payService,
  providerId: "api-mcp",
  providerName: "API MCP",
  category: "pay_service",
  amount: 18.5,
  currency: "USDC",
  dueDate: "2026-06-25",
  sourceOfFunds: "stellar-smart-wallet-usdc",
  riskLevel: RiskLevel.low,
  destinationAddress: "GCLAPIPAYMENTSIMULATED001",
  legalContextUrl,
  termsUrl,
  privacyRequirement: "no-pii",
  proofRequired: false,
  autopilotRequested: false,
  publicMetadata: { units: "100 calls" },
  agentReason: "Comprar creditos MCP bajo limite.",
};

function legalAdapter(overrides = {}) {
  return new LegalContextAdapter({
    registry: {
      [legalContextUrl]: {
        termsText,
        legalContext: {
          terms: termsUrl,
          atrHash: validTermsHash,
          acceptanceRequired: true,
          trustLevel: 3,
          ...overrides,
        },
      },
    },
  });
}

async function evaluationFor(intent, overrides = {}) {
  const legalDecision = await legalAdapter(overrides.legal || {}).evaluate(intent, overrides.policy || basePolicy);
  const privacyDecision = new ZkCommitmentAdapter().evaluate(intent, overrides.proof || null);
  const cryptoDecision = new CryptoActionAdapter().evaluate(intent, overrides.policy || basePolicy);
  const defiDecision = new DeFindexAdapter().evaluate(intent, overrides.policy || basePolicy);
  return evaluatePaymentIntent(intent, overrides.policy || basePolicy, overrides.receipts || [], {
    now: new Date("2026-06-25T12:00:00Z"),
    legalDecision,
    privacyDecision,
    cryptoDecision,
    defiDecision,
    directoryResult: overrides.directoryResult || { providerId: intent.providerId, name: intent.providerName },
  });
}

test("pago MCP/API aprobado con provider allowlisted, LCP valido y confirmacion humana", async () => {
  const evaluation = await evaluationFor(apiIntent);

  assert.equal(evaluation.allowed, true);
  assert.equal(evaluation.requiresConfirmation, true);
  assert.ok(evaluation.evidence.includes("Proveedor verificado en allowlist"));
  assert.ok(evaluation.evidence.includes("ATR hash verificado"));
  assert.ok(evaluation.evidence.includes("No hay PII en payload publico del intento"));
});

test("bloquea si intenta incluir PII en metadata publica", async () => {
  const evaluation = await evaluationFor({
    ...apiIntent,
    publicMetadata: { customerRef: "cliente:123456789", email: "user@example.com" },
  });

  assert.equal(evaluation.allowed, false);
  assert.ok(evaluation.reasons.some((reason) => reason.includes("Dato sensible detectado")));
});

test("commitment generado no revela customerRef", async () => {
  const vault = new PrivacyVaultAdapter();
  const zk = new ZkCommitmentAdapter();
  const secretRef = "secret:enel:primary";
  const customerRef = "cliente:123456789";
  await vault.storeSecret({ secretRef, plaintext: customerRef, purpose: "bill_pay", providerId: "enel-cl" });
  const proof = await zk.createProof({ providerId: "enel-cl", secretRef, salt: "demo-salt", purpose: "bill_pay" });

  assert.equal(proof.proofStatus, "valid");
  assert.equal(proof.commitment.includes(customerRef), false);
  assert.equal(JSON.stringify(vault.getPublicRecord(secretRef)).includes(customerRef), false);
});

test("pago de cuenta queda bloqueado si proof requerido no existe", async () => {
  const billIntent = {
    ...apiIntent,
    id: "intent-bill-private",
    intentType: IntentType.billPay,
    providerId: "enel-cl",
    providerName: "Enel Chile",
    category: "bill_pay",
    privacyRequirement: "zk-required",
    secretRefCommitment: "0xcommitment",
    proofRequired: true,
  };
  const evaluation = await evaluationFor(billIntent, { proof: null });

  assert.equal(evaluation.allowed, false);
  assert.ok(evaluation.reasons.includes("Proof ZK requerido antes de pagar"));
});

test("pago de cuenta puede pasar policy cuando proof valido coincide", async () => {
  const zk = new ZkCommitmentAdapter();
  const proof = await zk.createProof({ providerId: "enel-cl", secretRef: "secret:enel", salt: "salt", purpose: "bill_pay" });
  const billIntent = {
    ...apiIntent,
    id: "intent-bill-private-valid",
    intentType: IntentType.billPay,
    providerId: "enel-cl",
    providerName: "Enel Chile",
    category: "bill_pay",
    privacyRequirement: "zk-required",
    secretRefCommitment: proof.commitment,
    proofRequired: true,
  };
  const evaluation = await evaluationFor(billIntent, { proof });

  assert.equal(evaluation.allowed, true);
  assert.ok(evaluation.evidence.includes("Proof ZK demo verificado"));
});

test("compra crypto bloqueada si activo no esta allowlisted", async () => {
  const cryptoIntent = {
    ...apiIntent,
    intentType: IntentType.buyCrypto,
    providerId: "stellar-swap",
    providerName: "Stellar DEX Swap",
    category: "buy_crypto",
    cryptoAction: { asset: "DOGE", side: "buy", slippageBps: 40, risk: "medium" },
  };
  const evaluation = await evaluationFor(cryptoIntent);

  assert.equal(evaluation.allowed, false);
  assert.ok(evaluation.reasons.includes("Activo DOGE no esta allowlisted"));
});

test("DeFi allocation bloqueada si supera riesgo permitido v1", async () => {
  const defiIntent = {
    ...apiIntent,
    intentType: IntentType.defiAllocate,
    providerId: "defindex-vault",
    providerName: "DeFindex Vault Placeholder",
    category: "defi_allocate",
    amount: 42,
    defiAllocation: { protocol: "defindex", strategy: "stable-yield-demo", risk: "medium", slippageBps: 60 },
  };
  const evaluation = await evaluationFor(defiIntent);

  assert.equal(evaluation.allowed, false);
  assert.ok(evaluation.reasons.includes("DeFi allocation no-low risk bloqueada en v1"));
});

test("autopilot queda bloqueado en v1", async () => {
  const evaluation = await evaluationFor({ ...apiIntent, autopilotRequested: true });

  assert.equal(evaluation.allowed, false);
  assert.ok(evaluation.reasons.includes("Autopilot deshabilitado en Training Mode v1"));
});

test("recibo final incluye rail, LCP y privacy fields sin PII", async () => {
  const adapter = new StellarTestnetAdapter();
  const evaluation = await evaluationFor(apiIntent);
  const receipt = await adapter.settlePayment(apiIntent, evaluation, "user-passkey");
  const scan = assertNoSensitiveData(receipt, "receipt");

  assert.equal(receipt.status, ReceiptStatus.settled);
  assert.equal(receipt.rail, "Stellar Smart Wallet");
  assert.equal(receipt.network, "stellar:testnet");
  assert.equal(receipt.termsHash, validTermsHash);
  assert.equal(receipt.privacyLevel, "no-pii");
  assert.equal(scan.allowed, true);
});

test("ProviderDirectoryAdapter retorna resultados estructurados", () => {
  const directory = new ProviderDirectoryAdapter({
    providers: [
      { providerId: "api-mcp", name: "API MCP", category: "pay_service", description: "web browsing api", tags: ["mcp"] },
    ],
  });

  const results = directory.search({ query: "web browsing" });

  assert.equal(results.length, 1);
  assert.equal(results[0].providerId, "api-mcp");
});

test("flujo privacy-first expone Discover Privacy Proof Policy Check User Confirm Stellar Settle", async () => {
  const evaluation = await evaluationFor(apiIntent);

  assert.deepEqual(
    evaluation.trustFlow.map((step) => step.stage),
    ["Discover", "Privacy Proof", "Policy Check", "User Confirm", "Stellar Settle"],
  );
});

test("TempoAdapter queda solo como benchmark futuro", async () => {
  const benchmark = TempoAdapter.benchmark();
  const adapter = new TempoAdapter();

  assert.equal(adapter.status, "benchmark-only");
  assert.ok(benchmark.some((item) => item.criterion === "Payment lanes"));
  await assert.rejects(() => adapter.preparePayment(), /benchmark placeholder/);
});
import { SpendHubService } from "../src/spendHubService.mjs";
import { paymentIntents, receipts } from "../src/mockData.mjs";

test("SpendHubService crea intent desde provider directory", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {} } });
  const intent = await service.createIntent({ providerId: "browserbase-mcp" });
  const state = await service.getState();

  assert.equal(intent.providerId, "browserbase-mcp");
  assert.ok(state.intents.some((item) => item.id === intent.id));
});

test("SpendHubService genera proof para bill pay y desbloquea privacy decision", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {} } });
  const billIntent = service.state.intents.find((intent) => intent.id === "intent-enel-private");
  let evaluation = await service.evaluateIntent(billIntent);
  assert.equal(evaluation.allowed, false);
  assert.ok(evaluation.reasons.includes("Proof ZK requerido antes de pagar"));

  await service.generateProof({ intentId: billIntent.id, secretRef: "secret:test-enel", salt: "salt" });
  evaluation = await service.evaluateIntent(billIntent);
  assert.ok(evaluation.evidence.includes("Proof ZK demo verificado"));
});

test("SpendHubService aprueba y persiste recibo permitido", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {} } });
  const readyIntent = service.state.intents.find((intent) => intent.id === "intent-browserbase-mcp");
  const receipt = await service.approveIntent(readyIntent.id, "user-passkey");

  assert.equal(receipt.status, ReceiptStatus.settled);
  assert.equal(service.state.receipts[0].id, receipt.id);
});

test("SpendHubService rechaza aprobacion de DeFindex placeholder bloqueado", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {} } });
  const blockedIntent = service.state.intents.find((intent) => intent.id === "intent-defindex-alloc");

  await assert.rejects(() => service.approveIntent(blockedIntent.id, "user-passkey"), /DeFi allocation no-low risk/);
});

test("SpendHubService respeta idempotencyKey al crear intents", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {}, idempotencyKeys: {} } });
  const first = await service.createIntent({ providerId: "browserbase-mcp", idempotencyKey: "idem-create-1" });
  const second = await service.createIntent({ providerId: "browserbase-mcp", idempotencyKey: "idem-create-1" });

  assert.equal(first.id, second.id);
  assert.equal(service.state.intents.filter((intent) => intent.id === first.id).length, 1);
});

test("SpendHubService prepare actualiza lifecycle a requires_confirmation", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {}, idempotencyKeys: {} } });
  const intent = service.state.intents.find((item) => item.id === "intent-browserbase-mcp");
  const prepared = await service.prepareIntent(intent.id);

  assert.match(prepared.memo, /^spend:/);
  assert.equal(intent.status, "requires_confirmation");
  assert.ok(intent.lastPreparedAt);
});

test("SpendHubService approve es idempotente y no duplica recibos", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {}, idempotencyKeys: {} } });
  const intent = service.state.intents.find((item) => item.id === "intent-browserbase-mcp");
  const first = await service.approveIntent(intent.id, "user-passkey");
  const second = await service.approveIntent(intent.id, "user-passkey");
  const matchingReceipts = service.state.receipts.filter((receipt) => receipt.intentId === intent.id && receipt.status === ReceiptStatus.settled);

  assert.equal(first.id, second.id);
  assert.equal(second.idempotentReplay, true);
  assert.equal(matchingReceipts.length, 1);
  assert.equal(intent.status, "settled");
});

test("connector readiness expone simulacion cuando faltan env vars", async () => {
  const service = new SpendHubService({ seedState: { intents: [], receipts: [], proofs: {}, vaultRecords: {}, idempotencyKeys: {} } });
  const readiness = await service.readiness({});

  assert.equal(readiness.status, "simulated");
  assert.equal(readiness.connectors.localApi.status, "ready");
  assert.equal(readiness.connectors.stellarTestnet.status, "not-ready");
});

test("StellarTestnetRealAdapter redacta public key y detecta SDK faltante", async () => {
  const adapter = new StellarTestnetRealAdapter({
    env: {
      STELLAR_SECRET_KEY: "SSECRETNOTREAL",
      STELLAR_PUBLIC_KEY: "GABCDEF1234567890ZYXWV",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
    },
    sdkLoader: async () => {
      const error = new Error("missing sdk");
      error.code = "ERR_MODULE_NOT_FOUND";
      throw error;
    },
  });
  const readiness = await adapter.readiness();

  assert.equal(redactPublicKey("GABCDEF1234567890ZYXWV"), "GABCDE...0ZYXWV");
  assert.equal(readiness.status, "sdk-missing");
  assert.equal(readiness.secretKeyPresent, true);
  assert.equal(readiness.publicKey, "GABCDE...0ZYXWV");
});

test("SpendHubService railDiagnostics no expone secret key", async () => {
  const service = new SpendHubService({
    seedState: { intents: [], receipts: [], proofs: {}, vaultRecords: {}, idempotencyKeys: {} },
    env: {
      STELLAR_SECRET_KEY: "SSECRETNOTREAL",
      STELLAR_PUBLIC_KEY: "GABCDEF1234567890ZYXWV",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
    },
  });
  const diagnostics = await service.railDiagnostics();
  const serialized = JSON.stringify(diagnostics);

  assert.equal(serialized.includes("SSECRETNOTREAL"), false);
  assert.ok(serialized.includes("GABCDE...0ZYXWV"));
});
test("LinkAgentWalletAdapter crea spend request sin exponer credenciales", async () => {
  const adapter = new LinkAgentWalletAdapter();
  const spendRequest = await adapter.createSpendRequest({
    ...apiIntent,
    id: "intent-link-test",
    providerId: "link-commerce-demo",
    providerName: "Link Commerce Demo",
    currency: "USD",
    paymentMethod: "link-agent-wallet-simulated",
    linkPaymentMode: "shared_payment_token",
  });
  const approved = await adapter.approveSpendRequest(spendRequest, "link-biometric-simulated");
  const serialized = JSON.stringify(approved);

  assert.equal(spendRequest.status, "approval_required");
  assert.equal(approved.paymentCredential.type, "shared_payment_token");
  assert.equal(approved.paymentCredential.piiExposed, false);
  assert.equal(assertNoSensitiveData(approved, "approvedLinkSpendRequest").allowed, true);
  assert.equal(serialized.includes("pan"), false);
});

test("SpendHubService prepare para Link crea solicitud de gasto aprobable", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {}, spendRequests: {}, idempotencyKeys: {} } });
  const intent = service.state.intents.find((item) => item.id === "intent-link-commerce");
  const spendRequest = await service.prepareIntent(intent.id);

  assert.equal(spendRequest.status, "approval_required");
  assert.equal(spendRequest.credentialType, "shared_payment_token");
  assert.equal(intent.status, "approval_required");
  assert.equal(service.state.spendRequests[intent.id].id, spendRequest.id);
});

test("SpendHubService aprueba Link y crea recibo sin credenciales sensibles", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {}, spendRequests: {}, idempotencyKeys: {} } });
  const intent = service.state.intents.find((item) => item.id === "intent-link-commerce");
  await service.prepareIntent(intent.id);
  const receipt = await service.approveIntent(intent.id, "link-biometric-simulated");
  const serialized = JSON.stringify({ receipt, spendRequest: service.state.spendRequests[intent.id] });

  assert.equal(receipt.status, ReceiptStatus.settled);
  assert.equal(receipt.rail, "Link Agent Wallet");
  assert.equal(receipt.network, "fiat:link-simulated");
  assert.equal(receipt.finality, "approval-gated-simulated");
  assert.equal(assertNoSensitiveData(receipt, "receipt").allowed, true);
  assert.equal(serialized.includes("SSECRET"), false);
});
test("MachinePaymentAdapter crea challenge 402 sin PII", () => {
  const adapter = new MachinePaymentAdapter();
  const challenge = adapter.createChallenge({
    provider: { providerId: "api-mcp", name: "API MCP", paymentMethod: "stellar-usdc-simulated" },
    intent: { id: "intent-machine-test", amount: 2.5, currency: "USDC" },
    resourceId: "dataset-demo",
  });

  assert.equal(challenge.status, 402);
  assert.equal(challenge.paymentRequest.retryHeader, "X-Payment-Credential");
  assert.equal(challenge.paymentRequest.credentialFormat, "receipt:<receiptId>");
  assert.equal(assertNoSensitiveData(challenge, "challenge").allowed, true);
});

test("SpendHubService expone flujo machine payment 402 y entrega recurso con receipt", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {}, spendRequests: {}, machineChallenges: {}, idempotencyKeys: {} } });
  const challengeResponse = await service.requestMachineResource({ providerId: "browserbase-mcp", resourceId: "browser-session-demo", amount: 9 });

  assert.equal(challengeResponse.status, 402);
  assert.equal(challengeResponse.challenge.paymentRequest.retryHeader, "X-Payment-Credential");

  const intentId = challengeResponse.challenge.paymentRequest.intentId;
  await service.prepareIntent(intentId);
  const receipt = await service.approveIntent(intentId, "user-passkey");
  const resourceResponse = await service.requestMachineResource({
    providerId: "browserbase-mcp",
    resourceId: "browser-session-demo",
    credential: `receipt:${receipt.id}`,
  });

  assert.equal(resourceResponse.status, 200);
  assert.equal(resourceResponse.resource.providerId, "browserbase-mcp");
  assert.equal(resourceResponse.receipt.id, receipt.id);
  assert.equal(assertNoSensitiveData(resourceResponse, "machineResource").allowed, true);
});

test("SpendHubService rechaza machine payment con receipt de otro provider", async () => {
  const service = new SpendHubService({ seedState: { intents: [...paymentIntents], receipts: [...receipts], proofs: {}, vaultRecords: {}, spendRequests: {}, machineChallenges: {}, idempotencyKeys: {} } });
  const receipt = await service.approveIntent("intent-browserbase-mcp", "user-passkey");
  const rejected = await service.requestMachineResource({
    providerId: "exa-api",
    resourceId: "search-demo",
    credential: `receipt:${receipt.id}`,
  });

  assert.equal(rejected.status, 402);
  assert.equal(rejected.error, "Payment credential rejected");
  assert.equal(rejected.challenge.providerId, "exa-api");
});
test("machine-agent-client consume el ciclo 402 completo", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return fakeJsonResponse(402, {
        status: 402,
        challenge: {
          paymentRequest: {
            intentId: "intent-agent-client",
            prepareUrl: "/api/intents/intent-agent-client/prepare",
            approveUrl: "/api/intents/intent-agent-client/approve",
          },
        },
      });
    }
    if (calls.length === 2) {
      return fakeJsonResponse(200, { prepared: { rail: "Stellar Smart Wallet" } });
    }
    if (calls.length === 3) {
      return fakeJsonResponse(200, { receipt: { id: "receiptagentclient", rail: "Stellar Smart Wallet", providerId: "browserbase-mcp" } });
    }
    return fakeJsonResponse(200, {
      status: 200,
      resource: { id: "browser-session-demo", providerId: "browserbase-mcp" },
      receipt: { id: "receiptagentclient", rail: "Stellar Smart Wallet" },
    });
  };

  try {
    const result = await runMachinePayment({
      baseUrl: "http://localhost:4179",
      providerId: "browserbase-mcp",
      resource: "browser-session-demo",
      amount: "9",
      approvedBy: "user-passkey",
    });

    assert.equal(result.ok, true);
    assert.equal(result.challengeStatus, 402);
    assert.equal(result.receiptId, "receiptagentclient");
    assert.equal(result.resourceStatus, 200);
    assert.equal(result.privacy.sensitivePayloadAllowed, true);
    assert.equal(calls[3].options.headers["X-Payment-Credential"], "receipt:receiptagentclient");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("machine-agent-client falla si el recurso no responde 402 primero", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => fakeJsonResponse(200, { status: 200 });

  try {
    await assert.rejects(
      () => runMachinePayment({ baseUrl: "http://localhost:4179", providerId: "browserbase-mcp", resource: "demo", amount: "1", approvedBy: "user" }),
      /Expected 402 challenge/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function fakeJsonResponse(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
test("doctor report no bloquea modo local cuando Stellar testnet no esta listo", () => {
  const report = buildDoctorReport({
    state: {
      readiness: { connectors: { localApi: { status: "ready", detail: "ok" } } },
      providers: [{ providerId: "browserbase-mcp" }],
      intents: [{ id: "intent" }],
      receipts: [],
      summary: { ready: 1, blocked: 0 },
    },
    diagnostics: {
      testnet: { status: "not-ready", reason: "Missing env", missing: ["STELLAR_SECRET_KEY"], publicKey: null, horizonUrl: null },
      linkAgentWallet: { status: "simulated", detail: "simulated" },
    },
    runtimeStateScan: { allowed: true, findings: [], reasons: [] },
  });

  assert.equal(report.ok, true);
  assert.equal(report.mode, "local-functional-simulated");
  assert.ok(report.nextSteps.some((step) => step.includes("STELLAR_SECRET_KEY")));
});

test("doctor report falla si runtime state contiene datos sensibles", () => {
  const report = buildDoctorReport({
    state: {
      readiness: { connectors: { localApi: { status: "ready", detail: "ok" } } },
      providers: [{ providerId: "browserbase-mcp" }],
      intents: [],
      receipts: [],
      summary: { ready: 0, blocked: 0 },
    },
    diagnostics: {
      testnet: { status: "not-ready", reason: "Missing env", missing: [], publicKey: null, horizonUrl: null },
      linkAgentWallet: { status: "simulated", detail: "simulated" },
    },
    runtimeStateScan: { allowed: false, findings: [{ type: "email", path: "runtimeState.user" }], reasons: ["Dato sensible detectado en runtimeState.user: email"] },
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.find((check) => check.id === "privacy_runtime_state").status, "blocked");
});
test("CircleX402Adapter queda como benchmark futuro no ejecutable", async () => {
  const adapter = new CircleX402Adapter();
  const readiness = adapter.readiness({});
  const benchmark = CircleX402Adapter.benchmark();

  assert.equal(readiness.status, "benchmark-only");
  assert.equal(readiness.dependency, "@circle-fin/x402-batching");
  assert.ok(benchmark.some((item) => item.criterion === "x402 seller middleware"));
  await assert.rejects(() => adapter.preparePayment(), /benchmark placeholder/);
});

test("doctor report expone Circle x402 como benchmark no bloqueante", () => {
  const report = buildDoctorReport({
    state: {
      readiness: { connectors: { localApi: { status: "ready", detail: "ok" } } },
      providers: [{ providerId: "browserbase-mcp" }],
      intents: [],
      receipts: [],
      summary: { ready: 0, blocked: 0 },
    },
    diagnostics: {
      testnet: { status: "not-ready", reason: "Missing env", missing: [], publicKey: null, horizonUrl: null },
      linkAgentWallet: { status: "simulated", detail: "simulated" },
      circleX402: { status: "benchmark-only", detail: "benchmark", dependency: "@circle-fin/x402-batching" },
    },
    runtimeStateScan: { allowed: true, findings: [], reasons: [] },
  });

  const circleCheck = report.checks.find((check) => check.id === "circle_x402");
  assert.equal(report.ok, true);
  assert.equal(circleCheck.status, "benchmark-only");
  assert.equal(circleCheck.benchmarkOnly, true);
});
test("StellarTestnetRealAdapter queda ready en dry-run con SDK y keypair validos", async () => {
  const adapter = new StellarTestnetRealAdapter({
    env: {
      STELLAR_SECRET_KEY: "SFAKETESTSECRET",
      STELLAR_PUBLIC_KEY: "GFAKETESTPUBLIC",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
      STELLAR_SUBMIT_ENABLED: "false",
    },
    sdkLoader: async () => fakeStellarSdk({ secret: "SFAKETESTSECRET", publicKey: "GFAKETESTPUBLIC" }),
  });
  const readiness = await adapter.readiness();
  const evaluation = await evaluationFor(apiIntent);
  const receipt = await adapter.settlePayment(apiIntent, evaluation, "user-passkey");
  const serialized = JSON.stringify({ readiness, receipt });

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.submitEnabled, false);
  assert.equal(receipt.finality, "dry-run-ready-not-submitted");
  assert.equal(serialized.includes("SFAKETESTSECRET"), false);
});

test("StellarTestnetRealAdapter no marca ready si public key no coincide con secret", async () => {
  const adapter = new StellarTestnetRealAdapter({
    env: {
      STELLAR_SECRET_KEY: "SFAKETESTSECRET",
      STELLAR_PUBLIC_KEY: "GDIFFERENTPUBLIC",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
    },
    sdkLoader: async () => fakeStellarSdk({ secret: "SFAKETESTSECRET", publicKey: "GFAKETESTPUBLIC" }),
  });
  const readiness = await adapter.readiness();

  assert.equal(readiness.status, "invalid-keypair");
  assert.equal(JSON.stringify(readiness).includes("SFAKETESTSECRET"), false);
});

test("StellarTestnetRealAdapter solo puede submit cuando STELLAR_SUBMIT_ENABLED=true", async () => {
  const adapter = new StellarTestnetRealAdapter({
    env: {
      STELLAR_SECRET_KEY: "SFAKETESTSECRET",
      STELLAR_PUBLIC_KEY: "GFAKETESTPUBLIC",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
      STELLAR_SUBMIT_ENABLED: "true",
      STELLAR_TEST_DESTINATION: "GDESTINATIONTEST",
      STELLAR_TEST_AMOUNT_XLM: "0.000001",
    },
    sdkLoader: async () => fakeStellarSdk({ secret: "SFAKETESTSECRET", publicKey: "GFAKETESTPUBLIC" }),
  });
  const evaluation = await evaluationFor(apiIntent);
  const prepared = await adapter.preparePayment(apiIntent, evaluation);

  assert.equal(prepared.canSubmit, true);
  assert.equal(prepared.submitMode, "submit-enabled");
  assert.equal(prepared.amount, "0.000001");
});

test("setup:testnet reporta faltantes sin bloquear privacidad local", async () => {
  const { setupTestnet } = await import("../scripts/setup-testnet.mjs");
  const report = await setupTestnet({ env: {}, statePath: "data/non-existent-testnet-state.json" });

  assert.equal(report.ok, false);
  assert.equal(report.status, "not-ready");
  assert.equal(report.runtimeStatePrivacy.ok, true);
  assert.ok(report.nextSteps.some((step) => step.includes("STELLAR_SECRET_KEY")));
});

function fakeStellarSdk({ secret, publicKey }) {
  return {
    Keypair: {
      fromSecret(value) {
        if (value !== secret) throw new Error("invalid secret");
        return {
          publicKey() {
            return publicKey;
          },
        };
      },
    },
  };
}

test("StellarTestnetRealAdapter submit path firma y retorna hash testnet sin exponer secret", async () => {
  const adapter = new StellarTestnetRealAdapter({
    env: {
      STELLAR_SECRET_KEY: "SFAKESUBMITSECRET",
      STELLAR_PUBLIC_KEY: "GFAKESUBMITPUBLIC",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
      STELLAR_SUBMIT_ENABLED: "true",
      STELLAR_TEST_DESTINATION: "GDESTINATIONSUBMIT",
      STELLAR_TEST_AMOUNT_XLM: "0.000001",
    },
    sdkLoader: async () => fakeSubmitStellarSdk({ secret: "SFAKESUBMITSECRET", publicKey: "GFAKESUBMITPUBLIC" }),
  });
  const evaluation = await evaluationFor(apiIntent);
  const receipt = await adapter.settlePayment(apiIntent, evaluation, "user-passkey");
  const serialized = JSON.stringify(receipt);

  assert.equal(receipt.status, ReceiptStatus.settled);
  assert.equal(receipt.transactionHash, "hash-testnet-submit");
  assert.equal(receipt.finality, "submitted-testnet");
  assert.equal(serialized.includes("SFAKESUBMITSECRET"), false);
});

function fakeSubmitStellarSdk({ secret, publicKey }) {
  class Server {
    constructor(url) {
      this.url = url;
    }
    async loadAccount(accountId) {
      return { accountId };
    }
    async fetchBaseFee() {
      return "100";
    }
    async submitTransaction(transaction) {
      assert.equal(transaction.signed, true);
      return { hash: "hash-testnet-submit" };
    }
  }

  class TransactionBuilder {
    constructor(account, options) {
      this.account = account;
      this.options = options;
      this.operations = [];
    }
    addOperation(operation) {
      this.operations.push(operation);
      return this;
    }
    addMemo(memo) {
      this.memo = memo;
      return this;
    }
    setTimeout(timeout) {
      this.timeout = timeout;
      return this;
    }
    build() {
      const built = { operations: this.operations, memo: this.memo, timeout: this.timeout, signed: false };
      built.sign = () => {
        built.signed = true;
      };
      return built;
    }
  }

  return {
    Keypair: {
      fromSecret(value) {
        if (value !== secret) throw new Error("invalid secret");
        return {
          publicKey() {
            return publicKey;
          },
        };
      },
    },
    Horizon: { Server },
    TransactionBuilder,
    Operation: {
      payment(payload) {
        return { type: "payment", ...payload };
      },
    },
    Asset: {
      native() {
        return { code: "XLM" };
      },
    },
    Memo: {
      text(value) {
        return { type: "text", value };
      },
    },
    Networks: { TESTNET: "Test SDF Network ; September 2015" },
    BASE_FEE: "100",
  };
}

test("StellarTestnetRealAdapter usa monto tiny por defecto para testnet", async () => {
  const adapter = new StellarTestnetRealAdapter({
    env: {
      STELLAR_SECRET_KEY: "SFAKETINYSECRET",
      STELLAR_PUBLIC_KEY: "GFAKETINYPUBLIC",
      STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
    },
    sdkLoader: async () => fakeStellarSdk({ secret: "SFAKETINYSECRET", publicKey: "GFAKETINYPUBLIC" }),
  });
  const evaluation = await evaluationFor(apiIntent);
  const prepared = await adapter.preparePayment({ ...apiIntent, amount: 12 }, evaluation);

  assert.equal(prepared.amount, "0.000001");
});

import { authorizeAdmin, buildAdminTestnetIntent, runAdminTestnetPayment } from "../src/adminTestnetPayment.mjs";

test("admin testnet endpoint rechaza request sin bearer token", () => {
  assert.throws(
    () => authorizeAdmin({ auth: "", env: { TESTNET_PAYMENT_ADMIN_TOKEN: "admin-token" } }),
    /Missing bearer token/,
  );
});

test("admin testnet endpoint rechaza bearer token incorrecto", () => {
  assert.throws(
    () => authorizeAdmin({ auth: "Bearer wrong", env: { TESTNET_PAYMENT_ADMIN_TOKEN: "admin-token" } }),
    /Invalid bearer token/,
  );
});

test("admin testnet endpoint bloquea submit si STELLAR_SUBMIT_ENABLED no es true", async () => {
  await assert.rejects(
    () => runAdminTestnetPayment({
      request: { headers: { authorization: "Bearer admin-token" } },
      env: { TESTNET_PAYMENT_ADMIN_TOKEN: "admin-token", STELLAR_SUBMIT_ENABLED: "false" },
    }),
    /STELLAR_SUBMIT_ENABLED must be true/,
  );
});

test("admin testnet endpoint retorna receipt sin exponer secret key", async () => {
  const fakeAdapter = {
    async preparePayment(intent) {
      return {
        rail: "Stellar Testnet Real Rail",
        network: "stellar:testnet",
        asset: "XLM",
        amount: "0.000001",
        destination: intent.destinationAddress,
        memo: "spend:admintestnet",
        canSubmit: true,
        readiness: { status: "ready", submitEnabled: true },
      };
    },
    async settlePayment(intent, evaluation, approvedBy) {
      assert.equal(approvedBy, "admin-vercel-testnet");
      return {
        id: "receipt-admin-testnet",
        intentId: intent.id,
        providerId: intent.providerId,
        status: "settled",
        transactionHash: "hash-admin-testnet",
        rail: "Stellar Testnet Real Rail",
        network: "stellar:testnet",
        asset: "XLM",
        finality: "submitted-testnet",
        timestamp: "2026-06-25T00:00:00.000Z",
        policyDecision: { allowed: evaluation.allowed, requiresConfirmation: true, reasons: [] },
      };
    },
  };
  const report = await runAdminTestnetPayment({
    request: { headers: { authorization: "Bearer admin-token" } },
    env: {
      TESTNET_PAYMENT_ADMIN_TOKEN: "admin-token",
      STELLAR_SUBMIT_ENABLED: "true",
      STELLAR_SECRET_KEY: "SADMINSECRETNOTREAL",
      STELLAR_TEST_DESTINATION: "GADMINDESTINATION",
      STELLAR_TEST_AMOUNT_XLM: "0.000001",
    },
    service: { evaluateIntent: async () => ({ allowed: true, requiresConfirmation: true, reasons: [], evidence: ["ok"] }) },
    adapter: fakeAdapter,
  });

  assert.equal(report.ok, true);
  assert.equal(report.transactionHash, "hash-admin-testnet");
  assert.equal(report.amount, "0.000001");
  assert.equal(JSON.stringify(report).includes("SADMINSECRETNOTREAL"), false);
});

test("admin testnet intent usa monto tiny por defecto", () => {
  const intent = buildAdminTestnetIntent({ STELLAR_TEST_DESTINATION: "GADMINDESTINATION" });

  assert.equal(intent.amount, 0.000001);
  assert.equal(intent.currency, "XLM");
});

test("admin testnet endpoint no filtra secret en errores de adapter", async () => {
  const fakeAdapter = {
    async preparePayment() {
      return { canSubmit: true, amount: "0.000001", destination: "GADMINDESTINATION", memo: "spend:test" };
    },
    async settlePayment() {
      throw new Error("submit failed for secret SADMINSECRETNOTREAL");
    },
  };

  try {
    await runAdminTestnetPayment({
      request: { headers: { authorization: "Bearer admin-token" } },
      env: {
        TESTNET_PAYMENT_ADMIN_TOKEN: "admin-token",
        STELLAR_SUBMIT_ENABLED: "true",
        STELLAR_SECRET_KEY: "SADMINSECRETNOTREAL",
        STELLAR_TEST_DESTINATION: "GADMINDESTINATION",
      },
      service: { evaluateIntent: async () => ({ allowed: true, requiresConfirmation: true, reasons: [], evidence: ["ok"] }) },
      adapter: fakeAdapter,
    });
    assert.fail("Expected admin payment to fail");
  } catch (error) {
    assert.match(error.message, /submit failed/);
    assert.equal(error.message.includes("SADMINSECRETNOTREAL"), false);
  }
});


test("SorobanSmartWalletAdapter permite pago dentro de allowlist, limite y sesion vigente", async () => {
  const evaluation = await evaluationFor(apiIntent);
  const adapter = new SorobanSmartWalletAdapter({
    env: { SOROBAN_SMART_WALLET_CONTRACT_ID: "CCONTRACTDEMO" },
    now: () => new Date("2026-06-25T12:00:00Z"),
    sessionPolicy: {
      ownerPublicKey: "GOWNERDEMO",
      sessionPublicKey: "GSESSIONDEMO",
      allowedProviders: ["api-mcp"],
      allowedDestinations: [apiIntent.destinationAddress],
      perPaymentLimit: 20,
      expiresAt: "2026-06-26T00:00:00Z",
      revoked: false,
    },
  });

  const prepared = await adapter.preparePayment(apiIntent, evaluation);
  const receipt = await adapter.settlePayment(apiIntent, evaluation, "user-passkey");

  assert.equal(prepared.sessionDecision.allowed, true);
  assert.equal(receipt.status, ReceiptStatus.settled);
  assert.equal(receipt.rail, "Soroban Smart Wallet");
  assert.equal(receipt.contractId, "CCONTRACTDEMO");
  assert.equal(receipt.smartWalletDecision.allowed, true);
  assert.equal(assertNoSensitiveData(receipt, "sorobanReceipt").allowed, true);
});

test("SorobanSmartWalletAdapter bloquea destino fuera de allowlist", async () => {
  const evaluation = await evaluationFor(apiIntent);
  const adapter = new SorobanSmartWalletAdapter({
    now: () => new Date("2026-06-25T12:00:00Z"),
    sessionPolicy: {
      ownerPublicKey: "GOWNERDEMO",
      sessionPublicKey: "GSESSIONDEMO",
      allowedProviders: ["other-provider"],
      allowedDestinations: ["GOTHERDESTINATION"],
      perPaymentLimit: 20,
      expiresAt: "2026-06-26T00:00:00Z",
      revoked: false,
    },
  });

  const decision = adapter.evaluateSession(apiIntent, evaluation);

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("Destination/provider outside Soroban allowlist"));
});

test("SorobanSmartWalletAdapter bloquea monto superior al limite", async () => {
  const intent = { ...apiIntent, amount: 30 };
  const evaluation = await evaluationFor(intent, { policy: { ...basePolicy, perPaymentLimit: 40 } });
  const adapter = new SorobanSmartWalletAdapter({
    now: () => new Date("2026-06-25T12:00:00Z"),
    sessionPolicy: {
      ownerPublicKey: "GOWNERDEMO",
      sessionPublicKey: "GSESSIONDEMO",
      allowedProviders: ["api-mcp"],
      allowedDestinations: [apiIntent.destinationAddress],
      perPaymentLimit: 20,
      expiresAt: "2026-06-26T00:00:00Z",
      revoked: false,
    },
  });

  const decision = adapter.evaluateSession(intent, evaluation);

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("Amount exceeds Soroban per-payment limit"));
});

test("SorobanSmartWalletAdapter bloquea session key expirada o revocada", async () => {
  const evaluation = await evaluationFor(apiIntent);
  const expiredAdapter = new SorobanSmartWalletAdapter({
    now: () => new Date("2026-06-25T12:00:00Z"),
    sessionPolicy: {
      ownerPublicKey: "GOWNERDEMO",
      sessionPublicKey: "GSESSIONDEMO",
      allowedProviders: ["api-mcp"],
      allowedDestinations: [apiIntent.destinationAddress],
      perPaymentLimit: 20,
      expiresAt: "2026-06-24T00:00:00Z",
      revoked: false,
    },
  });
  const revokedAdapter = new SorobanSmartWalletAdapter({
    now: () => new Date("2026-06-25T12:00:00Z"),
    sessionPolicy: {
      ownerPublicKey: "GOWNERDEMO",
      sessionPublicKey: "GSESSIONDEMO",
      allowedProviders: ["api-mcp"],
      allowedDestinations: [apiIntent.destinationAddress],
      perPaymentLimit: 20,
      expiresAt: "2026-06-26T00:00:00Z",
      revoked: true,
    },
  });

  assert.ok(expiredAdapter.evaluateSession(apiIntent, evaluation).reasons.includes("Agent session signer is expired"));
  assert.ok(revokedAdapter.evaluateSession(apiIntent, evaluation).reasons.includes("Agent session signer is revoked"));
});
test("SorobanSmartWalletAdapter readiness usa contract id, asset contract y public keys desde env", () => {
  const adapter = new SorobanSmartWalletAdapter({
    env: {
      SOROBAN_SMART_WALLET_CONTRACT_ID: "CCONTRACTFROMENV",
      SOROBAN_OWNER_PUBLIC_KEY: "GOWNERFROMENV",
      SOROBAN_SESSION_PUBLIC_KEY: "GSESSIONFROMENV",
      SOROBAN_NATIVE_ASSET_CONTRACT_ID: "CASSETFROMENV",
    },
  });

  const readiness = adapter.readiness();

  assert.equal(readiness.status, "asset-contract-configured");
  assert.equal(readiness.contractId, "CCONTRACTFROMENV");
  assert.equal(readiness.assetContractId, "CASSETFROMENV");
  assert.equal(readiness.ownerPublicKey, "GOWNERFROMENV");
  assert.equal(readiness.sessionPublicKey, "GSESSIONFROMENV");
  assert.ok(readiness.allowedAssets.includes("CASSETFROMENV"));
});

test("soroban testnet demo plan no imprime secretos", () => {
  const plan = buildSorobanTestnetPlan({
    env: {
      SOROBAN_SMART_WALLET_CONTRACT_ID: "CCONTRACTDEMO",
      SOROBAN_OWNER_PUBLIC_KEY: "GOWNERDEMO",
      SOROBAN_SESSION_PUBLIC_KEY: "GSESSIONDEMO",
      SOROBAN_TEST_DESTINATION: "GDESTINATIONDEMO",
      SOROBAN_NATIVE_ASSET_CONTRACT_ID: "CASSETDEMO",
      STELLAR_SECRET_KEY: "SSECRETNOTREAL1234567890",
    },
    now: () => new Date("2026-06-25T00:00:00Z"),
  });

  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes("SSECRETNOTREAL1234567890"), false);
  assert.ok(serialized.includes("stellar contract deploy"));
  assert.ok(serialized.includes("grant_session"));
  assert.ok(serialized.includes("execute_allowed_transfer"));
});

test("soroban testnet command usa alias local para firmar y public keys para contrato", () => {
  const command = buildSorobanCommand({
    action: "grant",
    env: {
      SOROBAN_SMART_WALLET_CONTRACT_ID: "CCONTRACTDEMO",
      SOROBAN_OWNER_IDENTITY: "spendhub-owner",
      SOROBAN_OWNER_PUBLIC_KEY: "GOWNERDEMO",
      SOROBAN_SESSION_PUBLIC_KEY: "GSESSIONDEMO",
      SOROBAN_TEST_DESTINATION: "GDESTINATIONDEMO",
      SOROBAN_NATIVE_ASSET_CONTRACT_ID: "CASSETDEMO",
      SOROBAN_PROVIDER_ID: "api-mcp",
      SOROBAN_TEST_AMOUNT: "7",
      SOROBAN_SESSION_EXPIRES_AT: "1782345600",
    },
  });

  assert.equal(command.bin, "stellar");
  assert.deepEqual(command.args.slice(0, 4), ["contract", "invoke", "--id", "CCONTRACTDEMO"]);
  assert.ok(command.args.includes("spendhub-owner"));
  assert.ok(command.args.includes("GOWNERDEMO"));
  assert.ok(command.args.includes("GSESSIONDEMO"));
  assert.ok(command.args.includes('["GDESTINATIONDEMO"]'));
  assert.ok(command.args.includes('["api-mcp"]'));
  assert.ok(command.args.includes('["CASSETDEMO"]'));
});

test("soroban testnet transfer command usa SAC nativo sin secrets", () => {
  const command = buildSorobanCommand({
    action: "transfer",
    env: {
      SOROBAN_SMART_WALLET_CONTRACT_ID: "CCONTRACTDEMO",
      SOROBAN_NATIVE_ASSET_CONTRACT_ID: "CASSETDEMO",
      SOROBAN_SESSION_IDENTITY: "spendhub-session",
      SOROBAN_SESSION_PUBLIC_KEY: "GSESSIONDEMO",
      SOROBAN_TEST_DESTINATION: "GDESTINATIONDEMO",
      SOROBAN_PROVIDER_ID: "api-mcp",
      SOROBAN_TEST_AMOUNT: "7",
      SOROBAN_TEST_NONCE: "42",
      STELLAR_SECRET_KEY: "SSECRETNOTREAL1234567890",
    },
  });

  assert.equal(command.bin, "stellar");
  assert.deepEqual(command.args.slice(0, 4), ["contract", "invoke", "--id", "CCONTRACTDEMO"]);
  assert.ok(command.args.includes("execute_allowed_transfer"));
  assert.ok(command.args.includes("--asset_contract"));
  assert.ok(command.args.includes("CASSETDEMO"));
  assert.ok(command.args.includes("spendhub-session"));
  assert.equal(command.redacted.includes("SSECRETNOTREAL1234567890"), false);
});

test("soroban testnet demo dry-run no ejecuta ni filtra secrets", async () => {
  let called = false;
  const report = await runSorobanTestnetDemo({
    action: "deploy",
    execute: false,
    env: { STELLAR_SECRET_KEY: "SSECRETNOTREAL1234567890", SOROBAN_OWNER_IDENTITY: "spendhub-owner" },
    runner: async () => {
      called = true;
      return { stdout: "", stderr: "" };
    },
  });

  assert.equal(called, false);
  assert.equal(report.mode, "dry-run");
  assert.equal(JSON.stringify(report).includes("SSECRETNOTREAL1234567890"), false);
});
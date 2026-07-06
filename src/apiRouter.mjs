import { runAdminTestnetPayment } from "./adminTestnetPayment.mjs";
import { runAdminSorobanTransfer } from "./adminSorobanTransfer.mjs";
import { MppChargeService } from "./mppChargeService.mjs";
import { MppReceiptRepository } from "./mppReceiptRepository.mjs";
import { ContractAccountRelayer, contractAccountReadiness } from "./contractAccountRelayer.mjs";
import { runAdminContractAccountDeploy } from "./adminContractAccountDeploy.mjs";
import { PublicEvidenceService } from "./publicEvidenceService.mjs";
import { ContractAccountCeremonyService } from "./contractAccountCeremony.mjs";
import { STELLAR_RISK_PROVIDER, validateProviderDefinition } from "./providerKit.mjs";
import { authenticatePilotRequest, clientIp as pilotClientIp, pilotReadiness, PILOT_TENANT_ID } from "./pilotAuth.mjs";
import { PilotRateLimiter } from "./pilotRateLimit.mjs";
import { pilotRepositoryReadiness } from "./pilotRepository.mjs";
import { PilotService } from "./pilotService.mjs";
import { handlePilotMcpHttp } from "./mcp/pilotMcpHttp.mjs";
import { BaseX402Service } from "./baseX402Service.mjs";
import { MultichainService } from "./multichainService.mjs";

export function createApiRouter({ service, env = process.env, dependencies: suppliedDependencies = null } = {}) {
  if (!service) throw new Error("API router requires SpendHubService");

  const dependencies = suppliedDependencies || createDependencies(env);
  const routes = createRoutes({ service, env, dependencies });

  return {
    routes,
    async handle({ request, response, url }) {
      const method = String(request.method || "GET").toUpperCase();
      const rewrittenPilotPath = url.pathname === "/api/pilot"
        ? url.searchParams.get("pilotPath")
        : null;
      const rewrittenRoutePath = url.pathname === "/api/router"
        ? url.searchParams.get("routePath")
        : null;
      const pathname = rewrittenRoutePath && /^[a-zA-Z0-9/_-]+$/.test(rewrittenRoutePath)
        ? `/api/${rewrittenRoutePath.replace(/^\/+|\/+$/g, "")}`
        : rewrittenPilotPath && /^[a-zA-Z0-9/_-]+$/.test(rewrittenPilotPath)
          ? `/api/pilot/${rewrittenPilotPath.replace(/^\/+|\/+$/g, "")}`
          : url.pathname;
      const pathMatches = routes
        .map((route) => ({ route, params: matchRoute(route, pathname) }))
        .filter((candidate) => candidate.params !== null);
      const selected = pathMatches.find((candidate) => candidate.route.method === method);

      if (!selected) {
        if (pathMatches.length > 0) {
          const allowed = [...new Set(pathMatches.map(({ route }) => route.method))].sort();
          response.setHeader("Allow", allowed.join(", "));
          writeJson(response, 405, { error: "Method not allowed" });
          return;
        }
        writeJson(response, 404, { error: "Not found" });
        return;
      }

      try {
        const result = await selected.route.handler({
          request,
          response,
          url,
          params: selected.params,
          readJson: () => readJson(request),
        });
        if (result instanceof Response) {
          await writeWebResponse(response, result);
          return;
        }
        if (response.writableEnded) return;
        writeJson(response, result?.status || 200, result?.body ?? result ?? {});
      } catch (error) {
        writeJson(response, normalizeErrorStatus(error), { error: publicErrorMessage(error) });
      }
    },
  };
}

export function createRoutes({ service, env, dependencies }) {
  const exact = (method, path, handler) => ({ method, path, handler });
  const dynamic = (method, pattern, keys, handler) => ({ method, pattern, keys, handler });
  // The Stellar-first product surface shows USDC service payments only; other
  // categories stay in the engine and tests but out of the user journey.
  const PRODUCT_EXCLUDED_CATEGORIES = ["buy_crypto", "defi_allocate", "bill_pay"];
  const isProductIntent = (intent) => (intent.currency || "USDC") === "USDC" && !PRODUCT_EXCLUDED_CATEGORIES.includes(intent.category);
  const isProductProvider = (provider) => !PRODUCT_EXCLUDED_CATEGORIES.includes(provider.category);

  return [
    exact("POST", "/api/admin/testnet-payment", async ({ request }) => ({
      body: await runAdminTestnetPayment({ request, env, service }),
    })),
    exact("POST", "/api/admin/soroban-transfer", async ({ request, readJson }) => ({
      body: await runAdminSorobanTransfer({ request, body: await readJson(), env, service }),
    })),
    exact("GET", "/api/health", async () => ({ body: { ok: true, readiness: await service.readiness(env) } })),
    exact("GET", "/api/rail/diagnostics", async () => ({ body: await service.railDiagnostics() })),
    exact("GET", "/api/link/diagnostics", async () => ({ body: await service.linkDiagnostics() })),
    exact("GET", "/api/state", async () => ({ body: await service.getState() })),
    exact("GET", "/api/spend", async () => {
      const spend = await service.getSpendView();
      const intents = (spend.intents || []).filter(isProductIntent);
      const ready = intents.filter((intent) => spend.evaluations?.[intent.id]?.allowed).length;
      return { body: { ...spend, intents, summary: { ...spend.summary, ready, blocked: intents.length - ready } } };
    }),
    exact("GET", "/api/home", async () => {
      const [spend, evidence] = await Promise.all([
        service.getSpendView(),
        dependencies.publicEvidence().manifest({ mode: "live" }),
      ]);
      const providers = service.getProvidersView().providers.filter((provider) =>
        provider.paymentMethod?.includes("stellar") || provider.providerId === "stellar-agent-merchant-lab"
      );
      const verified = (evidence.evidence || []).filter((item) => item.verificationStatus === "verified");
      const productIntents = (spend.intents || []).filter(isProductIntent);
      const ready = productIntents.filter((intent) => spend.evaluations?.[intent.id]?.allowed).length;
      return { body: {
        agent: { mode: "Supervised", network: "stellar:testnet", asset: "USDC" },
        policy: spend.policy,
        summary: { ...spend.summary, ready, blocked: productIntents.length - ready, verifiedPayments: verified.length },
        recommendations: providers.filter(isProductProvider).slice(0, 3).map((provider) => ({
          ...provider,
          categoryLabel: "API / MCP",
          status: provider.paymentMethod === "stellar-mpp-usdc" ? "pilot-ready" : "sandbox",
        })),
        proposals: spend.intents.filter((intent) => isProductIntent(intent) && spend.evaluations[intent.id]?.allowed).slice(0, 3).map((intent) => ({ ...intent, status: "ready" })),
        recentActivity: verified.slice(0, 3).map((item) => ({
          id: item.id,
          label: item.label,
          network: item.network,
          asset: item.asset,
          amount: item.amount,
          status: item.verificationStatus,
          transactionHash: item.transactionHash,
          explorerUrl: item.explorerUrl,
        })),
      } };
    }),
    exact("GET", "/api/activity", async () => {
      const [spend, evidence] = await Promise.all([
        service.getSpendView(),
        dependencies.publicEvidence().manifest({ mode: "live" }),
      ]);
      const verified = (evidence.evidence || []).filter((item) => item.verificationStatus === "verified");
      const evidenceItems = verified.map((item) => ({
        id: item.id,
        label: item.label,
        kindLabel: item.evidenceType || "On-chain evidence",
        network: item.network,
        asset: item.asset,
        amount: item.amount,
        status: "verified",
        timestamp: item.verifiedAt,
        transactionHash: item.transactionHash,
        explorerUrl: item.explorerUrl,
      }));
      const receiptItems = spend.receipts.map((receipt) => {
        const simulated = String(receipt.finality || "").includes("simulated");
        return {
        id: receipt.id,
        label: receipt.providerName || receipt.providerId || "Agent payment",
        kindLabel: simulated ? "Agent receipt (simulated)" : "Agent receipt",
        network: receipt.network || "stellar:testnet",
        asset: receipt.asset || receipt.currency,
        amount: String(receipt.amount || ""),
        status: simulated ? "simulated" : receipt.status || "settled",
        timestamp: receipt.timestamp,
        transactionHash: receipt.transactionHash,
        explorerUrl: null,
        };
      });
      const items = [...evidenceItems, ...receiptItems].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      return { body: { items, summary: { verified: verified.length, receipts: spend.receipts.length } } };
    }),
    exact("GET", "/api/providers", async ({ url }) => {
      const query = url.searchParams.get("q") || "";
      const category = url.searchParams.get("category") || "";
      return {
        body: query || category
          ? { providers: service.searchProviders({ query, category }) }
          : service.getProvidersView(),
      };
    }),
    exact("GET", "/api/overview", async ({ url }) => {
      const evidenceService = dependencies.publicEvidence();
      const [evidence, diagnostics] = await Promise.all([
        evidenceService.manifest({ mode: url.searchParams.get("mode") }),
        evidenceService.diagnostics(),
      ]);
      return { body: { evidence, diagnostics } };
    }),
    exact("GET", "/api/chains", async () => ({
      body: {
        ...dependencies.multichain().chains(),
        baseX402: dependencies.baseX402().readiness(),
      },
    })),
    exact("GET", "/api/treasury", async ({ url }) => ({
      body: dependencies.multichain().treasury({ evmAddress: url.searchParams.get("evmAddress") }),
    })),
    exact("GET", "/api/privy/config", async () => ({
      body: {
        enabled: Boolean(env.PRIVY_APP_ID && env.PRIVY_CLIENT_ID),
        appId: env.PRIVY_APP_ID || null,
        clientId: env.PRIVY_CLIENT_ID || null,
        supportedNetworks: ["eip155:84532", "eip155:43113"],
        loginMethods: ["email", "google"],
      },
    })),
    exact("GET", "/api/x402/base-readiness", async () => ({
      body: await dependencies.baseX402().acceptanceReadiness(),
    })),
    exact("GET", "/api/x402/base-risk", async ({ request, url }) => (
      dependencies.baseX402().handle(request, url)
    )),
    exact("GET", "/api/multichain/evidence", async () => ({
      body: await dependencies.multichain().evidence(),
    })),
    exact("GET", "/api/mpp/stellar-risk", async ({ request, url }) => (
      dependencies.mpp().handleRiskRequest(toWebRequest(request, url), url.searchParams.get("tx"))
    )),
    exact("GET", "/api/mpp/receipts", async () => ({
      body: { receipts: await dependencies.mppReceipts().listReceipts(20) },
    })),
    exact("GET", "/api/evidence", async ({ url }) => ({
      body: await dependencies.publicEvidence().manifest({ mode: url.searchParams.get("mode") }),
    })),
    exact("GET", "/api/diagnostics/public", async () => ({
      body: await dependencies.publicEvidence().diagnostics(),
    })),
    exact("GET", "/api/provider-kit/definition", async () => ({ body: { provider: STELLAR_RISK_PROVIDER } })),
    exact("POST", "/api/provider-kit/validate", async ({ readJson }) => ({
      body: { provider: validateProviderDefinition(await readJson()) },
    })),
    exact("POST", "/api/mcp", async ({ request, response }) => {
      await handlePilotMcpHttp({
        request,
        pilotServiceFactory: dependencies.pilot,
        response,
        env,
        rateLimiter: dependencies.pilotRateLimiter(),
      });
    }),
    exact("GET", "/api/pilot/readiness", async () => ({
      body: {
        pilot: pilotReadiness(env),
        repository: pilotRepositoryReadiness(env),
        providerCount: 1,
      },
    })),
    exact("GET", "/api/pilot/evidence", async () => ({
      body: await dependencies.pilot().evidence(),
    })),
    dynamic("GET", /^\/api\/pilot\/requests\/([^/]+)$/, ["requestId"], async ({ params, request }) => {
      await dependencies.pilotRateLimiter().enforce({ tenantId: PILOT_TENANT_ID, ip: pilotClientIp(request) });
      return { body: { request: await dependencies.pilot().getPublicRequest(params.requestId) } };
    }),
    dynamic("POST", /^\/api\/pilot\/requests\/([^/]+)\/approve$/, ["requestId"], async ({ params, readJson, request }) => {
      await dependencies.pilotRateLimiter().enforce({ tenantId: PILOT_TENANT_ID, ip: pilotClientIp(request) });
      const body = await readJson();
      return { body: { request: await dependencies.pilot().approve(params.requestId, body.approvalToken) } };
    }),
    dynamic("POST", /^\/api\/pilot\/requests\/([^/]+)\/claim$/, ["requestId"], async ({ params, request }) => {
      const { tenantId } = authenticatePilotRequest(request, env);
      await dependencies.pilotRateLimiter().enforce({ tenantId, ip: pilotClientIp(request) });
      return { body: await dependencies.pilot().claim(params.requestId, tenantId) };
    }),
    dynamic("POST", /^\/api\/pilot\/requests\/([^/]+)\/complete$/, ["requestId"], async ({ params, readJson, request }) => {
      const { tenantId } = authenticatePilotRequest(request, env);
      await dependencies.pilotRateLimiter().enforce({ tenantId, ip: pilotClientIp(request) });
      return { body: { request: await dependencies.pilot().complete(params.requestId, await readJson(), tenantId) } };
    }),
    exact("POST", "/api/admin/contract-account/deploy", async ({ request, readJson }) => ({
      body: await runAdminContractAccountDeploy({ request, body: await readJson(), env, ceremonies: dependencies.contractAccountCeremonies() }),
    })),
    exact("POST", "/api/contract-account/ceremony", async ({ readJson, request }) => ({
      status: 201,
      body: await dependencies.contractAccountCeremonies().register(await readJson(), { ip: clientIp(request) }),
    })),
    dynamic("GET", /^\/api\/contract-account\/ceremony\/([^/]+)$/, ["ceremonyId"], async ({ params }) => ({
      body: await dependencies.contractAccountCeremonies().status(params.ceremonyId),
    })),
    exact("GET", "/api/contract-account/status", async () => {
      const readiness = contractAccountReadiness(env);
      return {
        body: readiness.enabled
          ? await dependencies.contractAccount().status()
          : { readiness, receipts: [] },
      };
    }),
    exact("POST", "/api/contract-account/prepare", async ({ readJson, request }) => ({
      body: await dependencies.contractAccount().prepare(await readJson(), { ip: clientIp(request) }),
    })),
    exact("POST", "/api/contract-account/submit", async ({ readJson, request }) => ({
      body: await dependencies.contractAccount().submit(await readJson(), { ip: clientIp(request) }),
    })),
    dynamic("GET", /^\/api\/machine-resource\/([^/]+)$/, ["providerId"], async ({ params, url, request }) => {
      if (String(env.LEGACY_402_ENABLED || "").toLowerCase() === "false") {
        return { status: 410, body: { error: "Legacy demo protocol is disabled; use /api/mpp/stellar-risk" } };
      }
      const result = await service.requestMachineResource({
        providerId: params.providerId,
        resourceId: url.searchParams.get("resource") || "agent-resource",
        amount: url.searchParams.get("amount") || null,
        credential: request.headers["x-payment-credential"] || null,
      });
      return { status: result.status || 200, body: result };
    }),
    exact("GET", "/api/providers/search", async ({ url }) => ({
      body: {
        providers: service.searchProviders({
          query: url.searchParams.get("q") || "",
          category: url.searchParams.get("category") || "",
        }),
      },
    })),
    exact("POST", "/api/intents", async ({ readJson, request }) => {
      const body = await readJson();
      const idempotencyKey = request.headers["idempotency-key"] || body.idempotencyKey || null;
      return { status: 201, body: { intent: await service.createIntent({ ...body, idempotencyKey }) } };
    }),
    dynamic(
      "POST",
      /^\/api\/intents\/([^/]+)\/(prepare|proof|approve|link-spend-request|link-approve|link-deny)$/,
      ["intentId", "action"],
      async ({ params, readJson }) => {
        const body = await readJson();
        const { intentId, action } = params;
        if (action === "prepare") return { body: { prepared: await service.prepareIntent(intentId) } };
        if (action === "proof") return { body: await service.generateProof({ intentId, ...body }) };
        if (action === "approve") return { body: { receipt: await service.approveIntent(intentId, body.approvedBy || "user-passkey") } };
        if (action === "link-spend-request") return { body: { spendRequest: await service.createLinkSpendRequest(intentId) } };
        if (action === "link-approve") return { body: { receipt: await service.approveLinkSpendRequest(intentId, body.approvedBy || "link-biometric-simulated") } };
        return { body: { spendRequest: await service.denyLinkSpendRequest(intentId, body.deniedBy || "user") } };
      },
    ),
    dynamic("POST", /^\/api\/intents\/([^/]+)\/quote$/, ["intentId"], async ({ params, readJson }) => {
      const intent = service.findIntent(params.intentId);
      const provider = service.getProvider(intent.providerId);
      if (!provider) throw Object.assign(new Error("Provider not found"), { status: 404 });
      const body = await readJson();
      const merchant = env.BASE_X402_MERCHANT_ADDRESS || null;
      const paymentOptions = [
        {
          protocol: provider.paymentMethod?.includes("smart-wallet")
            ? "stellar-contract-account"
            : "stellar-mpp",
          network: "stellar:testnet",
          maxPrice: String(intent.amount),
          assetId: env.USDC_SAC_TESTNET || env.CONTRACT_ACCOUNT_USDC_SAC || undefined,
          recipient: env.MPP_STELLAR_RECIPIENT || env.CONTRACT_ACCOUNT_MERCHANT || undefined,
        },
        ...(merchant ? [{
          protocol: "x402",
          network: "eip155:84532",
          maxPrice: "0.01",
          recipient: merchant,
        }] : []),
      ];
      return {
        body: {
          quote: await dependencies.multichain().quote({
            provider: { ...provider, resource: provider.description, paymentOptions },
            balances: body.balances || {},
            allowedNetworks: body.allowedNetworks,
            preferredNetwork: body.preferredNetwork,
          }),
        },
      };
    }),
    dynamic("POST", /^\/api\/intents\/([^/]+)\/record-settlement$/, ["intentId"], async ({ params, readJson }) => {
      service.findIntent(params.intentId);
      return { body: { receipt: await dependencies.multichain().verifyAndRecordSettlement(await readJson()) } };
    }),
    exact("POST", "/api/bridges", async ({ readJson }) => ({
      status: 201,
      body: { bridge: await dependencies.multichain().createBridge(await readJson()) },
    })),
    dynamic("POST", /^\/api\/bridges\/([^/]+)\/prepare$/, ["bridgeId"], async ({ params }) => ({
      body: await dependencies.multichain().prepareBridge(params.bridgeId),
    })),
    dynamic("POST", /^\/api\/bridges\/([^/]+)\/record-burn$/, ["bridgeId"], async ({ params, readJson }) => ({
      body: { bridge: await dependencies.multichain().recordBurn(params.bridgeId, await readJson()) },
    })),
    dynamic("GET", /^\/api\/bridges\/([^/]+)$/, ["bridgeId"], async ({ params }) => ({
      body: { bridge: await dependencies.multichain().bridgeStatus(params.bridgeId) },
    })),
  ];
}

export function matchRoute(route, pathname) {
  if (route.path) return route.path === pathname ? {} : null;
  const match = pathname.match(route.pattern);
  if (!match) return null;
  try {
    return Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
  } catch {
    return null;
  }
}

function createDependencies(env) {
  let mpp;
  let receipts;
  let contractAccount;
  let evidence;
  let contractAccountCeremonies;
  let pilot;
  let pilotRateLimiter;
  let multichain;
  let baseX402;
  return {
    mpp: () => (mpp ||= new MppChargeService({ env })),
    mppReceipts: () => (receipts ||= new MppReceiptRepository({ env })),
    contractAccount: () => (contractAccount ||= new ContractAccountRelayer({ env })),
    publicEvidence: () => (evidence ||= new PublicEvidenceService({ env })),
    contractAccountCeremonies: () => (contractAccountCeremonies ||= new ContractAccountCeremonyService({ env })),
    pilot: () => (pilot ||= new PilotService({ env })),
    pilotRateLimiter: () => (pilotRateLimiter ||= new PilotRateLimiter({ env })),
    multichain: () => (multichain ||= new MultichainService({ env })),
    baseX402: () => (baseX402 ||= new BaseX402Service({
      env,
      onSettlement: (receipt) => (multichain ||= new MultichainService({ env })).verifyAndRecordSettlement(receipt),
    })),
  };
}

async function readJson(request) {
  try {
    if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
    if (typeof request.body === "string" && request.body.trim()) return JSON.parse(request.body);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400, cause: error });
  }
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || "local")
    .split(",")[0]
    .trim();
}

function toWebRequest(request, url) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value != null) headers.set(name, String(value));
  }
  return new Request(url, { method: request.method || "GET", headers });
}

async function writeWebResponse(response, webResponse) {
  for (const [name, value] of webResponse.headers.entries()) response.setHeader(name, value);
  response.statusCode = webResponse.status;
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

function writeJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function normalizeErrorStatus(error) {
  const status = Number(error?.status || 500);
  return status >= 400 && status <= 599 ? status : 500;
}

function publicErrorMessage(error) {
  if (error?.status) return error.message || "Request failed";
  return error?.publicMessage || "Internal server error";
}
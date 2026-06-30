import { runAdminTestnetPayment } from "./adminTestnetPayment.mjs";
import { runAdminSorobanTransfer } from "./adminSorobanTransfer.mjs";
import { MppChargeService } from "./mppChargeService.mjs";
import { MppReceiptRepository } from "./mppReceiptRepository.mjs";
import { ContractAccountRelayer, contractAccountReadiness } from "./contractAccountRelayer.mjs";
import { runAdminContractAccountDeploy } from "./adminContractAccountDeploy.mjs";
import { PublicEvidenceService } from "./publicEvidenceService.mjs";
import { STELLAR_RISK_PROVIDER, validateProviderDefinition } from "./providerKit.mjs";

export function createApiRouter({ service, env = process.env, dependencies: suppliedDependencies = null } = {}) {
  if (!service) throw new Error("API router requires SpendHubService");

  const dependencies = suppliedDependencies || createDependencies(env);
  const routes = createRoutes({ service, env, dependencies });

  return {
    routes,
    async handle({ request, response, url }) {
      const method = String(request.method || "GET").toUpperCase();
      const pathMatches = routes
        .map((route) => ({ route, params: matchRoute(route, url.pathname) }))
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
    exact("GET", "/api/spend", async () => ({ body: await service.getSpendView() })),
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
    exact("POST", "/api/admin/contract-account/deploy", async ({ request, readJson }) => ({
      body: await runAdminContractAccountDeploy({ request, body: await readJson(), env }),
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
  return {
    mpp: () => (mpp ||= new MppChargeService({ env })),
    mppReceipts: () => (receipts ||= new MppReceiptRepository({ env })),
    contractAccount: () => (contractAccount ||= new ContractAccountRelayer({ env })),
    publicEvidence: () => (evidence ||= new PublicEvidenceService({ env })),
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
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { SpendHubService } from "../src/spendHubService.mjs";
import { runAdminTestnetPayment } from "../src/adminTestnetPayment.mjs";
import { runAdminSorobanTransfer } from "../src/adminSorobanTransfer.mjs";
import { MppChargeService } from "../src/mppChargeService.mjs";
import { MppReceiptRepository } from "../src/mppReceiptRepository.mjs";
import { ContractAccountRelayer, contractAccountReadiness } from "../src/contractAccountRelayer.mjs";
import { runAdminContractAccountDeploy } from "../src/adminContractAccountDeploy.mjs";

let mppService;
let mppReceiptRepository;
let contractAccountRelayer;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

if (isCliEntrypoint()) {
  const root = process.cwd();
  const port = Number(process.env.PORT || 4179);
  const { server } = await createSpendHubServer({ root, port, env: process.env });
  server.listen(port, () => {
    console.log(`Stellar Agent Spend Hub running at http://localhost:${port}`);
  });
}

export async function createSpendHubServer({ root = process.cwd(), port = 4179, env = process.env, statePath = join(root, "data", "runtime-state.json") } = {}) {
  const service = await new SpendHubService({ statePath, env }).load();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://localhost:${port}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi({ request, response, url, service, env });
        return;
      }
      await handleStatic({ response, url, root });
    } catch (error) {
      const status = error.status || 500;
      writeJson(response, status, { error: error.message || "Internal server error" });
    }
  });
  return { server, service };
}

export async function handleApi({ request, response, url, service, env }) {
  const method = request.method || "GET";

  if (method === "POST" && url.pathname === "/api/admin/testnet-payment") {
    writeJson(response, 200, await runAdminTestnetPayment({ request, env, service }));
    return;
  }

  if (method === "POST" && url.pathname === "/api/admin/soroban-transfer") {
    const body = await readJson(request);
    writeJson(response, 200, await runAdminSorobanTransfer({ request, body, env, service }));
    return;
  }
  if (method === "GET" && url.pathname === "/api/health") {
    writeJson(response, 200, { ok: true, readiness: await service.readiness(env) });
    return;
  }

  if (method === "GET" && url.pathname === "/api/rail/diagnostics") {
    writeJson(response, 200, await service.railDiagnostics());
    return;
  }

  if (method === "GET" && url.pathname === "/api/link/diagnostics") {
    writeJson(response, 200, await service.linkDiagnostics());
    return;
  }

  if (method === "GET" && url.pathname === "/api/state") {
    writeJson(response, 200, await service.getState());
    return;
  }
  if (method === "GET" && url.pathname === "/api/mpp/stellar-risk") {
    const webRequest = toWebRequest(request, url);
    const result = await getMppService(env).handleRiskRequest(webRequest, url.searchParams.get("tx"));
    await writeWebResponse(response, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/mpp/receipts") {
    const receipts = await getMppReceiptRepository(env).listReceipts(20);
    writeJson(response, 200, { receipts });
    return;
  }

  if (method === "POST" && url.pathname === "/api/admin/contract-account/deploy") {
    const body = await readJson(request);
    writeJson(response, 200, await runAdminContractAccountDeploy({ request, body, env }));
    return;
  }
  if (method === "GET" && url.pathname === "/api/contract-account/status") {
    const readiness = contractAccountReadiness(env);
    writeJson(response, 200, readiness.enabled
      ? await getContractAccountRelayer(env).status()
      : { readiness, receipts: [] });
    return;
  }

  if (method === "POST" && url.pathname === "/api/contract-account/prepare") {
    const body = await readJson(request);
    writeJson(response, 200, await getContractAccountRelayer(env).prepare(body, { ip: clientIp(request) }));
    return;
  }

  if (method === "POST" && url.pathname === "/api/contract-account/submit") {
    const body = await readJson(request);
    writeJson(response, 200, await getContractAccountRelayer(env).submit(body, { ip: clientIp(request) }));
    return;
  }
  const machineMatch = url.pathname.match(/^\/api\/machine-resource\/([^/]+)$/);
  if (method === "GET" && machineMatch) {
    if (String(env.LEGACY_402_ENABLED || "").toLowerCase() === "false") {
      writeJson(response, 410, { error: "Legacy demo protocol is disabled; use /api/mpp/stellar-risk" });
      return;
    }
    const [, providerId] = machineMatch;
    const result = await service.requestMachineResource({
      providerId,
      resourceId: url.searchParams.get("resource") || "agent-resource",
      amount: url.searchParams.get("amount") || null,
      credential: request.headers["x-payment-credential"] || null,
    });
    writeJson(response, result.status || 200, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/providers/search") {
    writeJson(response, 200, {
      providers: service.searchProviders({ query: url.searchParams.get("q") || "", category: url.searchParams.get("category") || "" }),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/intents") {
    const body = await readJson(request);
    const idempotencyKey = request.headers["idempotency-key"] || body.idempotencyKey || null;
    writeJson(response, 201, { intent: await service.createIntent({ ...body, idempotencyKey }) });
    return;
  }

  const match = url.pathname.match(/^\/api\/intents\/([^/]+)\/(prepare|proof|approve|link-spend-request|link-approve|link-deny)$/);
  if (method === "POST" && match) {
    const [, intentId, action] = match;
    const body = await readJson(request);
    if (action === "prepare") writeJson(response, 200, { prepared: await service.prepareIntent(intentId) });
    if (action === "proof") writeJson(response, 200, await service.generateProof({ intentId, ...body }));
    if (action === "approve") writeJson(response, 200, { receipt: await service.approveIntent(intentId, body.approvedBy || "user-passkey") });
    if (action === "link-spend-request") writeJson(response, 200, { spendRequest: await service.createLinkSpendRequest(intentId) });
    if (action === "link-approve") writeJson(response, 200, { receipt: await service.approveLinkSpendRequest(intentId, body.approvedBy || "link-biometric-simulated") });
    if (action === "link-deny") writeJson(response, 200, { spendRequest: await service.denyLinkSpendRequest(intentId, body.deniedBy || "user") });
    return;
  }

  writeJson(response, 404, { error: "Not found" });
}

function getMppService(env) {
  if (!mppService) mppService = new MppChargeService({ env });
  return mppService;
}

function getMppReceiptRepository(env) {
  if (!mppReceiptRepository) mppReceiptRepository = new MppReceiptRepository({ env });
  return mppReceiptRepository;
}

function getContractAccountRelayer(env) {
  if (!contractAccountRelayer) contractAccountRelayer = new ContractAccountRelayer({ env });
  return contractAccountRelayer;
}
function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || "local")
    .split(",")[0]
    .trim();
}
function toWebRequest(request, url) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value != null) {
      headers.set(name, String(value));
    }
  }
  return new Request(url, { method: request.method || "GET", headers });
}

async function writeWebResponse(response, webResponse) {
  for (const [name, value] of webResponse.headers.entries()) response.setHeader(name, value);
  response.statusCode = webResponse.status;
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
async function handleStatic({ response, url, root }) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);
  const body = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}

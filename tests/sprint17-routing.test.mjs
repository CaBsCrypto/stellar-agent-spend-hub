import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createProbeServer } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ROUTES, normalizePath, resolveRoute } from "../src/client/routes.mjs";
import { createResourceStore } from "../src/client/store.mjs";
import { createApiRouter, matchRoute } from "../src/apiRouter.mjs";
import { createSpendHubServer } from "../scripts/serve.mjs";

const mockService = {
  readiness: async () => ({ status: "ready" }),
  railDiagnostics: async () => ({}),
  linkDiagnostics: async () => ({}),
  getState: async () => ({ legacy: true }),
  getSpendView: async () => ({ intents: [], receipts: [], summary: {} }),
  getProvidersView: () => ({ providers: [{ providerId: "demo" }] }),
  searchProviders: () => [],
  createIntent: async () => ({ id: "intent-demo" }),
};

function fakeDependencies() {
  return {
    publicEvidence: () => ({
      manifest: async () => ({ version: "test", coordinatedDemo: {} }),
      diagnostics: async () => ({ dependencies: {} }),
    }),
    mpp: () => ({ handleRiskRequest: async () => new Response("ok") }),
    mppReceipts: () => ({ listReceipts: async () => [] }),
    contractAccount: () => ({ status: async () => ({ receipts: [] }) }),
  };
}

test("frontend registry exposes focused product routes plus multichain treasury", () => {
  assert.deepEqual(ROUTES.map(({ path }) => path), ["/", "/spend", "/providers", "/mpp", "/wallet", "/treasury", "/evidence", "/security"]);
  assert.equal(resolveRoute("/evidence/")?.id, "evidence");
  assert.equal(resolveRoute("/unknown"), null);
});

test("route normalization keeps root and removes trailing separators", () => {
  assert.equal(normalizePath(""), "/");
  assert.equal(normalizePath("/providers/"), "/providers");
  assert.equal(normalizePath("//security//"), "/security");
});

test("resource store deduplicates in-flight requests and reuses fresh cache", async () => {
  let calls = 0;
  let release;
  const api = () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const store = createResourceStore({ api, now: () => 100 });
  const first = store.load("overview", "/api/overview");
  const second = store.load("overview", "/api/overview");
  assert.equal(calls, 1);
  release({ ok: true });
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(await second, { ok: true });
  assert.deepEqual(await store.load("overview", "/api/overview"), { ok: true });
  assert.equal(calls, 1);
});

test("resource invalidation forces a fresh request", async () => {
  let calls = 0;
  const store = createResourceStore({ api: async () => ({ call: ++calls }) });
  assert.equal((await store.load("spend", "/api/spend")).call, 1);
  store.invalidate("spend");
  assert.equal((await store.load("spend", "/api/spend")).call, 2);
});

test("route cancellation rejects stale resource consumers", async () => {
  let release;
  const store = createResourceStore({ api: () => new Promise((resolve) => { release = resolve; }) });
  const controller = new AbortController();
  const pending = store.load("wallet", "/api/contract-account/status", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  release({ ok: true });
});

test("overview endpoint combines evidence and diagnostics", async () => {
  const router = createApiRouter({ service: mockService, env: {}, dependencies: fakeDependencies() });
  const result = await invoke(router, { method: "GET", path: "/api/overview?mode=live" });
  assert.equal(result.status, 200);
  assert.equal(result.body.evidence.version, "test");
  assert.deepEqual(result.body.diagnostics.dependencies, {});
});

test("Vercel pilot rewrite resolves through the shared API router", async () => {
  const router = createApiRouter({ service: mockService, env: {}, dependencies: fakeDependencies() });
  const result = await invoke(router, { method: "GET", path: "/api/pilot?pilotPath=readiness" });
  assert.equal(result.status, 200);
  assert.equal(result.body.providerCount, 1);
});

test("API router returns 404 and 405 with Allow", async () => {
  const router = createApiRouter({ service: mockService, env: {}, dependencies: fakeDependencies() });
  const missing = await invoke(router, { method: "GET", path: "/api/does-not-exist" });
  assert.equal(missing.status, 404);
  const wrongMethod = await invoke(router, { method: "POST", path: "/api/providers" });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.allow, "GET");
});

test("API router maps malformed JSON to 400", async () => {
  const router = createApiRouter({ service: mockService, env: {}, dependencies: fakeDependencies() });
  const result = await invoke(router, { method: "POST", path: "/api/intents", body: "{" });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Invalid JSON body");
});

test("dynamic route matcher decodes path parameters", () => {
  const route = { pattern: /^\/api\/item\/([^/]+)$/, keys: ["id"] };
  assert.deepEqual(matchRoute(route, "/api/item/hello%20stellar"), { id: "hello stellar" });
  assert.equal(matchRoute(route, "/api/other/1"), null);
});

test("local server supports deep links and blocks server source files", async () => {
  const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(vercelConfig.cleanUrls, false);
  assert.equal(vercelConfig.rewrites.some((rewrite) => rewrite.source === "/treasury"), true);
  assert.equal(vercelConfig.rewrites.some((rewrite) => rewrite.source.includes(":segment1")), true);
  assert.equal(vercelConfig.rewrites.some((rewrite) => rewrite.source.includes("*")), false);
  assert.deepEqual(vercelConfig.rewrites[0], {
    source: "/api/:segment1/:segment2/:segment3/:segment4",
    destination: "/api/router?routePath=:segment1/:segment2/:segment3/:segment4",
  });
  const port = await getFreePort();
  const statePath = join(tmpdir(), `spendhub-sprint17-${Date.now()}.json`);
  const { server } = await createSpendHubServer({ root: process.cwd(), port, statePath, env: {} });
  await new Promise((resolve) => server.listen(port, resolve));
  try {
    const deepLink = await fetch(`http://localhost:${port}/evidence`);
    assert.equal(deepLink.status, 200);
    assert.match(await deepLink.text(), /Stellar Agent Spend Hub/);
    const treasury = await fetch(`http://localhost:${port}/treasury`);
    assert.equal(treasury.status, 200);
    const clientAsset = await fetch(`http://localhost:${port}/src/client/app.mjs`);
    assert.equal(clientAsset.status, 200);
    const serverSource = await fetch(`http://localhost:${port}/src/spendHubService.mjs`);
    assert.equal(serverSource.status, 404);
    const traversal = await fetch(`http://localhost:${port}/src/client/%2e%2e/spendHubService.mjs`);
    assert.equal(traversal.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function invoke(router, { method, path, body = null }) {
  const headers = {};
  let status = 200;
  let payload = "";
  const response = {
    writableEnded: false,
    setHeader(name, value) { headers[name.toLowerCase()] = String(value); },
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      for (const [name, value] of Object.entries(nextHeaders)) headers[name.toLowerCase()] = String(value);
    },
    end(value = "") { payload = Buffer.isBuffer(value) ? value.toString("utf8") : String(value); this.writableEnded = true; },
  };
  const request = { method, headers: {}, body };
  const url = new URL(path, "https://example.test");
  await router.handle({ request, response, url });
  return { status, headers, body: headers["content-type"]?.includes("json") ? JSON.parse(payload) : payload };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createProbeServer();
    probe.on("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}
test("canonical providers endpoint supports filtered production-safe queries", async () => {
  const service = {
    ...mockService,
    searchProviders: ({ query, category }) => [{ providerId: `${query}:${category}` }],
  };
  const router = createApiRouter({ service, env: {}, dependencies: fakeDependencies() });
  const result = await invoke(router, {
    method: "GET",
    path: "/api/providers?q=merchant%20lab&category=pay_service",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.providers, [{ providerId: "merchant lab:pay_service" }]);
});

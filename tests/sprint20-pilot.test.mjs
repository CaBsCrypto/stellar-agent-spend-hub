import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { authenticatePilotRequest, hashApiKey, PILOT_TENANT_ID } from "../src/pilotAuth.mjs";
import { createPilotMcpServer } from "../src/mcp/createPilotMcpServer.mjs";
import { PilotRateLimiter } from "../src/pilotRateLimit.mjs";
import { PilotRepository } from "../src/pilotRepository.mjs";
import { PilotService } from "../src/pilotService.mjs";
import { createPilotProviderRegistry } from "../src/pilotProvider.mjs";
import { findSensitiveData } from "../src/sensitiveDataGuard.mjs";

const recipient = "GAJK6AKXWGMRNRNZRLPZ5J7MUT4X7TZWHPEFEJJ5TL7V7XWPYKGG2CNV";
const apiKey = "pilot_api_key_abcdefghijklmnopqrstuvwxyz";
const baseEnv = {
  MCP_PILOT_ENABLED: "true",
  MCP_PILOT_API_KEY_HASH: hashApiKey(apiKey),
  MCP_PILOT_APPROVAL_SECRET: "approval-secret-for-pilot-tests-0001",
  MCP_PILOT_MERCHANT_RECIPIENT: recipient,
  MCP_APP_BASE_URL: "https://spendhub.example",
};

function harness({ now = () => new Date("2026-07-01T12:00:00Z") } = {}) {
  const repository = new PilotRepository({ env: {}, redis: null });
  const providers = createPilotProviderRegistry(baseEnv);
  const service = new PilotService({
    env: baseEnv,
    repository,
    providers,
    now,
    settlementVerifier: async ({ request, completion }) => ({
      transactionHash: completion.transactionHash,
      settledAt: "2026-07-01T12:05:00Z",
      receipt: {
        protocol: "mpp/stellar-charge@0.7",
        status: "success",
        transactionHash: completion.transactionHash,
        network: request.network,
        asset: request.asset,
        assetContractId: request.assetContractId,
        amount: request.amount,
        recipient: request.recipient,
        providerId: request.providerId,
        resourceId: request.resourceId,
        settledAt: "2026-07-01T12:05:00Z",
      },
    }),
  });
  return { repository, service };
}

async function createPrepared(service, idempotencyKey = "pilot-request-0001") {
  const draft = await service.createDraft({
    tenantId: PILOT_TENANT_ID,
    providerId: "stellar-agent-merchant-lab",
    resourceId: "stellar-risk-snapshot",
    amount: "0.01",
    idempotencyKey,
  });
  const prepared = await service.prepare(draft.requestId, PILOT_TENANT_ID);
  const approvalToken = new URL(prepared.approvalUrl).hash.slice("#approval=".length);
  return { draft, prepared, approvalToken: decodeURIComponent(approvalToken) };
}

test("pilot auth is gated and compares only the configured API key hash", () => {
  const request = { headers: { authorization: `Bearer ${apiKey}` } };
  assert.equal(authenticatePilotRequest(request, baseEnv).tenantId, PILOT_TENANT_ID);
  assert.throws(
    () => authenticatePilotRequest({ headers: { authorization: "Bearer wrong_but_long_enough_123456" } }, baseEnv),
    (error) => error.status === 401,
  );
  assert.throws(
    () => authenticatePilotRequest(request, { ...baseEnv, MCP_PILOT_ENABLED: "false" }),
    (error) => error.status === 503,
  );
});

test("pilot provider registry is fixed to Merchant Lab, USDC and Stellar testnet", () => {
  const provider = createPilotProviderRegistry(baseEnv).get("stellar-agent-merchant-lab");
  assert.equal(provider.maxPrice, "0.01");
  assert.equal(provider.network, "stellar:testnet");
  assert.equal(provider.asset, "USDC");
  assert.equal(provider.recipient, recipient);
  assert.match(provider.endpoint, /^https:\/\/stellar-agent-merchant-lab\.vercel\.app\//);
});

test("draft creation is idempotent and altered reuse is rejected before persistence", async () => {
  const { service } = harness();
  const first = await service.createDraft({
    providerId: "stellar-agent-merchant-lab",
    resourceId: "stellar-risk-snapshot",
    amount: "0.01",
    idempotencyKey: "same-pilot-key",
  });
  const replay = await service.createDraft({
    providerId: "stellar-agent-merchant-lab",
    resourceId: "stellar-risk-snapshot",
    amount: 0.01,
    idempotencyKey: "same-pilot-key",
  });
  assert.equal(first.requestId, replay.requestId);
  await assert.rejects(
    service.createDraft({
      providerId: "stellar-agent-merchant-lab",
      resourceId: "different-resource",
      amount: "0.01",
      idempotencyKey: "same-pilot-key",
    }),
    (error) => error.status === 403,
  );
});

test("approval token is one-time, expires and is absent from public state", async () => {
  let timestamp = Date.parse("2026-07-01T12:00:00Z");
  const { service } = harness({ now: () => new Date(timestamp) });
  const { draft, prepared, approvalToken } = await createPrepared(service);
  assert.match(prepared.approvalUrl, /#approval=/);
  assert.equal(JSON.stringify(await service.getPublicRequest(draft.requestId)).includes(approvalToken), false);
  await assert.rejects(service.approve(draft.requestId, "invalid-token"), (error) => error.status === 403);
  const approved = await service.approve(draft.requestId, approvalToken);
  assert.equal(approved.status, "approved");
  await assert.rejects(service.approve(draft.requestId, approvalToken), (error) => error.status === 409);

  const second = await createPrepared(service, "pilot-request-expiry");
  timestamp += 11 * 60 * 1000;
  await assert.rejects(service.approve(second.draft.requestId, second.approvalToken), (error) => error.status === 410);
  assert.equal((await service.getPublicRequest(second.draft.requestId)).status, "expired");
});

test("concurrent buyer claims have one winner and settlement emits safe evidence", async () => {
  const { service } = harness();
  const { draft, approvalToken } = await createPrepared(service);
  await service.approve(draft.requestId, approvalToken);
  const results = await Promise.allSettled([
    service.claim(draft.requestId),
    service.claim(draft.requestId),
  ]);
  const fulfilled = results.filter((item) => item.status === "fulfilled");
  const rejected = results.filter((item) => item.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.status, 409);

  const claim = fulfilled[0].value;
  const hash = "ab".repeat(32);
  const settled = await service.complete(draft.requestId, { claimId: claim.claimId, transactionHash: hash });
  assert.equal(settled.status, "settled");
  assert.equal(settled.transactionHash, hash);
  await assert.rejects(
    service.complete(draft.requestId, { claimId: claim.claimId, transactionHash: hash }),
    (error) => error.status === 409,
  );
  const evidence = await service.evidence();
  assert.equal(evidence.evidence[0].amount, "0.01");
  assert.equal(evidence.evidence[0].transactionHash, hash);
  assert.equal(findSensitiveData(evidence).length, 0);
});

test("pilot rate limiter enforces 20 requests per minute per tenant and IP", async () => {
  const limiter = new PilotRateLimiter({ env: {}, now: () => 1_000 });
  for (let index = 0; index < 20; index += 1) {
    await limiter.enforce({ tenantId: PILOT_TENANT_ID, ip: "127.0.0.1" });
  }
  await assert.rejects(
    limiter.enforce({ tenantId: PILOT_TENANT_ID, ip: "127.0.0.1" }),
    (error) => error.status === 429,
  );
});

test("remote pilot MCP exposes prepare-only tools and no execute tool", async (t) => {
  const { service } = harness();
  const server = createPilotMcpServer({ pilotService: service, tenantId: PILOT_TENANT_ID });
  const client = new Client({ name: "pilot-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "create_payment_draft",
    "discover_providers",
    "get_payment_status",
    "get_receipt",
    "prepare_payment",
  ]);
  assert.equal(names.includes("execute_payment"), false);
  const created = await client.callTool({
    name: "create_payment_draft",
    arguments: {
      providerId: "stellar-agent-merchant-lab",
      resourceId: "stellar-risk-snapshot",
      amount: "0.01",
      idempotencyKey: "mcp-pilot-request",
    },
  });
  assert.equal(created.structuredContent.ok, true);
  assert.equal(created.structuredContent.status, "created");
});

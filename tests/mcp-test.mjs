import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SpendHubService } from "../src/spendHubService.mjs";
import { createSpendHubMcpServer } from "../src/mcp/createMcpServer.mjs";
import { McpSpendHubTools } from "../src/mcp/mcpSpendHubTools.mjs";
import { findSensitiveData } from "../src/sensitiveDataGuard.mjs";

async function createHarness() {
  const service = new SpendHubService({ env: {} });
  const tools = new McpSpendHubTools({ service, appBaseUrl: "https://spendhub.example" });
  const server = createSpendHubMcpServer({ tools });
  const client = new Client({ name: "spend-hub-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    server,
    service,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

function structured(result) {
  return result.structuredContent || JSON.parse(result.content[0].text);
}

test("official MCP SDK exposes a bounded payment tool surface", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const listed = await harness.client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "create_payment_intent",
    "discover_providers",
    "get_payment_status",
    "get_receipt",
    "prepare_payment",
  ]);
  assert.equal(names.includes("execute_payment"), false);
});

test("discover_providers returns structured privacy-aware providers", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const response = structured(
    await harness.client.callTool({ name: "discover_providers", arguments: { query: "browser" } }),
  );
  assert.equal(response.ok, true);
  assert.equal(response.count, 1);
  assert.equal(response.providers[0].providerId, "browserbase-mcp");
  assert.equal(findSensitiveData(response).length, 0);
});

test("create_payment_intent is idempotent and always requires UI confirmation", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const input = {
    name: "create_payment_intent",
    arguments: { providerId: "browserbase-mcp", amount: 0.01, idempotencyKey: "agent-call-0001" },
  };

  const first = structured(await harness.client.callTool(input));
  const replay = structured(await harness.client.callTool(input));
  assert.equal(first.intent.id, replay.intent.id);
  assert.equal(first.confirmation.required, true);
  assert.equal(first.confirmation.executeToolAvailable, false);
  assert.match(first.confirmation.approvalUrl, /\/spend\?intent=/);
});

test("MCP schema rejects amounts above the supervised demo limit", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const response = await harness.client.callTool({
    name: "create_payment_intent",
    arguments: { providerId: "browserbase-mcp", amount: 1, idempotencyKey: "agent-call-0002" },
  });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /validation|invalid/i);
});

test("prepare_payment cannot submit and returns the human approval boundary", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const created = structured(
    await harness.client.callTool({
      name: "create_payment_intent",
      arguments: { providerId: "browserbase-mcp", amount: 0.01, idempotencyKey: "agent-call-0003" },
    }),
  );

  const prepared = structured(
    await harness.client.callTool({ name: "prepare_payment", arguments: { intentId: created.intent.id } }),
  );
  assert.equal(prepared.prepared.network, "stellar:testnet");
  assert.equal(prepared.prepared.canSubmit, false);
  assert.equal(prepared.prepared.status, "prepared-awaiting-human-confirmation");
  assert.equal(prepared.confirmation.required, true);
});

test("receipt is observable only after approval outside MCP", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const created = structured(
    await harness.client.callTool({
      name: "create_payment_intent",
      arguments: { providerId: "browserbase-mcp", amount: 0.01, idempotencyKey: "agent-call-0004" },
    }),
  );

  const before = await harness.client.callTool({ name: "get_receipt", arguments: { intentId: created.intent.id } });
  assert.equal(before.isError, true);
  await harness.service.approveIntent(created.intent.id, "human-test-approval");
  const after = structured(
    await harness.client.callTool({ name: "get_receipt", arguments: { intentId: created.intent.id } }),
  );
  assert.equal(after.ok, true);
  assert.equal(after.receipt.intentId, created.intent.id);
  assert.equal(findSensitiveData(after).length, 0);
});

test("unknown intent errors are sanitized", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const response = await harness.client.callTool({
    name: "get_payment_status",
    arguments: { intentId: "intent-does-not-exist" },
  });
  const payload = structured(response);
  assert.equal(response.isError, true);
  assert.equal(payload.error.code, "INTENT_NOT_FOUND");
  assert.equal(findSensitiveData(payload).length, 0);
});
test("idempotency key cannot be reused with a different payment request", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const base = { providerId: "browserbase-mcp", amount: 0.01, idempotencyKey: "agent-call-conflict" };
  await harness.client.callTool({ name: "create_payment_intent", arguments: base });
  const replay = await harness.client.callTool({
    name: "create_payment_intent",
    arguments: { ...base, amount: 0.005 },
  });
  const payload = structured(replay);
  assert.equal(replay.isError, true);
  assert.equal(payload.error.code, "IDEMPOTENCY_CONFLICT");
});

test("MCP blocks non-Stellar providers and intents created outside its boundary", async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const unsupported = await harness.client.callTool({
    name: "create_payment_intent",
    arguments: { providerId: "link-commerce-demo", amount: 0.01, idempotencyKey: "agent-call-link" },
  });
  assert.equal(unsupported.isError, true);
  assert.equal(structured(unsupported).error.code, "PROVIDER_NOT_SUPPORTED");

  const foreignIntent = await harness.service.createIntent({
    providerId: "browserbase-mcp",
    amount: 0.01,
    intentType: "pay_service",
  });
  const foreignPrepare = await harness.client.callTool({
    name: "prepare_payment",
    arguments: { intentId: foreignIntent.id },
  });
  assert.equal(foreignPrepare.isError, true);
  assert.equal(structured(foreignPrepare).error.code, "INTENT_NOT_OWNED");
});

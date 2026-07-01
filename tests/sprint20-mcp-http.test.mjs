import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { hashApiKey } from "../src/pilotAuth.mjs";
import { handlePilotMcpHttp } from "../src/mcp/pilotMcpHttp.mjs";
import { PilotRateLimiter } from "../src/pilotRateLimit.mjs";
import { PilotRepository } from "../src/pilotRepository.mjs";
import { PilotService } from "../src/pilotService.mjs";

const apiKey = "pilot_http_key_abcdefghijklmnopqrstuvwxyz";
const env = {
  MCP_PILOT_ENABLED: "true",
  MCP_PILOT_API_KEY_HASH: hashApiKey(apiKey),
  MCP_PILOT_APPROVAL_SECRET: "http-approval-secret-for-pilot-0001",
  MCP_PILOT_MERCHANT_RECIPIENT: "GAJK6AKXWGMRNRNZRLPZ5J7MUT4X7TZWHPEFEJJ5TL7V7XWPYKGG2CNV",
  MCP_APP_BASE_URL: "https://spendhub.example",
};

test("Streamable HTTP MCP performs SDK handshake and rejects missing bearer auth", async (t) => {
  const pilotService = new PilotService({
    env,
    repository: new PilotRepository({ env: {}, redis: null }),
  });
  const rateLimiter = new PilotRateLimiter({ env: {} });
  const server = createServer((request, response) => {
    handlePilotMcpHttp({ request, response, env, pilotService, rateLimiter });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  const endpoint = new URL(`http://127.0.0.1:${address.port}/api/mcp`);

  const unauthorized = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(unauthorized.status, 401);

  const client = new Client({ name: "pilot-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  await client.connect(transport);
  t.after(() => client.close());
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    ["create_payment_draft", "discover_providers", "get_payment_status", "get_receipt", "prepare_payment"],
  );
});

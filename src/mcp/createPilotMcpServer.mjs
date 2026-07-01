import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assertNoSensitiveData } from "../sensitiveDataGuard.mjs";

export function createPilotMcpServer({ pilotService, tenantId }) {
  if (!pilotService || !tenantId) throw new Error("Pilot MCP requires service and tenant");
  const server = new McpServer(
    { name: "stellar-agent-spend-hub-pilot", version: "0.3.0" },
    {
      instructions:
        "Prepare allowlisted Stellar testnet MPP payments. This server cannot sign or execute funds; human approval and a local buyer are required.",
    },
  );

  register(server, "discover_providers", {
    title: "Discover pilot providers",
    description: "List the administratively allowlisted Stellar MPP providers.",
    inputSchema: {},
    annotations: readOnly(),
  }, async () => ({
    providers: pilotService.discoverProviders(),
    count: pilotService.discoverProviders().length,
  }));

  register(server, "create_payment_draft", {
    title: "Create pilot payment draft",
    description: "Create an idempotent 0.01 USDC draft for Merchant Lab. This never moves funds.",
    inputSchema: {
      providerId: z.string().min(3).max(80),
      resourceId: z.string().min(3).max(80),
      amount: z.union([z.literal(0.01), z.literal("0.01")]),
      idempotencyKey: z.string().min(8).max(120),
    },
    annotations: mutation(),
  }, (input) => pilotService.createDraft({ tenantId, ...input }));

  register(server, "prepare_payment", {
    title: "Prepare pilot payment",
    description: "Create a ten-minute one-time human approval link. This never signs or settles.",
    inputSchema: { requestId: z.string().uuid() },
    annotations: mutation(),
  }, (input) => pilotService.prepare(input.requestId, tenantId));

  register(server, "get_payment_status", {
    title: "Get pilot payment status",
    description: "Read the current draft, approval, claim, or settlement state.",
    inputSchema: { requestId: z.string().uuid() },
    annotations: readOnly(),
  }, (input) => pilotService.getStatus(input.requestId, tenantId));

  register(server, "get_receipt", {
    title: "Get pilot receipt",
    description: "Return the sanitized public receipt after verified settlement.",
    inputSchema: { requestId: z.string().uuid() },
    annotations: readOnly(),
  }, (input) => pilotService.getReceipt(input.requestId, tenantId));

  return server;
}

function register(server, name, config, handler) {
  server.registerTool(name, config, async (input) => {
    try {
      const value = { ok: true, ...(await handler(input)) };
      const scan = assertNoSensitiveData(value, `pilotMcp:${name}`);
      if (!scan.allowed) throw new Error("MCP response failed the privacy firewall");
      return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
      };
    } catch (error) {
      const payload = { ok: false, error: publicMessage(error) };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: true,
      };
    }
  });
}

function readOnly() {
  return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
}

function mutation() {
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
}

function publicMessage(error) {
  if ([400, 403, 404, 409, 410, 429, 503].includes(Number(error?.status))) return error.message;
  return "Pilot tool could not complete the request";
}

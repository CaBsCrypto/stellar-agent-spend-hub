import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toMcpToolError, toMcpToolResult } from "./mcpSpendHubTools.mjs";

export function createSpendHubMcpServer({ tools }) {
  if (!tools) throw new Error("MCP tools are required");

  const server = new McpServer(
    { name: "stellar-agent-spend-hub", version: "0.2.0" },
    {
      instructions:
        "Discover and prepare Stellar testnet payments. Settlement is intentionally unavailable through MCP; users approve in Stellar Agent Spend Hub.",
    },
  );

  registerTool(
    server,
    "discover_providers",
    {
      title: "Discover payment providers",
      description: "Search privacy-aware MCP/API providers that can receive Stellar payments.",
      inputSchema: {
        query: z.string().max(80).optional(),
        category: z.string().max(40).optional(),
      },
      annotations: readOnlyAnnotations(),
    },
    (args) => tools.discoverProviders(args),
  );

  registerTool(
    server,
    "create_payment_intent",
    {
      title: "Create payment intent",
      description:
        "Create an idempotent payment intent for at most 0.01 USDC. This never settles funds and always requires human approval.",
      inputSchema: {
        providerId: z.string().min(2).max(80),
        amount: z.number().positive().max(0.01),
        idempotencyKey: z.string().min(8).max(120),
      },
      annotations: mutationAnnotations(),
    },
    (args) => tools.createPaymentIntent(args),
  );

  registerTool(
    server,
    "prepare_payment",
    {
      title: "Prepare payment",
      description:
        "Evaluate policy and prepare the selected Stellar payment. Returns a Spend Hub URL for mandatory human approval.",
      inputSchema: { intentId: z.string().min(3).max(160) },
      annotations: mutationAnnotations(),
    },
    (args) => tools.preparePayment(args),
  );

  registerTool(
    server,
    "get_payment_status",
    {
      title: "Get payment status",
      description: "Read policy, confirmation, and settlement state for an existing payment intent.",
      inputSchema: { intentId: z.string().min(3).max(160) },
      annotations: readOnlyAnnotations(),
    },
    (args) => tools.getPaymentStatus(args),
  );

  registerTool(
    server,
    "get_receipt",
    {
      title: "Get public receipt",
      description: "Read a sanitized public receipt after a user-approved settlement.",
      inputSchema: { intentId: z.string().min(3).max(160) },
      annotations: readOnlyAnnotations(),
    },
    (args) => tools.getReceipt(args),
  );

  return server;
}

function registerTool(server, name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return toMcpToolResult(await handler(args));
    } catch (error) {
      return toMcpToolError(error);
    }
  });
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
}

function mutationAnnotations() {
  return {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
}

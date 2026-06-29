import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join } from "node:path";
import { SpendHubService } from "../spendHubService.mjs";
import { createSpendHubMcpServer } from "./createMcpServer.mjs";
import { McpSpendHubTools } from "./mcpSpendHubTools.mjs";

const statePath = process.env.MCP_STATE_PATH || join(process.cwd(), "data", "runtime-state.json");
const appBaseUrl = process.env.MCP_APP_BASE_URL || "http://localhost:4179";
const service = await new SpendHubService({ statePath, env: process.env }).load();
const tools = new McpSpendHubTools({ service, appBaseUrl });
const server = createSpendHubMcpServer({ tools });
const transport = new StdioServerTransport();

await server.connect(transport);

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticatePilotRequest, clientIp } from "../pilotAuth.mjs";
import { PilotRateLimiter } from "../pilotRateLimit.mjs";
import { PilotService } from "../pilotService.mjs";
import { createPilotMcpServer } from "./createPilotMcpServer.mjs";

export async function handlePilotMcpHttp({
  request,
  response,
  env = process.env,
  pilotService = null,
  pilotServiceFactory = null,
  rateLimiter = null,
} = {}) {
  if (String(request.method || "").toUpperCase() !== "POST") {
    return writeRpcError(response, 405, -32000, "Method not allowed");
  }
  let server;
  let transport;
  try {
    const { tenantId } = authenticatePilotRequest(request, env);
    await (rateLimiter || new PilotRateLimiter({ env })).enforce({ tenantId, ip: clientIp(request) });
    const service = pilotService || pilotServiceFactory?.() || new PilotService({ env });
    server = createPilotMcpServer({ pilotService: service, tenantId });
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    if (!response.headersSent) {
      writeRpcError(response, normalizeStatus(error), -32000, publicMessage(error), error.retryAfter);
    }
  } finally {
    await transport?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}

function writeRpcError(response, status, code, message, retryAfter = null) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  response.writeHead(status, headers);
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

function normalizeStatus(error) {
  const status = Number(error?.status || 500);
  return status >= 400 && status <= 599 ? status : 500;
}

function publicMessage(error) {
  return error?.status ? error.message : "Internal server error";
}

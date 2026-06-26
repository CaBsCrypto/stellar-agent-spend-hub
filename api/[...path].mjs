import { join } from "node:path";
import { tmpdir } from "node:os";
import { SpendHubService } from "../src/spendHubService.mjs";
import { handleApi } from "../scripts/serve.mjs";

let servicePromise;

export default async function handler(request, response) {
  try {
    const service = await getService();
    const host = request.headers.host || "localhost";
    const url = new URL(request.url || "/api/health", `https://${host}`);
    await handleApi({ request, response, url, service, env: process.env });
  } catch (error) {
    response.writeHead(error.status || 500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message || "Internal server error" }));
  }
}

async function getService() {
  if (!servicePromise) {
    servicePromise = new SpendHubService({
      statePath: join(tmpdir(), "agente-pagos-stellar-runtime-state.json"),
      env: process.env,
    }).load();
  }
  return servicePromise;
}

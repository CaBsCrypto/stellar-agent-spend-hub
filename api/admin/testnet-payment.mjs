import { join } from "node:path";
import { tmpdir } from "node:os";
import { SpendHubService } from "../../src/spendHubService.mjs";
import { runAdminTestnetPayment } from "../../src/adminTestnetPayment.mjs";

let servicePromise;

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const service = await getService();
    const report = await runAdminTestnetPayment({ request, env: process.env, service });
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(report));
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
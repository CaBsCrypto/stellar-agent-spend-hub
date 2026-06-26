import { createServer as createProbeServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSpendHubServer } from "./serve.mjs";
import { runMachinePayment } from "./machine-agent-client.mjs";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const port = await getFreePort();
const baseUrl = `http://localhost:${port}`;
const statePath = join(tmpdir(), `agente-pagos-stellar-smoke-${Date.now()}.json`);
const { server } = await createSpendHubServer({ root: process.cwd(), port, statePath, env: process.env });

await new Promise((resolve) => server.listen(port, resolve));

try {
  await waitForHealth(baseUrl);
  const agentResult = await runMachinePayment({
    baseUrl,
    providerId: "browserbase-mcp",
    resource: "smoke-agent-resource",
    amount: "9",
    approvedBy: "smoke-user-passkey",
  });
  const state = await fetchJson(`${baseUrl}/api/state`);
  const page = await fetchText(`${baseUrl}/`);
  const scan = assertNoSensitiveData({ agentResult, summary: state.summary }, "smokeTranscript");
  if (!scan.allowed) {
    throw new Error(scan.reasons.join("; "));
  }
  if (!page.includes("Agente de Pagos Stellar")) {
    throw new Error("Dashboard shell did not render expected app title");
  }
  if (!state.readiness?.connectors?.localApi) {
    throw new Error("State readiness missing localApi connector");
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        agent: {
          challengeStatus: agentResult.challengeStatus,
          resourceStatus: agentResult.resourceStatus,
          receiptRail: agentResult.receiptRail,
          privacy: agentResult.privacy,
        },
        summary: state.summary,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 10_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await fetchJson(`${baseUrl}/api/health`);
      if (health.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become healthy: ${lastError?.message || "unknown error"}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.text();
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
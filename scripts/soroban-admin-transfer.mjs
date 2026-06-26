import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const endpoint = process.env.SOROBAN_TRANSFER_ENDPOINT || "http://localhost:4179/api/admin/soroban-transfer";
const token = process.env.SOROBAN_SUBMIT_ADMIN_TOKEN;
const mode = process.argv.includes("--submit") ? "submit" : "dry-run";
const idempotencyKey = process.env.SOROBAN_IDEMPOTENCY_KEY || `soroban-cli-${Date.now()}`;

if (!token) {
  console.error(JSON.stringify({ ok: false, error: "SOROBAN_SUBMIT_ADMIN_TOKEN is required" }, null, 2));
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        mode,
        amount: process.env.SOROBAN_TEST_AMOUNT || 1,
        nonce: process.env.SOROBAN_TRANSFER_NONCE,
        providerId: process.env.SOROBAN_PROVIDER_ID || "browserbase-mcp",
      }),
    });
    const payload = await response.json();
    const summary = response.ok
      ? {
          ok: payload.ok,
          status: payload.status,
          executionMode: payload.executionMode,
          transactionHash: payload.transactionHash,
          amount: payload.receipt?.amount,
          asset: payload.receipt?.asset,
          network: payload.receipt?.network,
          rail: payload.receipt?.rail,
          contractId: payload.receipt?.contractId,
          assetContractId: payload.receipt?.assetContractId,
          idempotentReplay: Boolean(payload.idempotentReplay),
        }
      : { ok: false, status: response.status, error: payload.error || "Soroban endpoint failed" };
    const scan = assertNoSensitiveData(summary, "sorobanAdminCliSummary");
    if (!scan.allowed) throw new Error("Sensitive data blocked from CLI summary");
    console.log(JSON.stringify(summary, null, 2));
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error.message || error) }, null, 2));
    process.exitCode = 1;
  }
}

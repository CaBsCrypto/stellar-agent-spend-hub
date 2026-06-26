import { readFile } from "node:fs/promises";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const endpoint = process.env.TESTNET_PAYMENT_ENDPOINT || "https://agente-pagos-stellar.vercel.app/api/admin/testnet-payment";
const token = process.env.TESTNET_PAYMENT_ADMIN_TOKEN || (await readLocalToken());

if (!token) {
  console.error(JSON.stringify({ ok: false, error: "Missing TESTNET_PAYMENT_ADMIN_TOKEN in local shell." }, null, 2));
  process.exit(1);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: "{}",
});

const rawBody = await response.text();
let body;
try {
  body = rawBody ? JSON.parse(rawBody) : {};
} catch {
  body = { error: "Non-JSON response from endpoint" };
}
const success = response.ok && body && typeof body.transactionHash === "string" && body.transactionHash.length > 0;
const report = success
  ? {
      ok: true,
      status: body.status,
      transactionHash: body.transactionHash,
      amount: body.amount,
      currency: body.currency,
      rail: body.rail,
      network: body.network,
      asset: body.asset,
      finality: body.finality,
      receiptId: body.receiptId,
      providerId: body.providerId,
      destination: body.destination,
      timestamp: body.timestamp,
    }
  : { ok: false, statusCode: response.status, error: body.error || "No transaction hash returned" };

const scan = assertNoSensitiveData(report, "vercelTestnetPaymentCliReport");
if (!scan.allowed) {
  console.error(JSON.stringify({ ok: false, error: "Sensitive data blocked from CLI report.", findings: scan.findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
process.exit(success ? 0 : 1);

async function readLocalToken() {
  try {
    const text = await readFile(".vercel/testnet-payment-admin-token.local", "utf8");
    const line = text.split(/\r?\n/).find((item) => item.startsWith("TESTNET_PAYMENT_ADMIN_TOKEN="));
    return line ? line.slice("TESTNET_PAYMENT_ADMIN_TOKEN=".length).trim() : "";
  } catch {
    return "";
  }
}




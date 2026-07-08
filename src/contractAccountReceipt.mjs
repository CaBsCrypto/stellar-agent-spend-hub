import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export function humanSummary(request) {
  if (request.action === "grant") {
    return {
      action: "Grant agent session",
      destination: request.destination,
      asset: "USDC",
      perPaymentLimit: "0.01",
      totalLimit: "0.02",
      expiresAt: request.expiresAt,
    };
  }
  if (request.action === "revoke") return { action: "Revoke agent session" };
  return {
    action: "Agent pays merchant",
    destination: request.destination,
    asset: "USDC",
    amount: formatStellarAmountBaseUnits(request.amount),
  };
}

export function safeContractAccountPublic(value) {
  const scan = assertNoSensitiveData(value, "contractAccountPublicResponse");
  if (!scan.allowed) throw httpError(500, "Sensitive contract account output blocked");
  return value;
}

function formatStellarAmountBaseUnits(amount) {
  const value = BigInt(amount);
  const whole = value / 10_000_000n;
  const fraction = String(value % 10_000_000n).padStart(7, "0");
  return `${whole}.${fraction}`;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
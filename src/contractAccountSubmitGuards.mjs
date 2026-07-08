import { CONTRACT_ACCOUNT_MAX_FEE } from "./contractAccountConfig.mjs";

export function ensureContractAccountSubmitEnabled(env) {
  if (String(env.CONTRACT_ACCOUNT_SUBMIT_ENABLED || "").toLowerCase() !== "true") {
    throw httpError(503, "Contract account submit gate is closed");
  }
}

export function validateSubmitPayload({ requestId, signedAuthEntryXdr, assertion } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId || "")) throw httpError(400, "Invalid requestId");
  if (!isSafeXdr(signedAuthEntryXdr) && !isStructuredAssertion(assertion)) {
    throw httpError(400, "A signed auth entry XDR or structured assertion is required");
  }
}

export function assertFeeWithinLimit(fee) {
  if (BigInt(fee) > CONTRACT_ACCOUNT_MAX_FEE) throw httpError(409, "Relayer fee exceeds 1 XLM");
}

export function isSafeXdr(value) {
  return typeof value === "string" && value.length >= 64 && value.length <= 16_384 && /^[A-Za-z0-9+/=]+$/.test(value);
}

export function isStructuredAssertion(assertion) {
  return assertion != null
    && typeof assertion === "object"
    && ["passkey", "session"].includes(assertion.type);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
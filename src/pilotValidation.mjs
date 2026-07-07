import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PILOT_AMOUNT_USDC } from "./pilotProvider.mjs";

export function validatePilotResourceId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) throw httpError(400, "Invalid pilot resourceId");
  if (id !== "stellar-risk-snapshot") throw httpError(403, "Pilot resource is not allowlisted");
  return id;
}

export function validatePilotAmount(value) {
  if (String(value) !== PILOT_AMOUNT_USDC && Number(value) !== Number(PILOT_AMOUNT_USDC)) {
    throw httpError(409, "Pilot amount must be exactly 0.01 USDC");
  }
  return PILOT_AMOUNT_USDC;
}

export function validatePilotIdempotencyKey(value) {
  const key = String(value || "");
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(key)) throw httpError(400, "Invalid idempotencyKey");
  return key;
}

export function pilotApprovalToken(secret, requestId, expiresAt) {
  return createHmac("sha256", secret).update(`${requestId}.${expiresAt}`).digest("base64url");
}

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function safeDigestEqual(expected, actual) {
  if (!/^[a-f0-9]{64}$/.test(String(expected || "")) || !/^[a-f0-9]{64}$/.test(String(actual || ""))) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

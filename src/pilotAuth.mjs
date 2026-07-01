import { createHash, timingSafeEqual } from "node:crypto";

export const PILOT_TENANT_ID = "merchant-lab-reference";

export function pilotReadiness(env = process.env) {
  const enabled = String(env.MCP_PILOT_ENABLED || "").toLowerCase() === "true";
  const apiKeyHash = normalizeHash(env.MCP_PILOT_API_KEY_HASH);
  const approvalSecret = String(env.MCP_PILOT_APPROVAL_SECRET || "");
  const configured = Boolean(apiKeyHash && approvalSecret.length >= 32);
  return {
    status: enabled && configured ? "ready" : enabled ? "blocked" : configured ? "guarded" : "disabled",
    enabled,
    configured,
    tenantId: PILOT_TENANT_ID,
    detail: !enabled
      ? "Remote MCP pilot gate is closed."
      : configured
        ? "Remote MCP pilot is enabled for the allowlisted tenant."
        : "Pilot API key hash and approval secret are required.",
  };
}

export function authenticatePilotRequest(request, env = process.env) {
  const readiness = pilotReadiness(env);
  if (!readiness.enabled) throw httpError(503, "Remote MCP pilot is disabled");
  if (!readiness.configured) throw httpError(503, "Remote MCP pilot is not configured");
  const authorization = String(header(request, "authorization") || "");
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{24,256})$/);
  if (!match) throw httpError(401, "Pilot bearer token is required");
  const actual = Buffer.from(hashApiKey(match[1]), "hex");
  const expected = Buffer.from(normalizeHash(env.MCP_PILOT_API_KEY_HASH), "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw httpError(401, "Pilot bearer token is invalid");
  }
  return { tenantId: PILOT_TENANT_ID };
}

export function hashApiKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function clientIp(request) {
  const value = header(request, "x-forwarded-for") || header(request, "x-real-ip") || "local";
  return String(value).split(",")[0].trim().slice(0, 96);
}

function header(request, name) {
  return request?.headers?.[name] || request?.headers?.get?.(name);
}

function normalizeHash(value) {
  const hash = String(value || "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

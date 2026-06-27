import { StrKey } from "@stellar/stellar-sdk";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

const NETWORK = "stellar:testnet";
const PRIVACY_REQUIREMENTS = new Set([
  "no-pii-receipts",
  "no-secrets-in-metadata",
  "human-confirmation-v1",
]);

export const STELLAR_RISK_PROVIDER = Object.freeze(validateProviderDefinition({
  providerId: "stellar-risk-api",
  name: "Stellar Risk API",
  endpoint: "/api/mpp/stellar-risk",
  resource: "Horizon-backed transaction heuristic report",
  maxPrice: "0.01",
  asset: "USDC",
  assetContractId: USDC_SAC_TESTNET,
  network: NETWORK,
  legalContextUrl: null,
  privacyRequirements: [...PRIVACY_REQUIREMENTS],
}));

export function validateProviderDefinition(input = {}) {
  const providerId = String(input.providerId || "");
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(providerId)) throw httpError(400, "Invalid providerId");
  const name = bounded(input.name, 3, 80, "name");
  const endpoint = validateEndpoint(input.endpoint);
  const resource = bounded(input.resource, 3, 160, "resource");
  const maxPrice = validatePrice(input.maxPrice);
  if (input.asset !== "USDC") throw httpError(409, "Provider Kit v1 only supports USDC");
  if (input.network !== NETWORK) throw httpError(409, "Provider Kit v1 is testnet-only");
  if (input.assetContractId !== USDC_SAC_TESTNET || !StrKey.isValidContract(input.assetContractId)) {
    throw httpError(409, "Provider Kit v1 requires Stellar testnet USDC SAC");
  }
  const legalContextUrl = validateOptionalHttpsUrl(input.legalContextUrl);
  const privacyRequirements = [...new Set(input.privacyRequirements || [])];
  if (!privacyRequirements.length || privacyRequirements.some((item) => !PRIVACY_REQUIREMENTS.has(item))) {
    throw httpError(400, "Unsupported privacy requirements");
  }
  const value = {
    version: "spendhub-provider-v1",
    providerId,
    name,
    endpoint,
    resource,
    maxPrice,
    asset: "USDC",
    assetContractId: USDC_SAC_TESTNET,
    network: NETWORK,
    legalContextUrl,
    privacyRequirements,
  };
  const scan = assertNoSensitiveData(value, "providerDefinition");
  if (!scan.allowed) throw httpError(400, scan.reasons.join("; "));
  return value;
}

export function createPaidProviderHandler({ definition, authorize, loadResource }) {
  const provider = validateProviderDefinition(definition);
  if (typeof authorize !== "function" || typeof loadResource !== "function") {
    throw new TypeError("authorize and loadResource are required");
  }
  return async function handle(request) {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    const authorization = await authorize(request, provider);
    if (!authorization?.paid && authorization?.response instanceof Response) {
      return authorization.response;
    }
    if (!authorization?.paid) {
      return json({
        error: "Payment Required",
        protocol: "mpp/stellar-charge",
        provider,
        challenge: authorization?.challenge || null,
      }, 402, authorization?.headers);
    }
    const resource = await loadResource(request, provider);
    const payload = {
      provider,
      resource,
      receipt: authorization.receipt || { protocol: "mpp/stellar-charge", status: "settled" },
    };
    const scan = assertNoSensitiveData(payload, "providerResponse");
    if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
    const response = json(payload, 200, authorization.headers);
    return typeof authorization.wrapResponse === "function"
      ? authorization.wrapResponse(response)
      : response;
  };
}

export function createOfficialMppAuthorizer({ runtime, amount = "0.01", description, scope }) {
  if (!runtime?.charge || typeof runtime.charge !== "function") throw new TypeError("Official MPP runtime is required");
  return async function authorize(request, provider) {
    const result = await runtime.charge({
      amount,
      description: description || provider.resource,
      expires: new Date(Date.now() + 10 * 60 * 1000),
      scope: typeof scope === "function" ? scope(request, provider) : `${provider.providerId}:${provider.resource}`,
      meta: { providerId: provider.providerId },
    })(request);
    if (result.status === 402) return { paid: false, response: result.challenge };
    return {
      paid: true,
      receipt: { protocol: "mpp/stellar-charge", status: "settled" },
      wrapResponse: (response) => result.withReceipt(response),
    };
  };
}

function validateEndpoint(value) {
  const endpoint = String(value || "");
  if (endpoint.startsWith("/api/")) return endpoint;
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw httpError(400, "Invalid provider endpoint");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw httpError(400, "Provider endpoint must use HTTPS");
  }
  return parsed.toString();
}

function validateOptionalHttpsUrl(value) {
  if (value == null || value === "") return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError(400, "Invalid legalContextUrl");
  }
  if (parsed.protocol !== "https:") throw httpError(400, "legalContextUrl must use HTTPS");
  return parsed.toString();
}

function validatePrice(value) {
  const price = String(value || "");
  if (!/^\d+\.\d{1,7}$/.test(price) || Number(price) <= 0 || Number(price) > 0.01) {
    throw httpError(409, "Provider maxPrice must be between 0 and 0.01 USDC");
  }
  return price;
}

function bounded(value, min, max, field) {
  const text = String(value || "").trim();
  if (text.length < min || text.length > max) throw httpError(400, `Invalid ${field}`);
  return text;
}

function json(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

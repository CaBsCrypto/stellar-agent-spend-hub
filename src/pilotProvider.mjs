import { StrKey } from "@stellar/stellar-sdk";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export const PILOT_NETWORK = "stellar:testnet";
export const PILOT_AMOUNT_USDC = "0.01";
export const MERCHANT_LAB_PROVIDER_ID = "stellar-agent-merchant-lab";
export const MERCHANT_LAB_ORIGIN = "https://stellar-agent-merchant-lab.vercel.app";

export function createPilotProviderRegistry(env = process.env) {
  const recipient = String(env.MCP_PILOT_MERCHANT_RECIPIENT || env.MPP_STELLAR_RECIPIENT || "");
  const provider = {
    version: "spendhub-provider-v1",
    providerId: MERCHANT_LAB_PROVIDER_ID,
    name: "Stellar Agent Merchant Lab",
    endpoint: `${MERCHANT_LAB_ORIGIN}/api/resource/stellar-risk-snapshot`,
    resource: "Merchant Lab Stellar risk snapshot",
    maxPrice: PILOT_AMOUNT_USDC,
    asset: "USDC",
    assetContractId: USDC_SAC_TESTNET,
    network: PILOT_NETWORK,
    recipient,
    legalContextUrl: `${MERCHANT_LAB_ORIGIN}/.well-known/legal-context.json`,
    privacyRequirements: [
      "no-pii-receipts",
      "no-secrets-in-metadata",
      "human-confirmation-v1",
    ],
  };
  validatePilotProvider(provider);
  return new Map([[provider.providerId, Object.freeze(provider)]]);
}

export function validatePilotProvider(provider) {
  if (provider.providerId !== MERCHANT_LAB_PROVIDER_ID) throw httpError(403, "Provider is not allowlisted");
  strictUrl(provider.endpoint, "/api/resource/stellar-risk-snapshot");
  strictUrl(provider.legalContextUrl, "/.well-known/legal-context.json");
  if (provider.network !== PILOT_NETWORK) throw httpError(409, "Pilot only supports Stellar testnet");
  if (provider.asset !== "USDC" || provider.assetContractId !== USDC_SAC_TESTNET) {
    throw httpError(409, "Pilot only supports the official testnet USDC SAC");
  }
  if (provider.maxPrice !== PILOT_AMOUNT_USDC) throw httpError(409, "Pilot price must be exactly 0.01 USDC");
  if (!StrKey.isValidEd25519PublicKey(provider.recipient)) {
    throw httpError(503, "Pilot merchant recipient is not configured");
  }
  const scan = assertNoSensitiveData(provider, "pilotProvider");
  if (!scan.allowed) throw httpError(400, scan.reasons.join("; "));
  return provider;
}

export function publicPilotProvider(provider) {
  return {
    version: provider.version,
    providerId: provider.providerId,
    name: provider.name,
    endpoint: provider.endpoint,
    resource: provider.resource,
    maxPrice: provider.maxPrice,
    asset: provider.asset,
    assetContractId: provider.assetContractId,
    network: provider.network,
    recipient: provider.recipient,
    legalContextUrl: provider.legalContextUrl,
    privacyRequirements: [...provider.privacyRequirements],
  };
}

function strictUrl(value, pathname) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError(400, "Invalid provider URL");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== MERCHANT_LAB_ORIGIN || parsed.pathname !== pathname) {
    throw httpError(403, "Provider URL is not allowlisted");
  }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    throw httpError(400, "Provider URL contains unsupported components");
  }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

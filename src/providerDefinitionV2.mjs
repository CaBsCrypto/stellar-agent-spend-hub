import { getAddress, isAddress } from "viem";
import { NetworkId, requireChain } from "./chainRegistry.mjs";
import { parseTokenAmount } from "./multichainMoney.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

const PROTOCOLS = new Set(["stellar-mpp", "stellar-contract-account", "x402"]);

export function normalizeProviderDefinition(provider, env = process.env) {
  if (!provider || typeof provider !== "object") throw httpError(400, "Provider definition is required");
  const base = {
    version: "spendhub-provider-v2",
    providerId: bounded(provider.providerId, 3, 64, "providerId"),
    name: bounded(provider.name, 3, 100, "name"),
    endpoint: validateEndpoint(provider.endpoint),
    resource: bounded(provider.resource || provider.description || provider.name, 3, 180, "resource"),
    legalContextUrl: optionalHttps(provider.legalContextUrl),
    privacyRequirements: [...new Set(provider.privacyRequirements || [provider.privacyRequirement].filter(Boolean))],
  };
  const options = Array.isArray(provider.paymentOptions) && provider.paymentOptions.length
    ? provider.paymentOptions
    : [legacyOption(provider)];
  const value = {
    ...base,
    paymentOptions: options.map((option, index) => normalizePaymentOption(option, index, env)),
  };
  const scan = assertNoSensitiveData(value, "providerDefinitionV2");
  if (!scan.allowed) throw httpError(400, scan.reasons.join("; "));
  return value;
}

export function normalizePaymentOption(option, index = 0, env = process.env) {
  const network = String(option.network || NetworkId.stellarTestnet);
  const chain = requireChain(network, env);
  const protocol = String(option.protocol || protocolForNetwork(network));
  if (!PROTOCOLS.has(protocol)) throw httpError(400, `Unsupported payment protocol at option ${index}`);
  if (protocol === "x402" && chain.family !== "evm") throw httpError(409, "x402 option requires an EVM network");
  if (protocol.startsWith("stellar-") && chain.family !== "stellar") {
    throw httpError(409, "Stellar payment protocol requires Stellar network");
  }
  const money = parseTokenAmount(option.maxPrice || option.amount || "0.01", chain.asset.decimals);
  const assetId = String(option.assetId || option.assetContractId || chain.asset.id);
  if (assetId.toLowerCase() !== chain.asset.id.toLowerCase()) throw httpError(409, "Payment option asset is not allowlisted");
  const recipient = validateRecipient(option.recipient || option.payTo || option.destinationAddress, chain, protocol);
  return {
    optionId: String(option.optionId || `${protocol}:${network}`),
    protocol,
    network,
    asset: "USDC",
    assetId: chain.family === "evm" ? getAddress(assetId) : assetId,
    amount: money.amount,
    amountBaseUnits: money.amountBaseUnits,
    decimals: money.decimals,
    recipient,
    status: option.status === "disabled" ? "disabled" : "available",
  };
}

function legacyOption(provider) {
  const network = provider.network || NetworkId.stellarTestnet;
  return {
    protocol: provider.paymentMethod?.includes("contract") ? "stellar-contract-account" : protocolForNetwork(network),
    network,
    maxPrice: provider.maxPrice || provider.amount || "0.01",
    assetId: provider.assetContractId,
    recipient: provider.recipient || provider.destinationAddress || null,
    status: provider.status === "disabled" ? "disabled" : "available",
  };
}

function protocolForNetwork(network) {
  return network === NetworkId.stellarTestnet ? "stellar-mpp" : "x402";
}

function validateRecipient(recipient, chain, protocol) {
  if (!recipient && protocol.startsWith("stellar-")) return null;
  const value = String(recipient || "");
  if (chain.family === "evm") {
    if (!isAddress(value)) throw httpError(503, "EVM merchant recipient is not configured");
    return getAddress(value);
  }
  if (!/^[GCM][A-Z2-7]{55}$/.test(value)) throw httpError(503, "Stellar recipient is not configured");
  return value;
}

function validateEndpoint(value) {
  const endpoint = String(value || "");
  if (endpoint.startsWith("/api/")) return endpoint;
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error();
    return parsed.toString();
  } catch {
    throw httpError(400, "Provider endpoint must be HTTPS or an internal API path");
  }
}

function optionalHttps(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw httpError(400, "legalContextUrl must use HTTPS");
  }
}

function bounded(value, min, max, field) {
  const text = String(value || "").trim();
  if (text.length < min || text.length > max) throw httpError(400, `Invalid ${field}`);
  return text;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

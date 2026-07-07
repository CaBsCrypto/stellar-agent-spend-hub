import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { readUpstashConfig } from "./upstashConfig.mjs";

export const CONTRACT_ACCOUNT_NETWORK = "stellar:testnet";
export const CONTRACT_ACCOUNT_PER_PAYMENT_LIMIT = 100_000n;
export const CONTRACT_ACCOUNT_TOTAL_LIMIT = 200_000n;
export const CONTRACT_ACCOUNT_MAX_FEE = 10_000_000n;

export function contractAccountReadiness(env = process.env) {
  const enabled = String(env.CONTRACT_ACCOUNT_ENABLED || "").toLowerCase() === "true";
  const submitEnabled = String(env.CONTRACT_ACCOUNT_SUBMIT_ENABLED || "").toLowerCase() === "true";
  const contractValid = StrKey.isValidContract(env.CONTRACT_ACCOUNT_ID || "");
  const merchantValid = StrKey.isValidEd25519PublicKey(env.CONTRACT_ACCOUNT_MERCHANT || "");
  const relayerValid = readRelayerPublicKey(env) != null;
  const upstash = readUpstashConfig(env).configured;
  return {
    status: enabled && contractValid && merchantValid && relayerValid && upstash
      ? submitEnabled ? "ready-submit-testnet" : "ready-preview"
      : enabled ? "blocked" : "disabled",
    enabled,
    submitEnabled,
    network: CONTRACT_ACCOUNT_NETWORK,
    contractId: contractValid ? env.CONTRACT_ACCOUNT_ID : null,
    merchant: merchantValid ? env.CONTRACT_ACCOUNT_MERCHANT : null,
    assetContractId: USDC_SAC_TESTNET,
    relayerPublicKey: readRelayerPublicKey(env),
    upstash,
    missing: [
      !contractValid && "CONTRACT_ACCOUNT_ID",
      !merchantValid && "CONTRACT_ACCOUNT_MERCHANT",
      !relayerValid && "CONTRACT_ACCOUNT_RELAYER_SECRET",
      !upstash && "UPSTASH_OR_KV_REST_API_CREDENTIALS",
    ].filter(Boolean),
  };
}

export function validateContractAccountConfig(env = process.env) {
  if (String(env.CONTRACT_ACCOUNT_ENABLED || "").toLowerCase() !== "true") {
    throw httpError(503, "Contract account runtime is disabled");
  }
  if ((env.CONTRACT_ACCOUNT_NETWORK || CONTRACT_ACCOUNT_NETWORK) !== CONTRACT_ACCOUNT_NETWORK) {
    throw httpError(409, "Only Stellar testnet contract accounts are allowed");
  }
  const contractId = env.CONTRACT_ACCOUNT_ID || "";
  const merchant = env.CONTRACT_ACCOUNT_MERCHANT || "";
  const relayerSecret = env.CONTRACT_ACCOUNT_RELAYER_SECRET || "";
  if (contractId && !StrKey.isValidContract(contractId)) throw httpError(503, "CONTRACT_ACCOUNT_ID is invalid");
  if (!StrKey.isValidEd25519PublicKey(merchant)) throw httpError(503, "CONTRACT_ACCOUNT_MERCHANT is invalid");
  if (!StrKey.isValidEd25519SecretSeed(relayerSecret)) {
    throw httpError(503, "CONTRACT_ACCOUNT_RELAYER_SECRET is invalid");
  }
  return {
    contractId,
    merchant,
    relayerSecret,
    sessionPublicKey: env.CONTRACT_ACCOUNT_SESSION_PUBLIC_KEY || "",
    assetContractId: USDC_SAC_TESTNET,
    rpcUrl: env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  };
}

function readRelayerPublicKey(env) {
  try {
    return Keypair.fromSecret(env.CONTRACT_ACCOUNT_RELAYER_SECRET || "").publicKey();
  } catch {
    return null;
  }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

import { createHash } from "node:crypto";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";
const KNOWN_OPERATION_TYPES = new Set([
  "account_merge",
  "allow_trust",
  "begin_sponsoring_future_reserves",
  "bump_sequence",
  "change_trust",
  "claim_claimable_balance",
  "clawback",
  "clawback_claimable_balance",
  "create_account",
  "create_claimable_balance",
  "create_passive_sell_offer",
  "end_sponsoring_future_reserves",
  "extend_footprint_ttl",
  "inflation",
  "invoke_host_function",
  "liquidity_pool_deposit",
  "liquidity_pool_withdraw",
  "manage_buy_offer",
  "manage_data",
  "manage_sell_offer",
  "path_payment_strict_receive",
  "path_payment_strict_send",
  "payment",
  "restore_footprint",
  "revoke_sponsorship",
  "set_options",
  "set_trust_line_flags",
]);

export function validateTransactionHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw httpError(400, "tx must be a 64-character hexadecimal Stellar transaction hash");
  }
  return hash;
}

export async function buildStellarRiskReport(
  transactionHash,
  {
    fetchImpl = globalThis.fetch,
    horizonUrl = DEFAULT_HORIZON_URL,
    now = () => new Date(),
  } = {},
) {
  const hash = validateTransactionHash(transactionHash);
  const baseUrl = String(horizonUrl || DEFAULT_HORIZON_URL).replace(/\/+$/, "");
  assertTestnetHorizon(baseUrl);

  const transactionResponse = await safeFetch(fetchImpl, `${baseUrl}/transactions/${hash}`);
  if (transactionResponse.status === 404) throw httpError(404, "Stellar testnet transaction not found");
  if (!transactionResponse.ok) throw httpError(503, "Horizon transaction lookup is unavailable");

  const transaction = await transactionResponse.json();
  const operationsResponse = await safeFetch(fetchImpl, `${baseUrl}/transactions/${hash}/operations?limit=200`);
  if (!operationsResponse.ok) throw httpError(503, "Horizon operation lookup is unavailable");
  const operationsPayload = await operationsResponse.json();
  const operations = operationsPayload?._embedded?.records || [];
  const operationTypes = [...new Set(operations.map((operation) => operation.type).filter(Boolean))];
  const unknownOperationTypes = operationTypes.filter((type) => !KNOWN_OPERATION_TYPES.has(type));
  const flags = [];

  if (transaction.successful === false) flags.push("transaction_failed");
  if (operations.length > 10) flags.push("high_operation_count");
  if (unknownOperationTypes.length > 0) flags.push("unknown_operation_type");
  if (operationTypes.includes("invoke_host_function")) flags.push("soroban_contract_invocation");
  if (transaction.memo_type && transaction.memo_type !== "none") flags.push("memo_present");

  const reviewLevel = transaction.successful === false
    ? "high"
    : operations.length > 10 || unknownOperationTypes.length > 0
      ? "medium"
      : "low";

  const report = {
    reportType: "stellar-transaction-heuristic-v1",
    disclaimer: "Technical heuristic only; not AML, sanctions, legal, or investment advice.",
    transactionHash: hash,
    network: "stellar:testnet",
    successful: Boolean(transaction.successful),
    ledger: Number(transaction.ledger),
    createdAt: transaction.created_at,
    feeChargedStroops: String(transaction.fee_charged || "0"),
    operationCount: operations.length,
    operationTypes,
    unknownOperationTypes,
    sourceAccount: transaction.source_account,
    memoPresent: Boolean(transaction.memo_type && transaction.memo_type !== "none"),
    reviewLevel,
    flags,
    generatedAt: now().toISOString(),
    resourceHash: createHash("sha256").update(`stellar-risk:${hash}`).digest("hex"),
  };
  const scan = assertNoSensitiveData(report, "stellarRiskReport");
  if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
  return report;
}

function assertTestnetHorizon(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "horizon-testnet.stellar.org") {
    throw httpError(409, "Only the official Stellar testnet Horizon endpoint is allowed");
  }
}

async function safeFetch(fetchImpl, url) {
  try {
    return await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw httpError(503, "Horizon is unavailable");
  }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}


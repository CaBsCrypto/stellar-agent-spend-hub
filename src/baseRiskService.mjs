import { getAddress, isAddress } from "viem";
import { NetworkId } from "./chainRegistry.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export function validateEvmTransactionHash(value) {
  const hash = String(value || "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) throw httpError(400, "tx must be a 0x-prefixed 32-byte hash");
  return hash;
}

export async function buildBaseRiskReport(
  transactionHash,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  const hash = validateEvmTransactionHash(transactionHash);
  const rpcUrl = validateRpcUrl(env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  const [transaction, receipt] = await Promise.all([
    rpc(fetchImpl, rpcUrl, "eth_getTransactionByHash", [hash]),
    rpc(fetchImpl, rpcUrl, "eth_getTransactionReceipt", [hash]),
  ]);
  if (!transaction || !receipt) throw httpError(404, "Base Sepolia transaction not found");
  const successful = receipt.status === "0x1";
  const report = {
    reportType: "technical-transaction-heuristic",
    disclaimer: "Technical transaction analysis only; not AML or financial advice.",
    network: NetworkId.baseSepolia,
    transactionHash: hash,
    successful,
    blockNumber: hexQuantity(receipt.blockNumber),
    from: isAddress(transaction.from || "") ? getAddress(transaction.from) : null,
    to: isAddress(transaction.to || "") ? getAddress(transaction.to) : null,
    valueWei: BigInt(transaction.value || "0x0").toString(),
    gasUsed: BigInt(receipt.gasUsed || "0x0").toString(),
    contractCreated: Boolean(receipt.contractAddress),
    flags: [
      ...(successful ? [] : ["execution-reverted"]),
      ...(receipt.contractAddress ? ["contract-creation"] : []),
      ...(!transaction.to ? ["missing-recipient"] : []),
    ],
    generatedAt: new Date().toISOString(),
  };
  const scan = assertNoSensitiveData(report, "baseRiskReport");
  if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
  return report;
}

async function rpc(fetchImpl, url, method, params) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    });
  } catch {
    throw httpError(503, "Base Sepolia RPC unavailable");
  }
  if (!response.ok) throw httpError(503, "Base Sepolia RPC unavailable");
  const payload = await response.json();
  if (payload.error) throw httpError(502, "Base Sepolia RPC rejected the request");
  return payload.result;
}

function validateRpcUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError(503, "Base Sepolia RPC URL is invalid");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw httpError(503, "Base Sepolia RPC must use HTTPS");
  }
  return parsed.toString();
}

function hexQuantity(value) {
  return value ? BigInt(value).toString() : null;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

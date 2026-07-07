import { decodeEventLog, decodeFunctionData, getAddress, isAddress } from "viem";
import { BASE_SEPOLIA_USDC, NetworkId, explorerTransactionUrl } from "./chainRegistry.mjs";
import { CCTP_BURN_ABI, buildCctpForwarderHookData, contractStrkeyToBytes32 } from "./cctpBridgeAdapter.mjs";
import { assertSafe } from "./multichainPublicViews.mjs";
export function sanitizeSettlement(receipt, env) {
  const network = String(receipt.network || "");
  if (network !== NetworkId.baseSepolia) throw httpError(409, "Only Base Sepolia settlement is accepted");
  const transactionHash = validateEvmHash(receipt.transactionHash);
  if (String(receipt.assetId || "").toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase()) {
    throw httpError(409, "Settlement asset is not Base Sepolia USDC");
  }
  const configuredRecipient = String(env.BASE_X402_MERCHANT_ADDRESS || "");
  if (!isAddress(configuredRecipient) || !isAddress(receipt.recipient || "")
    || getAddress(receipt.recipient) !== getAddress(configuredRecipient)) {
    throw httpError(409, "Settlement recipient does not match the configured merchant");
  }
  const value = {
    id: String(receipt.id || `base-x402-${transactionHash.slice(2, 14)}`),
    protocol: "x402",
    network,
    chainId: 84532,
    asset: "USDC",
    assetId: String(receipt.assetId || ""),
    amount: "0.01",
    amountBaseUnits: "10000",
    decimals: 6,
    payer: isAddress(receipt.payer || "") ? getAddress(receipt.payer) : null,
    recipient: isAddress(receipt.recipient || "") ? getAddress(receipt.recipient) : null,
    transactionHash,
    explorerUrl: explorerTransactionUrl(network, transactionHash, env),
    routeDecision: "base-x402-provider-required",
    approvedBy: "privy-user-confirmation",
    settledAt: receipt.settledAt || new Date().toISOString(),
  };
  if (!value.payer || !value.recipient) throw httpError(400, "Settlement payer and recipient are required");
  assertSafe(value, "multichainSettlement");
  return value;
}

export async function verifyBaseTransaction(hash, { env, fetchImpl }) {
  const rpcUrl = String(env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
  });
  if (!response.ok) throw httpError(502, "Base Sepolia RPC unavailable");
  const payload = await response.json();
  if (!payload.result) throw httpError(404, "Base Sepolia transaction not found");
  if (payload.result.status !== "0x1") throw httpError(409, "Base Sepolia transaction failed");
  return payload.result;
}

export async function readCircleMessage(hash, { fetchImpl }) {
  const response = await fetchImpl(`https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash=${encodeURIComponent(hash)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return Array.isArray(payload.messages) ? payload.messages[0] || null : null;
}

export function applyCircleStatus(record, message, now, destinationVerified = false) {
  const status = String(message.status || "").toLowerCase();
  record.attestationStatus = status || "pending";
  if (status === "complete") {
    const destinationHash = message.destinationTxHash || message.destinationTransactionHash || null;
    if (!destinationHash || !/^[a-f0-9]{64}$/i.test(String(destinationHash).replace(/^0x/, ""))) {
      record.status = "forwarding";
      return record;
    }
    record.destinationTransactionHash = String(destinationHash).replace(/^0x/, "").toLowerCase();
    record.status = destinationVerified ? "settled" : "forwarding";
    record.destinationVerified = destinationVerified;
    record.settledAt = destinationVerified ? now.toISOString() : null;
  } else if (["failed", "expired"].includes(status)) {
    record.status = "manual_review";
  } else {
    record.status = status === "pending_confirmations" ? "attesting" : "forwarding";
  }
  return record;
}

export function validatePreparedCctpBurn(transaction, intent) {
  if (
    !transaction
    || !isAddress(transaction.to || "")
    || getAddress(transaction.to) !== getAddress(intent.tokenMessenger)
    || !isAddress(transaction.from || "")
    || getAddress(transaction.from) !== getAddress(intent.sourceAddress)
  ) {
    throw httpError(409, "CCTP burn transaction does not match the prepared source and TokenMessenger");
  }
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: CCTP_BURN_ABI, data: transaction.input || transaction.data });
  } catch {
    throw httpError(409, "CCTP burn calldata is invalid");
  }
  if (decoded.functionName !== "depositForBurnWithHook") throw httpError(409, "Unexpected CCTP burn function");
  const [amount, domain, mintRecipient, burnToken, destinationCaller, maxFee, finality, hookData] = decoded.args;
  const expectedForwarder = contractStrkeyToBytes32(intent.cctpForwarder).toLowerCase();
  const valid = (
    BigInt(amount) === BigInt(intent.amountBaseUnits)
    && Number(domain) === intent.destinationDomain
    && String(mintRecipient).toLowerCase() === expectedForwarder
    && getAddress(burnToken) === getAddress(intent.burnToken)
    && String(destinationCaller).toLowerCase() === expectedForwarder
    && BigInt(maxFee) === 0n
    && Number(finality) === intent.finalityThreshold
    && String(hookData).toLowerCase() === buildCctpForwarderHookData(intent.destinationAddress).toLowerCase()
  );
  if (!valid) throw httpError(409, "CCTP burn calldata does not match the prepared bridge intent");
  return true;
}

export async function readBaseTransaction(hash, { env, fetchImpl }) {
  const rpcUrl = String(env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionByHash", params: [hash] }),
  });
  if (!response.ok) throw httpError(502, "Base Sepolia RPC unavailable");
  const payload = await response.json();
  if (!payload.result) throw httpError(404, "Base Sepolia transaction not found");
  return payload.result;
}

export function circleDestinationHash(message) {
  const value = message.destinationTxHash || message.destinationTransactionHash || null;
  if (!value || !/^[a-f0-9]{64}$/i.test(String(value).replace(/^0x/, ""))) return null;
  return String(value).replace(/^0x/, "").toLowerCase();
}

export async function verifyStellarDestinationTransaction(hash, { env, fetchImpl }) {
  const horizon = String(env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org").replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${horizon}/transactions/${encodeURIComponent(hash)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const transaction = await response.json();
    return transaction.successful === true && String(transaction.hash || "").toLowerCase() === hash;
  } catch {
    return false;
  }
}

export function findExactUsdcTransfer(logs, receipt) {
  for (const log of logs) {
    if (String(log.address || "").toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: [{
          type: "event",
          name: "Transfer",
          inputs: [
            { indexed: true, name: "from", type: "address" },
            { indexed: true, name: "to", type: "address" },
            { indexed: false, name: "value", type: "uint256" },
          ],
        }],
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.eventName === "Transfer"
        && decoded.args.value === 10000n
        && getAddress(decoded.args.to) === getAddress(receipt.recipient)
        && (!receipt.payer || getAddress(decoded.args.from) === getAddress(receipt.payer))
      ) {
        return { from: getAddress(decoded.args.from), to: getAddress(decoded.args.to) };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function validateEvmHash(value) {
  const hash = String(value || "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) throw httpError(400, "Invalid EVM transaction hash");
  return hash;
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

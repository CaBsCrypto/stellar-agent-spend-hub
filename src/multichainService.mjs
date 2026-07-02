import { decodeEventLog, decodeFunctionData, getAddress, isAddress } from "viem";
import { BASE_SEPOLIA_USDC } from "./chainRegistry.mjs";
import { CCTP_BURN_ABI, CctpBridgeAdapter, buildCctpForwarderHookData, contractStrkeyToBytes32 } from "./cctpBridgeAdapter.mjs";
import { NetworkId, explorerTransactionUrl, publicChains } from "./chainRegistry.mjs";
import { MultichainRepository, multichainRepositoryReadiness } from "./multichainRepository.mjs";
import { RailRegistry } from "./railRegistry.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export class MultichainService {
  constructor({ env = process.env, repository = null, now = () => new Date(), fetchImpl = globalThis.fetch } = {}) {
    this.env = env;
    this.repository = repository || new MultichainRepository({ env });
    this.now = now;
    this.fetch = fetchImpl;
    this.rails = new RailRegistry({ env, now });
    this.cctp = new CctpBridgeAdapter({ env });
  }

  chains() {
    return {
      strategy: "stellar-first-multichain-execution",
      chains: publicChains(this.env),
      rails: this.rails.readiness(),
      repository: multichainRepositoryReadiness(this.env),
      gates: publicGates(this.env),
    };
  }

  treasury({ evmAddress = null } = {}) {
    const address = evmAddress && isAddress(evmAddress) ? getAddress(evmAddress) : null;
    return {
      authority: {
        stellar: "passkey-contract-account",
        evm: "privy-embedded-wallet",
      },
      evmAddress: address,
      stellarAddress: publicStellarAddress(this.env.CCTP_STELLAR_DESTINATION),
      balances: {
        [NetworkId.stellarTestnet]: { USDC: "0", status: "query-client-or-ledger" },
        [NetworkId.baseSepolia]: { USDC: "0", status: address ? "query-client" : "wallet-not-connected" },
        [NetworkId.avalancheFuji]: { USDC: "0", status: "dry-run-only" },
      },
      bridge: this.cctp.readiness(),
      automaticBridging: false,
    };
  }

  async quote({ provider, balances, allowedNetworks, preferredNetwork }) {
    const quote = this.rails.quote({ provider, balances, allowedNetworks, preferredNetwork });
    const now = this.now().toISOString();
    await this.repository.create({
      version: 1,
      kind: "quote",
      id: quote.quoteId,
      status: quote.recommendation ? "quoted" : "blocked",
      quote,
      createdAt: now,
      updatedAt: now,
    });
    return quote;
  }

  async createBridge(input) {
    if (!flag(this.env.CCTP_ENABLED)) throw httpError(503, "CCTP bridge is disabled");
    const intent = this.cctp.createIntent(input);
    await this.repository.create(intent);
    return publicBridge(intent);
  }

  async prepareBridge(id) {
    const intent = await this.requireBridge(id);
    const prepared = this.cctp.prepare(intent);
    const updated = await this.repository.update("bridge", id, (record) => {
      if (!["created", "prepared"].includes(record.status)) throw httpError(409, "Bridge is not preparable");
      record.status = "prepared";
      record.quote = prepared.quote;
      return record;
    });
    return { ...prepared, intent: publicBridge(updated) };
  }

  async recordBurn(id, { transactionHash }) {
    if (!flag(this.env.CCTP_SUBMIT_ENABLED)) throw httpError(409, "CCTP submit gate is closed");
    const intent = await this.requireBridge(id);
    if (intent.status !== "prepared") throw httpError(409, "Bridge must be prepared before recording burn");
    const hash = validateEvmHash(transactionHash);
    const [receipt, transaction] = await Promise.all([
      verifyBaseTransaction(hash, { env: this.env, fetchImpl: this.fetch }),
      readBaseTransaction(hash, { env: this.env, fetchImpl: this.fetch }),
    ]);
    validatePreparedCctpBurn(transaction, intent);
    const updated = await this.repository.update("bridge", id, (record) => {
      if (record.status !== "prepared") throw httpError(409, "Bridge burn was already recorded");
      record.status = "burn_submitted";
      record.burnTransactionHash = hash;
      record.burnBlockNumber = receipt.blockNumber;
      record.attestationStatus = "pending";
      return record;
    });
    return publicBridge(updated);
  }

  async bridgeStatus(id) {
    let intent = await this.requireBridge(id);
    if (intent.burnTransactionHash && !["settled", "failed", "manual_review"].includes(intent.status)) {
      const message = await readCircleMessage(intent.burnTransactionHash, { fetchImpl: this.fetch });
      if (message) {
        const destinationHash = circleDestinationHash(message);
        const destinationVerified = destinationHash
          ? await verifyStellarDestinationTransaction(destinationHash, { env: this.env, fetchImpl: this.fetch })
          : false;
        intent = await this.repository.update(
          "bridge",
          id,
          (record) => applyCircleStatus(record, message, this.now(), destinationVerified),
        );
      }
    }
    return publicBridge(intent);
  }

  async evidence() {
    const [bridges, receipts] = await Promise.all([
      this.repository.list("bridge", 20),
      this.repository.list("settlement", 20),
    ]);
    return {
      version: "multichain-evidence-v1",
      generatedAt: this.now().toISOString(),
      frozenScfEvidenceModified: false,
      evidence: [
        ...receipts.map(publicSettlement),
        ...bridges.filter((bridge) => bridge.status === "settled").map(publicBridgeEvidence),
      ],
    };
  }

  async verifyAndRecordSettlement(receipt) {
    const safe = sanitizeSettlement(receipt, this.env);
    const transaction = await verifyBaseTransaction(safe.transactionHash, { env: this.env, fetchImpl: this.fetch });
    const transfer = findExactUsdcTransfer(transaction.logs || [], safe);
    if (!transfer) throw httpError(409, "No exact 0.01 USDC transfer matches this settlement");
    return this.recordSettlement({ ...safe, payer: transfer.from, recipient: transfer.to });
  }

  async recordSettlement(receipt) {
    const safe = sanitizeSettlement(receipt, this.env);
    await this.repository.create({
      version: 1,
      kind: "settlement",
      id: safe.id,
      status: "settled",
      receipt: safe,
      createdAt: safe.settledAt,
      updatedAt: safe.settledAt,
    });
    return safe;
  }

  async requireBridge(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) throw httpError(400, "Invalid bridge id");
    const bridge = await this.repository.get("bridge", id);
    if (!bridge) throw httpError(404, "Bridge not found");
    return bridge;
  }
}

export function publicGates(env = process.env) {
  return {
    multichain: flag(env.MULTICHAIN_ENABLED),
    baseX402: flag(env.BASE_X402_ENABLED),
    cctp: flag(env.CCTP_ENABLED),
    cctpSubmit: flag(env.CCTP_SUBMIT_ENABLED),
    avalancheSubmit: false,
  };
}

function publicBridge(record) {
  const value = {
    id: record.id,
    status: record.status,
    sourceNetwork: record.sourceNetwork,
    destinationNetwork: record.destinationNetwork,
    sourceAddress: record.sourceAddress,
    destinationAddress: record.destinationAddress,
    amount: record.amount,
    amountBaseUnits: record.amountBaseUnits,
    destinationBaseUnits: record.destinationBaseUnits,
    asset: record.asset,
    protocol: "cctp-v2-standard",
    forwardingService: record.forwardingService,
    requiresHumanConfirmation: true,
    burnTransactionHash: record.burnTransactionHash,
    burnExplorerUrl: record.burnTransactionHash
      ? explorerTransactionUrl(NetworkId.baseSepolia, record.burnTransactionHash)
      : null,
    destinationTransactionHash: record.destinationTransactionHash,
    destinationVerified: Boolean(record.destinationVerified),
    destinationExplorerUrl: record.destinationTransactionHash
      ? explorerTransactionUrl(NetworkId.stellarTestnet, record.destinationTransactionHash)
      : null,
    attestationStatus: record.attestationStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    settledAt: record.settledAt,
  };
  assertSafe(value, "publicBridge");
  return value;
}

function publicBridgeEvidence(record) {
  return {
    evidenceType: "cctp-base-to-stellar",
    verificationStatus: "verified",
    ...publicBridge(record),
  };
}

function sanitizeSettlement(receipt, env) {
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

function publicSettlement(record) {
  return {
    evidenceType: "base-x402",
    verificationStatus: "verified",
    ...record.receipt,
  };
}

async function verifyBaseTransaction(hash, { env, fetchImpl }) {
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

async function readCircleMessage(hash, { fetchImpl }) {
  const response = await fetchImpl(`https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash=${encodeURIComponent(hash)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return Array.isArray(payload.messages) ? payload.messages[0] || null : null;
}

function applyCircleStatus(record, message, now, destinationVerified = false) {
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

async function readBaseTransaction(hash, { env, fetchImpl }) {
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

function circleDestinationHash(message) {
  const value = message.destinationTxHash || message.destinationTransactionHash || null;
  if (!value || !/^[a-f0-9]{64}$/i.test(String(value).replace(/^0x/, ""))) return null;
  return String(value).replace(/^0x/, "").toLowerCase();
}

async function verifyStellarDestinationTransaction(hash, { env, fetchImpl }) {
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

function findExactUsdcTransfer(logs, receipt) {
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

function validateEvmHash(value) {
  const hash = String(value || "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) throw httpError(400, "Invalid EVM transaction hash");
  return hash;
}

function publicStellarAddress(value) {
  return /^[GCM][A-Z2-7]{55}$/.test(String(value || "")) ? String(value) : null;
}

function assertSafe(value, label) {
  const scan = assertNoSensitiveData(value, label);
  if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
}

function flag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

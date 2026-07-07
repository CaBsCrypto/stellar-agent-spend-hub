import { getAddress, isAddress } from "viem";
import { CctpBridgeAdapter } from "./cctpBridgeAdapter.mjs";
import { NetworkId, publicChains } from "./chainRegistry.mjs";
import { publicBridge, publicBridgeEvidence, publicGates, publicSettlement, publicStellarAddress } from "./multichainPublicViews.mjs";
import {
  applyCircleStatus,
  circleDestinationHash,
  findExactUsdcTransfer,
  httpError,
  readBaseTransaction,
  readCircleMessage,
  sanitizeSettlement,
  validateEvmHash,
  validatePreparedCctpBurn,
  verifyBaseTransaction,
  verifyStellarDestinationTransaction,
} from "./multichainVerification.mjs";
import { MultichainRepository, multichainRepositoryReadiness } from "./multichainRepository.mjs";
import { RailRegistry } from "./railRegistry.mjs";

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

export { publicGates, validatePreparedCctpBurn };

import { NetworkId, explorerTransactionUrl } from "./chainRegistry.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export function publicGates(env = process.env) {
  return {
    multichain: flag(env.MULTICHAIN_ENABLED),
    baseX402: flag(env.BASE_X402_ENABLED),
    cctp: flag(env.CCTP_ENABLED),
    cctpSubmit: flag(env.CCTP_SUBMIT_ENABLED),
    avalancheSubmit: false,
  };
}

export function publicBridge(record) {
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

export function publicBridgeEvidence(record) {
  return {
    evidenceType: "cctp-base-to-stellar",
    verificationStatus: "verified",
    ...publicBridge(record),
  };
}

export function publicSettlement(record) {
  return {
    evidenceType: "base-x402",
    verificationStatus: "verified",
    ...record.receipt,
  };
}

export function publicStellarAddress(value) {
  return /^[GCM][A-Z2-7]{55}$/.test(String(value || "")) ? String(value) : null;
}

export function assertSafe(value, label) {
  const scan = assertNoSensitiveData(value, label);
  if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
}

function flag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

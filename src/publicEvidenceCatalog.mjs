const EXPLORER = "https://stellar.expert/explorer/testnet";

export const PUBLIC_EVIDENCE_VERSION = "scf-evidence-v2";

export const VERIFIED_FOUNDATIONS = Object.freeze([
  verifiedEvidence({
    id: "direct-stellar-testnet",
    evidenceType: "direct-payment",
    label: "First direct Stellar testnet payment",
    asset: "XLM",
    amount: "0.0000010",
    transactionHash: "4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb",
    verifiedAt: "2026-06-26T02:17:02Z",
    policy: { authorization: "human-confirmed", submitGate: "closed-after-settlement" },
  }),
  verifiedEvidence({
    id: "policy-sac-transfer",
    evidenceType: "policy-transfer",
    label: "First policy-controlled SAC transfer",
    asset: "XLM",
    amount: "tiny",
    transactionHash: "8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f",
    verifiedAt: "2026-06-26T07:44:24Z",
    policy: {
      authorization: "session-signer",
      controls: ["destination", "asset", "per-payment-limit", "expiry", "nonce"],
    },
  }),
  verifiedEvidence({
    id: "guarded-runtime-settlement",
    evidenceType: "guarded-runtime",
    label: "First guarded Soroban runtime settlement",
    asset: "XLM",
    amount: "tiny",
    transactionHash: "cb9bf9fcef3a79d045285b9c82a2633d8e78f36e9625fd6fb46ab799aae7152e",
    verifiedAt: "2026-06-26T23:06:16Z",
    policy: {
      authorization: "admin-supervised",
      controls: ["bearer-auth", "testnet-lock", "tiny-limit", "idempotency"],
    },
  }),
]);

export function pendingMppEvidence(env = {}) {
  return pendingEvidence({
    id: "mpp:pending",
    evidenceType: "mpp-charge",
    label: "Official MPP Stellar Charge",
    asset: "USDC",
    amount: "0.01",
    recipient: env.MPP_STELLAR_RECIPIENT || null,
    policy: {
      authorization: "local-human-confirmation",
      maxPrice: "0.01 USDC",
      replayProtection: "Upstash atomic consumption",
    },
  });
}

export function pendingContractAccountEvidence(env = {}) {
  return pendingEvidence({
    id: "ca:pending",
    evidenceType: "contract-account",
    label: "Passkey-managed contract account",
    asset: "USDC",
    amount: "0.01",
    recipient: env.CONTRACT_ACCOUNT_MERCHANT || null,
    contractId: env.CONTRACT_ACCOUNT_ID || null,
    policy: {
      owner: "passkey",
      sessionSigner: "ed25519",
      perPaymentLimit: "0.01 USDC",
      totalBudget: "0.02 USDC",
      expiry: "24 hours",
    },
  });
}

export function verifiedRuntimeEvidence(item) {
  return verifiedEvidence(item);
}

export function assertEvidenceInvariant(item) {
  const status = item.verificationStatus;
  if (!["pending", "verified"].includes(status)) {
    throw new Error(`Unsupported evidence status: ${status}`);
  }
  if (item.status !== status || item.kind !== item.evidenceType) {
    throw new Error("Evidence compatibility fields do not match the public schema");
  }
  if (status === "pending" && (item.transactionHash || item.explorerUrl || item.verifiedAt)) {
    throw new Error("Pending evidence cannot include settlement proof");
  }
  if (status === "verified" && (!item.transactionHash || !item.explorerUrl || !item.verifiedAt)) {
    throw new Error("Verified evidence requires hash, explorer URL and verification time");
  }
  return item;
}

function verifiedEvidence(item) {
  return finalizeEvidence({
    ...item,
    verificationStatus: "verified",
    explorerUrl: `${EXPLORER}/tx/${item.transactionHash}`,
  });
}

function pendingEvidence(item) {
  return finalizeEvidence({
    ...item,
    verificationStatus: "pending",
    transactionHash: null,
    explorerUrl: null,
    verifiedAt: null,
  });
}

function finalizeEvidence(item) {
  return assertEvidenceInvariant({
    network: "stellar:testnet",
    ...item,
    status: item.verificationStatus,
    kind: item.evidenceType,
  });
}

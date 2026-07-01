const EXPLORER = "https://stellar.expert/explorer/testnet";

export const PUBLIC_EVIDENCE_VERSION = "scf-evidence-v2";

export const CONTRACT_ACCOUNT_ACCEPTANCE = Object.freeze({
  network: "stellar:testnet",
  contractId: "CASKG5OOMM2WH6RDCO7FX4XFP6T62SX22WXVTFPIIP2XKGXBHZ4L7HPO",
  asset: "USDC",
  assetContractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  amount: "0.01",
  amountBaseUnits: "100000",
  deploy: lifecycleStep("c3d90c92ca4baeb926c899a229b64ef75c49e0f464217c46c770093df19b71f3", 3365645, "2026-06-30T18:07:36.000Z"),
  funding: lifecycleStep("c02c6c935881d4acdc178af3d66477b65c9b8f626a69db3c1afa1dc4719d41f4", 3365681, "2026-06-30T18:10:36.000Z"),
  grant: lifecycleStep("46de0acb3fa8b62eb99bef2950f5564d0fb505eb3cfe036210482f8e23e78e9b", 3365911, "2026-06-30T18:29:48.000Z"),
  payment: lifecycleStep("b37ab9217c108b023abcb3905d4fee98d32999b23d800c9471f82aeb646af094", 3367749, "2026-06-30T21:03:12.000Z"),
  revoke: lifecycleStep("27010be282572c1fb8c5cd4762aac28588e61aed2d8f3317647f83bafbafc3cc", 3370263, "2026-07-01T00:33:00.000Z"),
  replay: Object.freeze({ firstSubmitStatus: 200, replaySubmitStatus: 409, rejected: true }),
});

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

export function contractAccountLifecycle({ receipts = [], submitEnabled = false } = {}) {
  const revoke = receipts.find((receipt) => receipt.action === "revoke");
  return {
    ...CONTRACT_ACCOUNT_ACCEPTANCE,
    status: revoke ? "frozen" : "revoke-pending",
    gatesClosed: !submitEnabled,
    revoke: revoke
      ? lifecycleStep(revoke.transactionHash, revoke.transactionHash === CONTRACT_ACCOUNT_ACCEPTANCE.revoke.transactionHash ? CONTRACT_ACCOUNT_ACCEPTANCE.revoke.ledger : null, revoke.settledAt)
      : {
          status: "pending",
          transactionHash: null,
          explorerUrl: null,
          verifiedAt: null,
          ledger: null,
        },
  };
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

function lifecycleStep(transactionHash, ledger, verifiedAt) {
  return Object.freeze({
    status: "verified",
    transactionHash,
    explorerUrl: `${EXPLORER}/tx/${transactionHash}`,
    verifiedAt,
    ledger,
  });
}
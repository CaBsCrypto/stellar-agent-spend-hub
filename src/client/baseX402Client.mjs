import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";

const EXPECTED = Object.freeze({
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "10000",
});

export async function inspectX402Challenge(url, { fetchImpl = fetch, expectedRecipient }) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (response.status !== 402) throw new Error(`Expected x402 challenge, received HTTP ${response.status}.`);
  const encoded = response.headers.get("payment-required");
  if (!encoded) throw new Error("x402 challenge header is missing.");
  const challenge = decodePaymentRequiredHeader(encoded);
  const accepted = challenge.accepts?.find((item) => item.network === EXPECTED.network);
  validateRequirement(accepted, expectedRecipient);
  return {
    challenge,
    requirement: accepted,
    summary: {
      protocol: "x402",
      network: accepted.network,
      asset: "USDC",
      assetId: accepted.asset,
      amount: "0.01",
      amountBaseUnits: accepted.amount,
      recipient: accepted.payTo,
    },
  };
}

export async function payX402Resource(url, { signer, expectedRecipient, fetchImpl = fetch }) {
  if (!signer?.address || typeof signer.signTypedData !== "function") throw new Error("Privy signer is required.");
  const inspected = await inspectX402Challenge(url, { fetchImpl, expectedRecipient });
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  const paidFetch = wrapFetchWithPayment(fetchImpl, client);
  const response = await paidFetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `x402 payment failed with HTTP ${response.status}.`);
  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
    (name) => response.headers.get(name),
  );
  if (
    !paymentResponse?.success
    || paymentResponse.network !== EXPECTED.network
    || !paymentResponse.transaction
  ) {
    throw new Error("x402 settlement response is invalid.");
  }
  return { ...payload, paymentResponse, quoted: inspected.summary };
}

function validateRequirement(requirement, expectedRecipient) {
  if (!requirement) throw new Error("Base Sepolia payment option is missing.");
  if (requirement.network !== EXPECTED.network) throw new Error("Unexpected x402 network.");
  if (String(requirement.asset).toLowerCase() !== EXPECTED.asset.toLowerCase()) {
    throw new Error("Unexpected x402 asset.");
  }
  if (requirement.amount !== EXPECTED.amount) throw new Error("Unexpected x402 amount.");
  if (expectedRecipient && requirement.payTo.toLowerCase() !== expectedRecipient.toLowerCase()) {
    throw new Error("Unexpected x402 recipient.");
  }
}

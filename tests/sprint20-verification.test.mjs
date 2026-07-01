import test from "node:test";
import assert from "node:assert/strict";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { Address } from "@stellar/stellar-sdk";
import { verifyPilotSettlement } from "../src/pilotService.mjs";
import { runPilotBuyer } from "../scripts/pilot-buyer.mjs";

const recipient = "GAJK6AKXWGMRNRNZRLPZ5J7MUT4X7TZWHPEFEJJ5TL7V7XWPYKGG2CNV";
const hash = "ab".repeat(32);
const request = {
  providerId: "stellar-agent-merchant-lab",
  resourceId: "stellar-risk-snapshot",
  network: "stellar:testnet",
  asset: "USDC",
  assetContractId: USDC_SAC_TESTNET,
  amount: "0.01",
  recipient,
};
const completion = {
  transactionHash: hash,
  paymentStatus: "success",
  network: request.network,
  asset: request.asset,
  assetContractId: request.assetContractId,
  amount: request.amount,
  recipient,
  settledAt: "2026-07-01T12:05:00Z",
};

test("settlement verifier pins receipt fields and requires successful testnet transaction", async () => {
  const operation = {
    transaction_successful: true,
    transaction_hash: hash,
    type: "invoke_host_function",
    parameters: [
      { type: "Address", value: Address.fromString(USDC_SAC_TESTNET).toScVal().toXDR("base64") },
    ],
    asset_balance_changes: [{
      type: "transfer",
      asset_code: "USDC",
      to: recipient,
      amount: "0.0100000",
    }],
  };
  const fetchImpl = async (url) => String(url).includes("horizon-testnet")
    ? Response.json({ _embedded: { records: [operation] } })
    : Response.json({ result: { status: "SUCCESS" } });
  const result = await verifyPilotSettlement(
    { request, completion },
    { env: {}, fetchImpl },
  );
  assert.equal(result.transactionHash, hash);
  assert.equal(result.receipt.amount, "0.01");
  assert.equal(result.receipt.recipient, recipient);

  await assert.rejects(
    verifyPilotSettlement(
      { request, completion: { ...completion, recipient: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" } },
      { env: {}, fetchImpl },
    ),
    (error) => error.status === 409,
  );
  await assert.rejects(
    verifyPilotSettlement(
      { request, completion },
      { env: {}, fetchImpl: async () => Response.json({ result: { status: "FAILED" } }) },
    ),
    (error) => error.status === 409,
  );
  await assert.rejects(
    verifyPilotSettlement(
      { request, completion },
      { env: {}, fetchImpl: async (url) => String(url).includes("horizon-testnet")
        ? Response.json({ _embedded: { records: [{ ...operation, asset_balance_changes: [] }] } })
        : Response.json({ result: { status: "SUCCESS" } }) },
    ),
    (error) => error.status === 409,
  );
});

test("pilot buyer rejects a claimed request whose network changed before signing", async () => {
  const fetchImpl = async () => Response.json({
    claimId: "claim-id",
    request: {
      requestId: "123e4567-e89b-12d3-a456-426614174000",
      status: "settling",
      providerId: "stellar-agent-merchant-lab",
      resourceId: "stellar-risk-snapshot",
      resourceUrl: "https://stellar-agent-merchant-lab.vercel.app/api/resource/stellar-risk-snapshot",
      amount: "0.01",
      asset: "USDC",
      network: "stellar:pubnet",
      recipient,
    },
  });
  await assert.rejects(
    runPilotBuyer({
      argv: ["--request", "123e4567-e89b-12d3-a456-426614174000"],
      env: {
        MCP_PILOT_API_KEY: "pilot_api_key_abcdefghijklmnopqrstuvwxyz",
        MCP_PILOT_BASE_URL: "https://agente-pagos-stellar.vercel.app",
      },
      fetchImpl,
    }),
    /policy mismatch/,
  );
});

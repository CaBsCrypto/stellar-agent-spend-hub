import { Mppx, stellar } from "@stellar/mpp/charge/server";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { createMppAtomicStore } from "../../src/mppStore.mjs";
import {
  STELLAR_RISK_PROVIDER,
  createOfficialMppAuthorizer,
  createPaidProviderHandler,
} from "../../src/providerKit.mjs";

const runtime = Mppx.create({
  secretKey: required("MPP_SECRET_KEY"),
  methods: [
    stellar.charge({
      recipient: required("MPP_STELLAR_RECIPIENT"),
      currency: USDC_SAC_TESTNET,
      network: "stellar:testnet",
      rpcUrl: process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
      store: createMppAtomicStore({ env: process.env }),
      allowUnsignedPush: false,
    }),
  ],
});

const paidResource = createPaidProviderHandler({
  definition: STELLAR_RISK_PROVIDER,
  authorize: createOfficialMppAuthorizer({
    runtime,
    amount: "0.01",
    scope: (request) => `provider-demo:${new URL(request.url).searchParams.get("resource") || "default"}`,
  }),
  loadResource: async (request) => ({
    resourceId: new URL(request.url).searchParams.get("resource") || "default",
    result: "Replace this loader with your API or MCP tool result.",
  }),
});

// Adapt this Web Request/Response handler to a Vercel Function, Express route,
// MCP transport, or any server that can bridge the standard Fetch API.
export default paidResource;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

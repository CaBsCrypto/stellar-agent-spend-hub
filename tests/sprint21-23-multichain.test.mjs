import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { getAddress } from "viem";
import {
  BASE_SEPOLIA_USDC,
  CCTP_V2_TOKEN_MESSENGER,
  NetworkId,
  publicChains,
} from "../src/chainRegistry.mjs";
import { CctpBridgeAdapter, buildCctpForwarderHookData } from "../src/cctpBridgeAdapter.mjs";
import { BaseX402Service } from "../src/baseX402Service.mjs";
import { formatTokenAmount, parseTokenAmount, scaleBaseUnits } from "../src/multichainMoney.mjs";
import { MultichainRepository } from "../src/multichainRepository.mjs";
import { normalizeProviderDefinition } from "../src/providerDefinitionV2.mjs";
import { RailRegistry } from "../src/railRegistry.mjs";
import { PrivyAdapter } from "../src/client/privyAdapter.mjs";
import { validatePreparedCctpBurn } from "../src/multichainService.mjs";

const MERCHANT = "0x1111111111111111111111111111111111111111";
const TX_HASH = `0x${"a".repeat(64)}`;
const FORWARDER = StrKey.encodeContract(Buffer.alloc(32, 7));
const STELLAR_DESTINATION = Keypair.random().publicKey();

test("token amounts remain exact strings across Stellar and EVM precision", () => {
  assert.deepEqual(parseTokenAmount("0.01", 6), {
    amount: "0.01",
    amountBaseUnits: "10000",
    decimals: 6,
  });
  assert.equal(scaleBaseUnits("1000000", 6, 7), "10000000");
  assert.equal(formatTokenAmount("10000000", 7), "1");
  assert.throws(() => parseTokenAmount("0.0000001", 6), /exceeds 6 decimal places/);
});

test("chain registry exposes Base and Avalanche but keeps Avalanche submit disabled", () => {
  const chains = publicChains({
    MULTICHAIN_ENABLED: "true",
    BASE_X402_ENABLED: "true",
    AVALANCHE_SUBMIT_ENABLED: "true",
  });
  assert.equal(chains.find((chain) => chain.network === NetworkId.baseSepolia).chainId, 84532);
  assert.equal(chains.find((chain) => chain.network === NetworkId.avalancheFuji).chainId, 43113);
  assert.equal(chains.find((chain) => chain.network === NetworkId.avalancheFuji).submitEnabled, false);
});

test("legacy Stellar provider normalizes to ProviderDefinition v2", () => {
  const provider = normalizeProviderDefinition({
    providerId: "stellar-risk",
    name: "Stellar Risk API",
    endpoint: "/api/mpp/stellar-risk",
    maxPrice: "0.01",
    paymentMethod: "stellar-mpp",
  });
  assert.equal(provider.version, "spendhub-provider-v2");
  assert.equal(provider.paymentOptions[0].network, NetworkId.stellarTestnet);
  assert.equal(provider.paymentOptions[0].amountBaseUnits, "100000");
});

test("routing favors Stellar on a tie and Base when it is the only executable rail", () => {
  const registry = new RailRegistry({
    env: { MULTICHAIN_ENABLED: "true", BASE_X402_ENABLED: "true" },
    now: () => new Date("2026-07-02T12:00:00.000Z"),
  });
  const provider = multichainProvider();
  const tie = registry.quote({
    provider,
    balances: {
      [NetworkId.stellarTestnet]: { USDC: "100000" },
      [NetworkId.baseSepolia]: { USDC: "10000" },
    },
  });
  assert.equal(tie.recommendation.network, NetworkId.stellarTestnet);

  const baseOnly = registry.quote({
    provider,
    balances: {
      [NetworkId.stellarTestnet]: { USDC: "0" },
      [NetworkId.baseSepolia]: { USDC: "10000" },
    },
  });
  assert.equal(baseOnly.recommendation.network, NetworkId.baseSepolia);
});

test("insufficient balance suggests a separate bridge and never executes one", () => {
  const quote = new RailRegistry({
    env: { MULTICHAIN_ENABLED: "true", BASE_X402_ENABLED: "true" },
  }).quote({ provider: multichainProvider(), balances: {} });
  assert.equal(quote.recommendation, null);
  assert.equal(quote.bridgeSuggested, true);
  assert.ok(quote.candidates.every((candidate) => candidate.executable === false));
});

test("Base quote is guarded while its submit gate is closed", () => {
  const quote = new RailRegistry({
    env: { MULTICHAIN_ENABLED: "true", BASE_X402_ENABLED: "false" },
  }).quote({
    provider: {
      ...multichainProvider(),
      paymentOptions: multichainProvider().paymentOptions.filter((option) => option.network === NetworkId.baseSepolia),
    },
    balances: { [NetworkId.baseSepolia]: { USDC: "10000" } },
  });
  assert.equal(quote.recommendation, null);
  assert.match(quote.candidates[0].reasons.join(" "), /gate is closed/);
});

test("CCTP prepares exact Base burn with official forwarder binding", () => {
  const adapter = new CctpBridgeAdapter({
    env: {
      CCTP_ENABLED: "true",
      CCTP_STELLAR_FORWARDER_CONTRACT_ID: FORWARDER,
      CCTP_STELLAR_DESTINATION: STELLAR_DESTINATION,
    },
  });
  const intent = adapter.createIntent({ sourceAddress: MERCHANT, amount: "1" });
  const prepared = adapter.prepare(intent);
  assert.equal(intent.amountBaseUnits, "1000000");
  assert.equal(intent.destinationBaseUnits, "10000000");
  assert.equal(prepared.transactions[0].to, getAddress(BASE_SEPOLIA_USDC));
  assert.equal(prepared.transactions[1].to, getAddress(CCTP_V2_TOKEN_MESSENGER));
  assert.match(buildCctpForwarderHookData(STELLAR_DESTINATION), /^0x[0-9a-f]+$/);
  const burn = prepared.transactions.find((transaction) => transaction.step === "burn");
  assert.equal(validatePreparedCctpBurn({
    from: intent.sourceAddress,
    to: burn.to,
    input: burn.data,
  }, intent), true);
  assert.throws(
    () => validatePreparedCctpBurn({
      from: intent.sourceAddress,
      to: burn.to,
      input: prepared.transactions[0].data,
    }, intent),
    /calldata is invalid/,
  );
  assert.throws(
    () => adapter.createIntent({ sourceAddress: MERCHANT, amount: "0.99" }),
    /exactly 1 USDC/,
  );
});

test("Upstash create accepts its OK response and rejects a missing NX result", async () => {
  const calls = [];
  const redis = {
    set: async (...args) => (calls.push(args), "OK"),
    lpush: async () => 1,
    ltrim: async () => "OK",
    expire: async () => 1,
  };
  const repository = new MultichainRepository({ redis });
  const record = { kind: "quote", id: "quote-1" };
  assert.deepEqual(await repository.create(record), record);
  assert.equal(calls[0][2].nx, true);
  const blocked = new MultichainRepository({ redis: { ...redis, set: async () => null } });
  await assert.rejects(blocked.create({ kind: "quote", id: "quote-2" }), (error) => error.status === 409);
});

test("Privy remains disabled without public app configuration and stores no identity", async () => {
  const adapter = new PrivyAdapter({
    configLoader: async () => ({ enabled: false, appId: null, clientId: null }),
  });
  const state = await adapter.initialize();
  assert.equal(state.status, "not-configured");
  assert.equal(state.authenticated, false);
  assert.equal("email" in state, false);
  assert.equal("accessToken" in state, false);
});

test("Base x402 issues a 402 challenge only after the resource validates", async () => {
  let riskLoads = 0;
  const service = baseService({
    riskLoader: async () => (riskLoads += 1, { transactionHash: TX_HASH }),
    runtime: {
      processHTTPRequest: async () => ({
        type: "payment-error",
        response: {
          status: 402,
          headers: { "payment-required": "challenge" },
          body: { error: "Payment Required" },
        },
      }),
    },
  });
  const response = await service.handle(request(), url());
  assert.equal(response.status, 402);
  assert.equal(response.headers.get("payment-required"), "challenge");
  assert.equal(riskLoads, 1);
});

test("Base x402 settles exactly 0.01 USDC and rejects altered requirements", async () => {
  const receipts = [];
  const verified = {
    type: "payment-verified",
    paymentPayload: {},
    declaredExtensions: {},
    paymentRequirements: {
      network: NetworkId.baseSepolia,
      asset: BASE_SEPOLIA_USDC,
      amount: "10000",
      payTo: MERCHANT,
    },
  };
  const runtime = {
    processHTTPRequest: async () => verified,
    processSettlement: async () => ({
      success: true,
      network: NetworkId.baseSepolia,
      transaction: TX_HASH,
      payer: "0x2222222222222222222222222222222222222222",
      headers: { "payment-response": "settled" },
    }),
  };
  const service = baseService({
    runtime,
    riskLoader: async () => ({ transactionHash: TX_HASH }),
    onSettlement: async (receipt) => (receipts.push(receipt), receipt),
  });
  const response = await service.handle(request(), url());
  assert.equal(response.status, 200);
  assert.equal(receipts[0].amountBaseUnits, "10000");
  assert.equal(receipts[0].recipient, getAddress(MERCHANT));

  runtime.processHTTPRequest = async () => ({
    ...verified,
    paymentRequirements: { ...verified.paymentRequirements, amount: "9999" },
  });
  await assert.rejects(service.handle(request(), url()), (error) => error.status === 409);
});

test("browser build source uses official Privy SDK and contains no simulated wallet store", async () => {
  const source = await readFile("src/client/privyAdapter.mjs", "utf8");
  assert.match(source, /@privy-io\/js-sdk-core/);
  assert.doesNotMatch(source, /PrivyWalletStore|mock-wallet|localStorage\.setItem/);
});

function multichainProvider() {
  return {
    providerId: "multichain-risk",
    name: "Multichain Risk API",
    endpoint: "/api/x402/base-risk",
    resource: "Transaction risk report",
    paymentOptions: [
      {
        protocol: "stellar-mpp",
        network: NetworkId.stellarTestnet,
        maxPrice: "0.01",
      },
      {
        protocol: "x402",
        network: NetworkId.baseSepolia,
        maxPrice: "0.01",
        recipient: MERCHANT,
      },
    ],
  };
}

function baseService({ runtime, riskLoader, onSettlement = null }) {
  return new BaseX402Service({
    env: {
      MULTICHAIN_ENABLED: "true",
      BASE_X402_ENABLED: "true",
      BASE_X402_MERCHANT_ADDRESS: MERCHANT,
    },
    runtimeFactory: () => runtime,
    riskLoader,
    onSettlement,
  });
}

function request() {
  return new Request(url(), { headers: { Accept: "application/json" } });
}

function url() {
  return new URL(`https://example.test/api/x402/base-risk?tx=${TX_HASH}`);
}

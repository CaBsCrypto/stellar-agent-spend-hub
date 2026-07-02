import { randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import {
  BASE_SEPOLIA_USDC,
  CCTP_V2_TOKEN_MESSENGER,
  NetworkId,
} from "./chainRegistry.mjs";
import { parseTokenAmount, scaleBaseUnits } from "./multichainMoney.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

const STELLAR_CCTP_DOMAIN = 27;
const STANDARD_FINALITY = 2000;
const BRIDGE_AMOUNT = "1";
const APPROVE_ABI = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}];
export const CCTP_BURN_ABI = [{
  type: "function",
  name: "depositForBurnWithHook",
  stateMutability: "nonpayable",
  inputs: [
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "mintRecipient", type: "bytes32" },
    { name: "burnToken", type: "address" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "maxFee", type: "uint256" },
    { name: "minFinalityThreshold", type: "uint32" },
    { name: "hookData", type: "bytes" },
  ],
  outputs: [{ name: "nonce", type: "bytes32" }],
}];

export class CctpBridgeAdapter {
  constructor({ env = process.env } = {}) {
    this.env = env;
  }

  readiness() {
    const missing = [
      "CCTP_STELLAR_FORWARDER_CONTRACT_ID",
      "CCTP_STELLAR_DESTINATION",
    ].filter((key) => !this.env[key]);
    return {
      status: !flag(this.env.CCTP_ENABLED) ? "disabled" : missing.length ? "not-configured" : "ready-preview",
      enabled: flag(this.env.CCTP_ENABLED),
      submitEnabled: flag(this.env.CCTP_SUBMIT_ENABLED),
      sourceNetwork: NetworkId.baseSepolia,
      destinationNetwork: NetworkId.stellarTestnet,
      amount: BRIDGE_AMOUNT,
      missing,
      forwardingService: "circle",
    };
  }

  createIntent({ sourceAddress, amount = BRIDGE_AMOUNT } = {}) {
    if (!isAddress(sourceAddress || "")) throw httpError(400, "A valid Privy EVM source address is required");
    const money = parseTokenAmount(amount, 6);
    if (money.amount !== BRIDGE_AMOUNT) throw httpError(409, "Supervised CCTP demo amount must be exactly 1 USDC");
    const forwarder = String(this.env.CCTP_STELLAR_FORWARDER_CONTRACT_ID || "");
    const destination = String(this.env.CCTP_STELLAR_DESTINATION || "");
    validateForwardingDestination(forwarder, destination);
    const now = new Date().toISOString();
    const value = {
      version: 1,
      kind: "bridge",
      id: randomUUID(),
      status: "created",
      sourceNetwork: NetworkId.baseSepolia,
      destinationNetwork: NetworkId.stellarTestnet,
      sourceAddress: getAddress(sourceAddress),
      destinationAddress: destination,
      amount: money.amount,
      amountBaseUnits: money.amountBaseUnits,
      destinationBaseUnits: scaleBaseUnits(money.amountBaseUnits, 6, 7),
      sourceDecimals: 6,
      destinationDecimals: 7,
      asset: "USDC",
      burnToken: BASE_SEPOLIA_USDC,
      tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
      cctpForwarder: forwarder,
      destinationDomain: STELLAR_CCTP_DOMAIN,
      finalityThreshold: STANDARD_FINALITY,
      forwardingService: "circle",
      requiresHumanConfirmation: true,
      burnTransactionHash: null,
      destinationTransactionHash: null,
      attestationStatus: null,
      createdAt: now,
      updatedAt: now,
      settledAt: null,
    };
    assertSafe(value);
    return value;
  }

  prepare(intent) {
    if (intent.status !== "created" && intent.status !== "prepared") {
      throw httpError(409, `Bridge cannot be prepared from ${intent.status}`);
    }
    validateForwardingDestination(intent.cctpForwarder, intent.destinationAddress);
    const forwarderBytes32 = contractStrkeyToBytes32(intent.cctpForwarder);
    const hookData = buildCctpForwarderHookData(intent.destinationAddress);
    const amount = BigInt(intent.amountBaseUnits);
    return {
      intent: { ...intent, status: "prepared" },
      quote: {
        protocol: "cctp-v2-standard",
        sourceNetwork: intent.sourceNetwork,
        destinationNetwork: intent.destinationNetwork,
        amount: intent.amount,
        amountBaseUnits: intent.amountBaseUnits,
        destinationBaseUnits: intent.destinationBaseUnits,
        feeBaseUnits: "0",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
      transactions: [
        {
          step: "approve",
          chainId: 84532,
          to: getAddress(BASE_SEPOLIA_USDC),
          data: encodeFunctionData({
            abi: APPROVE_ABI,
            functionName: "approve",
            args: [getAddress(CCTP_V2_TOKEN_MESSENGER), amount],
          }),
          value: "0x0",
        },
        {
          step: "burn",
          chainId: 84532,
          to: getAddress(CCTP_V2_TOKEN_MESSENGER),
          data: encodeFunctionData({
            abi: CCTP_BURN_ABI,
            functionName: "depositForBurnWithHook",
            args: [
              amount,
              STELLAR_CCTP_DOMAIN,
              forwarderBytes32,
              getAddress(BASE_SEPOLIA_USDC),
              forwarderBytes32,
              0n,
              STANDARD_FINALITY,
              hookData,
            ],
          }),
          value: "0x0",
        },
      ],
      requiresHumanConfirmation: true,
      warning: "The burn is irreversible; verify source, forwarder and Stellar destination before signing.",
    };
  }
}

export function contractStrkeyToBytes32(strkey) {
  if (!StrKey.isValidContract(strkey)) throw httpError(503, "CCTP Stellar forwarder contract is invalid");
  return `0x${Buffer.from(StrKey.decodeContract(strkey)).toString("hex")}`;
}

export function buildCctpForwarderHookData(forwardRecipientStrkey) {
  const valid = StrKey.isValidEd25519PublicKey(forwardRecipientStrkey)
    || StrKey.isValidContract(forwardRecipientStrkey)
    || StrKey.isValidMed25519PublicKey(forwardRecipientStrkey);
  if (!valid) throw httpError(503, "CCTP Stellar destination is invalid");
  const recipient = Buffer.from(forwardRecipientStrkey, "utf8");
  const hook = Buffer.alloc(32 + recipient.length);
  hook.writeUInt32BE(0, 24);
  hook.writeUInt32BE(recipient.length, 28);
  recipient.copy(hook, 32);
  return `0x${hook.toString("hex")}`;
}

function validateForwardingDestination(forwarder, destination) {
  if (!StrKey.isValidContract(forwarder)) throw httpError(503, "CCTP Stellar forwarder contract is invalid");
  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw httpError(503, "CCTP destination must be the dedicated Stellar user account");
  }
  if (forwarder === destination) throw httpError(409, "CCTP forwarder and final destination must differ");
}

function assertSafe(value) {
  const scan = assertNoSensitiveData(value, "cctpBridgeIntent");
  if (!scan.allowed) throw httpError(400, scan.reasons.join("; "));
}

function flag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

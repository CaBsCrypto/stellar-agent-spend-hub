import { timingSafeEqual } from "node:crypto";
import { contract as contractSdk, Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export const SPEND_ACCOUNT_WASM_HASH = "6230e90601a82fd1afd8ae3dd59da55a4bc66d5e1fd4603996b1466f88c3c800";

export async function runAdminContractAccountDeploy({
  request,
  body = {},
  env = process.env,
  deployer = deployWithSdk,
} = {}) {
  authorize(request?.headers?.authorization, env);
  if (String(env.CONTRACT_ACCOUNT_DEPLOY_ENABLED || "").toLowerCase() !== "true") {
    throw httpError(503, "Contract account deploy gate is closed");
  }
  if ((env.CONTRACT_ACCOUNT_NETWORK || "stellar:testnet") !== "stellar:testnet") {
    throw httpError(409, "Only Stellar testnet deployment is allowed");
  }
  const registration = validateRegistration(body);
  const result = await deployer({ registration, env });
  const response = {
    ok: true,
    network: "stellar:testnet",
    contractId: result.contractId,
    transactionHash: result.transactionHash,
    wasmHash: SPEND_ACCOUNT_WASM_HASH,
    ownerType: "webauthn-secp256r1",
  };
  const scan = assertNoSensitiveData(response, "adminContractAccountDeploy");
  if (!scan.allowed) throw httpError(500, "Sensitive deployment output blocked");
  return response;
}

export async function deployWithSdk({ registration, env }) {
  const relayer = Keypair.fromSecret(env.CONTRACT_ACCOUNT_RELAYER_SECRET || "");
  const rpcUrl = env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
  const assembled = await contractSdk.Client.deploy(
    {
      owner_public_key: Buffer.from(registration.ownerPublicKeyHex, "hex"),
      credential_id_hash: Buffer.from(registration.credentialIdHash, "hex"),
      rp_id_hash: Buffer.from(registration.rpIdHash, "hex"),
      origin_hash: Buffer.from(registration.originHash, "hex"),
    },
    {
      wasmHash: SPEND_ACCOUNT_WASM_HASH,
      format: "hex",
      publicKey: relayer.publicKey(),
      networkPassphrase: Networks.TESTNET,
      rpcUrl,
      fee: "1000000",
      timeoutInSeconds: 300,
      signTransaction: async (xdr) => {
        const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
        transaction.sign(relayer);
        return { signedTxXdr: transaction.toXDR(), signerAddress: relayer.publicKey() };
      },
    },
  );
  const sent = await assembled.signAndSend();
  const contractId = sent.result?.options?.contractId || sent.result?.contractId;
  if (!contractId) throw httpError(502, "Contract deployment did not return a contract ID");
  return {
    contractId,
    transactionHash: sent.sendTransactionResponse?.hash || sent.hash || null,
  };
}

export function validateRegistration(body) {
  return {
    ownerPublicKeyHex: fixedHex(body.ownerPublicKeyHex, 65, "ownerPublicKeyHex"),
    credentialIdHash: fixedHex(body.credentialIdHash, 32, "credentialIdHash"),
    rpIdHash: fixedHex(body.rpIdHash, 32, "rpIdHash"),
    originHash: fixedHex(body.originHash, 32, "originHash"),
  };
}

function authorize(value, env) {
  const expected = env.CONTRACT_ACCOUNT_DEPLOY_ADMIN_TOKEN || "";
  const provided = String(value || "").replace(/^Bearer\s+/i, "");
  if (expected.length < 32 || provided.length !== expected.length) throw httpError(401, "Unauthorized");
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) throw httpError(401, "Unauthorized");
}

function fixedHex(value, bytes, name) {
  if (!new RegExp(`^[a-f0-9]{${bytes * 2}}$`, "i").test(value || "")) {
    throw httpError(400, `${name} must contain ${bytes} bytes as hex`);
  }
  return value.toLowerCase();
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

import { timingSafeEqual } from "node:crypto";
import { Address, contract as contractSdk, Keypair, Networks, rpc } from "@stellar/stellar-sdk";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

export const SPEND_ACCOUNT_WASM_HASH = "6230e90601a82fd1afd8ae3dd59da55a4bc66d5e1fd4603996b1466f88c3c800";
export const CONTRACT_ACCOUNT_DEPLOY_MAX_FEE = 3_500_000_000n;

export async function runAdminContractAccountDeploy({
  request,
  body = {},
  env = process.env,
  deployer = deployWithSdk,
  ceremonies = null,
} = {}) {
  authorize(request?.headers?.authorization, env);
  if (String(env.CONTRACT_ACCOUNT_DEPLOY_ENABLED || "").toLowerCase() !== "true") {
    throw httpError(503, "Contract account deploy gate is closed");
  }
  if ((env.CONTRACT_ACCOUNT_NETWORK || "stellar:testnet") !== "stellar:testnet") {
    throw httpError(409, "Only Stellar testnet deployment is allowed");
  }
  const ceremony = body.ceremonyId
    ? await claimCeremony(body.ceremonyId, ceremonies)
    : null;
  const registration = ceremony?.registration || validateRegistration(body);
  let result;
  try {
    result = await deployer({ registration, env });
  } catch (error) {
    if (ceremony) await ceremonies.fail(ceremony.ceremonyId);
    throw error;
  }
  let ceremonyStatus = ceremony ? "claimed" : null;
  if (ceremony) {
    try {
      await ceremonies.complete(ceremony.ceremonyId, result);
      ceremonyStatus = "deployed";
    } catch {
      ceremonyStatus = "deployed-record-pending";
    }
  }
  const response = {
    ok: true,
    network: "stellar:testnet",
    ceremonyId: ceremony?.ceremonyId || null,
    ceremonyStatus,
    contractId: result.contractId,
    transactionHash: result.transactionHash,
    wasmHash: SPEND_ACCOUNT_WASM_HASH,
    ownerType: "webauthn-secp256r1",
  };
  const scan = assertNoSensitiveData(response, "adminContractAccountDeploy");
  if (!scan.allowed) throw httpError(500, "Sensitive deployment output blocked");
  return response;
}

async function claimCeremony(ceremonyId, ceremonies) {
  if (!ceremonies) throw httpError(503, "Passkey ceremony service is unavailable");
  return ceremonies.claim(ceremonyId);
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
    },
  );
  const server = new rpc.Server(rpcUrl);
  return sendAssembledDeployment({ assembled, relayer, server });
}


export async function sendAssembledDeployment({ assembled, relayer, server }) {
  const transaction = assembled?.built;
  if (!transaction) throw httpError(502, "Contract deployment was not assembled");
  const fee = BigInt(transaction.fee);
  if (fee <= 0n || fee > CONTRACT_ACCOUNT_DEPLOY_MAX_FEE) {
    throw httpError(409, "Contract deployment fee exceeds the testnet cap");
  }
  transaction.sign(relayer);
  const sent = await server.sendTransaction(transaction);
  if (sent.status !== "PENDING") throw httpError(502, `Contract deploy returned ${sent.status}`);
  const settled = await pollDeployment(server, sent.hash);
  if (settled.status !== "SUCCESS" || !settled.returnValue) {
    throw httpError(502, "Contract deployment did not succeed");
  }
  let contractId;
  try {
    contractId = Address.fromScVal(settled.returnValue).toString();
  } catch {
    throw httpError(502, "Contract deployment returned an invalid contract ID");
  }
  return { contractId, transactionHash: sent.hash };
}

async function pollDeployment(server, transactionHash) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await server.getTransaction(transactionHash);
    if (result.status !== "NOT_FOUND") return result;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw httpError(504, "Contract deployment confirmation timed out");
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

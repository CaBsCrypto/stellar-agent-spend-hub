import {
  createECDH,
  createHash,
  createPrivateKey,
  sign as signP256,
} from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { deployWithSdk } from "../src/adminContractAccountDeploy.mjs";
import { ContractAccountRelayer } from "../src/contractAccountRelayer.mjs";
import { ContractAccountRepository } from "../src/contractAccountRepository.mjs";
import { buildContractAccountCommand } from "./contract-account-testnet.mjs";

const execFileAsync = promisify(execFile);
const NETWORK = "stellar:testnet";
const RPC_URL = "https://soroban-testnet.stellar.org";
const RP_ID = "agente-pagos-stellar.vercel.app";
const ORIGIN = `https://${RP_ID}`;
const MERCHANT = "GAJK6AKXWGMRNRNZRLPZ5J7MUT4X7TZWHPEFEJJ5TL7V7XWPYKGG2CNV";
const EXPECTED_RELAYER = "GD2HWVSSD5I64HD5LCPCXW6NKSJLQRSL5V4OGBOIDRDCXM4VZRJBBKC6";
const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

if (isCliEntrypoint()) {
  runFixtureE2E({ execute: process.argv.includes("--execute") })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: redact(error.cause?.message || error.message || String(error)) }));
      process.exitCode = 1;
    });
}

export async function runFixtureE2E({
  execute = false,
  runner = execFileAsync,
  fetchImpl = globalThis.fetch,
  env = process.env,
} = {}) {
  if (!execute) {
    return {
      ok: true,
      mode: "dry-run",
      evidenceType: "contract-account-fixture-e2e",
      network: NETWORK,
      asset: "USDC",
      fundAmount: "0.02",
      paymentAmount: "0.01",
      owner: "deterministic-test-fixture-not-user-passkey",
      steps: ["deploy", "fund", "passkey-grant", "session-pay", "passkey-revoke", "verify"],
    };
  }

  const [relayerSecret, ownerSecret, sessionSecret] = await Promise.all([
    readIdentitySecret("spendhub-relayer", runner),
    readIdentitySecret("spendhub-owner", runner),
    readIdentitySecret("spendhub-session", runner),
  ]);
  const relayer = Keypair.fromSecret(relayerSecret);
  const owner = Keypair.fromSecret(ownerSecret);
  const session = Keypair.fromSecret(sessionSecret);
  if (relayer.publicKey() !== EXPECTED_RELAYER) {
    throw new Error("Local relayer identity does not match the configured public relayer");
  }

  const authenticator = createFixtureAuthenticator();
  const merchantBalanceBefore = await readUsdcBalance(MERCHANT, fetchImpl);
  const resumeContractId = env.CONTRACT_ACCOUNT_FIXTURE_ID || "";
  if (resumeContractId && !StrKey.isValidContract(resumeContractId)) {
    throw new Error("CONTRACT_ACCOUNT_FIXTURE_ID is invalid");
  }
  let deployed;
  let fundingResult = null;
  if (resumeContractId) {
    deployed = { contractId: resumeContractId, transactionHash: null };
  } else {
    deployed = await deployWithSdk({
      registration: authenticator.registration,
      env: {
        CONTRACT_ACCOUNT_RELAYER_SECRET: relayerSecret,
        SOROBAN_RPC_URL: RPC_URL,
      },
    });
    if (!deployed.contractId) throw new Error("Fixture deployment returned no contract ID");

    const fundingCommand = buildContractAccountCommand({
      action: "fund",
      env: {
        CONTRACT_ACCOUNT_ID: deployed.contractId,
        CONTRACT_ACCOUNT_OWNER_IDENTITY: "spendhub-owner",
        CONTRACT_ACCOUNT_OWNER_PUBLIC_KEY: owner.publicKey(),
        CONTRACT_ACCOUNT_ASSET_CONTRACT_ID: USDC_SAC_TESTNET,
        CONTRACT_ACCOUNT_FUND_AMOUNT: "200000",
      },
    });
    fundingResult = await runner(fundingCommand.bin, fundingCommand.args, {
      env: process.env,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
  }

  const runtimeEnv = {
    CONTRACT_ACCOUNT_ENABLED: "true",
    CONTRACT_ACCOUNT_SUBMIT_ENABLED: "true",
    CONTRACT_ACCOUNT_NETWORK: NETWORK,
    CONTRACT_ACCOUNT_ID: deployed.contractId,
    CONTRACT_ACCOUNT_MERCHANT: MERCHANT,
    CONTRACT_ACCOUNT_SESSION_PUBLIC_KEY: session.publicKey(),
    CONTRACT_ACCOUNT_RELAYER_SECRET: relayerSecret,
    SOROBAN_RPC_URL: RPC_URL,
  };
  const repository = new ContractAccountRepository({ env: {} });
  const service = new ContractAccountRelayer({ env: runtimeEnv, repository });

  const grantPrepared = await service.prepare({ action: "grant" });
  const grant = await service.submit({
    requestId: grantPrepared.requestId,
    assertion: authenticator.sign(grantPrepared.auth.signaturePayloadHex),
  });

  const paymentPrepared = await service.prepare({ action: "transfer", amount: "100000" });
  const paymentPayload = Buffer.from(paymentPrepared.auth.signaturePayloadHex, "hex");
  const payment = await service.submit({
    requestId: paymentPrepared.requestId,
    assertion: {
      type: "session",
      publicKey: Buffer.from(StrKey.decodeEd25519PublicKey(session.publicKey())).toString("base64url"),
      signature: session.sign(paymentPayload).toString("base64url"),
    },
  });

  const revokePrepared = await service.prepare({ action: "revoke" });
  const revoke = await service.submit({
    requestId: revokePrepared.requestId,
    assertion: authenticator.sign(revokePrepared.auth.signaturePayloadHex),
  });

  const merchantBalanceAfter = await waitForUsdcBalance(
    MERCHANT,
    merchantBalanceBefore + 0.01,
    fetchImpl,
  );
  const paymentHash = payment.receipt?.transactionHash || "";
  if (!/^[a-f0-9]{64}$/i.test(paymentHash)) throw new Error("Fixture payment returned no public transaction hash");
  if (merchantBalanceAfter - merchantBalanceBefore < 0.01) {
    throw new Error("Merchant USDC balance did not increase by the fixture payment amount");
  }

  return {
    ok: true,
    mode: "settled",
    evidenceType: "contract-account-fixture-e2e",
    verificationStatus: "verified-fixture",
    network: NETWORK,
    asset: "USDC",
    amount: "0.01",
    contractId: deployed.contractId,
    deployTransactionHash: publicHash(deployed.transactionHash),
    fundingTransactionHash: fundingResult ? extractHash(fundingResult) : null,
    grantTransactionHash: publicHash(grant.receipt?.transactionHash),
    paymentTransactionHash: paymentHash,
    revokeTransactionHash: publicHash(revoke.receipt?.transactionHash),
    merchant: MERCHANT,
    merchantBalanceBefore: merchantBalanceBefore.toFixed(7),
    merchantBalanceAfter: merchantBalanceAfter.toFixed(7),
    ownerFixture: "deterministic-p256-test-key-not-user-passkey",
    frozenAfterTest: true,
    resumedFixture: Boolean(env.CONTRACT_ACCOUNT_FIXTURE_ID),
  };
}

export function createFixtureAuthenticator() {
  const seed = sha256("spendhub-contract-account-fixture-v1");
  const scalar = (BigInt(`0x${seed.toString("hex")}`) % (P256_ORDER - 1n)) + 1n;
  const privateBytes = Buffer.from(scalar.toString(16).padStart(64, "0"), "hex");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);
  const publicBytes = ecdh.getPublicKey(null, "uncompressed");
  const x = publicBytes.subarray(1, 33);
  const y = publicBytes.subarray(33, 65);
  const privateKey = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: x.toString("base64url"),
      y: y.toString("base64url"),
      d: privateBytes.toString("base64url"),
    },
    format: "jwk",
  });
  const credentialIdHash = sha256("spendhub-fixture-credential-v1");
  const registration = {
    ownerPublicKeyHex: publicBytes.toString("hex"),
    credentialIdHash: credentialIdHash.toString("hex"),
    rpIdHash: sha256(RP_ID).toString("hex"),
    originHash: sha256(ORIGIN).toString("hex"),
  };
  return {
    registration,
    sign(signaturePayloadHex) {
      if (!/^[a-f0-9]{64}$/i.test(signaturePayloadHex || "")) {
        throw new Error("Fixture passkey payload must contain 32 bytes as hex");
      }
      const payload = Buffer.from(signaturePayloadHex, "hex");
      const clientDataJson = Buffer.from(JSON.stringify({
        type: "webauthn.get",
        challenge: payload.toString("base64url"),
        origin: ORIGIN,
        crossOrigin: false,
      }));
      const authenticatorData = Buffer.concat([
        sha256(RP_ID),
        Buffer.from([0x05, 0, 0, 0, 1]),
      ]);
      const signedData = Buffer.concat([authenticatorData, sha256(clientDataJson)]);
      const signature = normalizeLowS(signP256("sha256", signedData, {
        key: privateKey,
        dsaEncoding: "ieee-p1363",
      }));
      return {
        type: "passkey",
        credentialIdHash: credentialIdHash.toString("base64url"),
        authenticatorData: authenticatorData.toString("base64url"),
        clientDataJson: clientDataJson.toString("base64url"),
        signature: signature.toString("base64url"),
      };
    },
  };
}

export function normalizeLowS(signature) {
  if (!Buffer.isBuffer(signature) || signature.length !== 64) {
    throw new Error("P-256 signature must contain 64 bytes");
  }
  const output = Buffer.from(signature);
  const s = BigInt(`0x${output.subarray(32).toString("hex")}`);
  if (s > P256_ORDER / 2n) {
    Buffer.from((P256_ORDER - s).toString(16).padStart(64, "0"), "hex").copy(output, 32);
  }
  return output;
}

async function readIdentitySecret(identity, runner) {
  const result = await runner("stellar", ["keys", "secret", identity], {
    env: process.env,
    timeout: 15_000,
  });
  const secret = String(result.stdout || "").trim();
  if (!StrKey.isValidEd25519SecretSeed(secret)) throw new Error(`Invalid local Stellar identity: ${identity}`);
  return secret;
}

async function readUsdcBalance(account, fetchImpl) {
  const response = await fetchImpl(`https://horizon-testnet.stellar.org/accounts/${account}`);
  if (!response.ok) throw new Error(`Horizon account lookup failed with ${response.status}`);
  const body = await response.json();
  const balance = body.balances?.find((item) => item.asset_code === "USDC")?.balance;
  if (!balance) throw new Error("Merchant USDC trustline is missing");
  return Number(balance);
}

async function waitForUsdcBalance(account, minimum, fetchImpl) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = await readUsdcBalance(account, fetchImpl);
    if (value >= minimum) return value;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Merchant USDC balance verification timed out");
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function extractHash(result) {
  return publicHash(`${result?.stdout || ""}\n${result?.stderr || ""}`.match(/\b[a-f0-9]{64}\b/i)?.[0]);
}

function publicHash(value) {
  return /^[a-f0-9]{64}$/i.test(value || "") ? value.toLowerCase() : null;
}

function redact(value) {
  return String(value)
    .replace(/\bS[A-Z2-7]{55}\b/g, "[REDACTED_STELLAR_SECRET]")
    .replace(/[A-Za-z0-9_-]{100,}/g, "[REDACTED_LONG_VALUE]");
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}

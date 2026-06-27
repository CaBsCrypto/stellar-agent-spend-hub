import { createHash, randomUUID } from "node:crypto";
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  hash,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { USDC_SAC_TESTNET } from "@stellar/mpp";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { ContractAccountRepository } from "./contractAccountRepository.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";
import { readUpstashConfig } from "./upstashConfig.mjs";

export const CONTRACT_ACCOUNT_NETWORK = "stellar:testnet";
export const CONTRACT_ACCOUNT_PER_PAYMENT_LIMIT = 100_000n;
export const CONTRACT_ACCOUNT_TOTAL_LIMIT = 200_000n;
export const CONTRACT_ACCOUNT_MAX_FEE = 1_000_000n;

export class ContractAccountRelayer {
  constructor({
    env = process.env,
    repository = null,
    executor = null,
    now = () => new Date(),
  } = {}) {
    this.env = env;
    this.config = validateContractAccountConfig(env);
    this.repository = repository || new ContractAccountRepository({ env });
    this.executor = executor || new StellarContractAccountExecutor({ config: this.config });
    this.now = now;
  }

  async prepare(body = {}) {
    const request = validateCanonicalRequest(body, this.config, this.now());
    const prepared = await this.executor.prepare(request);
    const record = {
      requestId: randomUUID(),
      status: "prepared",
      createdAt: this.now().toISOString(),
      expiresAt: new Date(this.now().getTime() + 600_000).toISOString(),
      canonical: request,
      actionDigest: digestCanonical(request),
      unsignedAuthEntryXdr: prepared.unsignedAuthEntryXdr,
      signaturePayloadHex: prepared.signaturePayloadHex,
      authAddress: prepared.authAddress,
    };
    await this.repository.saveRequest(record);
    return safePublic({
      requestId: record.requestId,
      status: record.status,
      actionDigest: record.actionDigest,
      expiresAt: record.expiresAt,
      auth: {
        address: prepared.authAddress,
        unsignedEntryXdr: prepared.unsignedAuthEntryXdr,
        signaturePayloadHex: prepared.signaturePayloadHex,
      },
      summary: humanSummary(request),
    });
  }

  async submit({ requestId, signedAuthEntryXdr, assertion } = {}, { ip = "local" } = {}) {
    await this.enforceRateLimit(ip);
    if (String(this.env.CONTRACT_ACCOUNT_SUBMIT_ENABLED || "").toLowerCase() !== "true") {
      throw httpError(503, "Contract account submit gate is closed");
    }
    if (!/^[0-9a-f-]{36}$/i.test(requestId || "")) throw httpError(400, "Invalid requestId");
    if (!isSafeXdr(signedAuthEntryXdr) && !isStructuredAssertion(assertion)) {
      throw httpError(400, "A signed auth entry XDR or structured assertion is required");
    }
    const record = await this.repository.consumeRequest(requestId, this.now());
    try {
      const signedEntry = isSafeXdr(signedAuthEntryXdr)
        ? signedAuthEntryXdr
        : attachContractSignature(record, assertion);
      const result = await this.executor.submit(record, signedEntry);
      const receipt = await this.repository.saveReceipt({
        ...record.canonical,
        transactionHash: result.transactionHash,
        settledAt: result.settledAt || this.now().toISOString(),
      });
      return safePublic({ receipt });
    } catch (error) {
      await this.repository.markFailed(requestId, "submission_failed");
      throw httpError(error.status || 502, "Contract account settlement failed");
    }
  }

  async enforceRateLimit(ip) {
    if (!this.rateLimiter) return;
    const result = await this.rateLimiter.limit(`contract-account:${ip}`);
    if (!result.success) throw httpError(429, "Contract account rate limit exceeded");
  }
  async status() {
    return safePublic({
      readiness: contractAccountReadiness(this.env),
      receipts: await this.repository.listReceipts(20),
    });
  }
}

export class StellarContractAccountExecutor {
  constructor({ config, server = null } = {}) {
    this.config = config;
    this.server = server || new rpc.Server(config.rpcUrl);
    this.relayer = Keypair.fromSecret(config.relayerSecret);
  }

  async prepare(request) {
    const source = await this.server.getAccount(this.relayer.publicKey());
    const operation = buildOperation(request);
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    }).addOperation(operation).setTimeout(300).build();
    const prepared = await this.server.prepareTransaction(tx);
    assertFeeWithinLimit(prepared.fee);
    const entry = extractSingleAddressAuthEntry(prepared, request.contractId);
    const latest = await this.server.getLatestLedger();
    const clone = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());
    clone.credentials().address().signatureExpirationLedger(latest.sequence + 120);
    const payload = authorizationPayload(clone);
    return {
      authAddress: request.contractId,
      unsignedAuthEntryXdr: clone.toXDR("base64"),
      signaturePayloadHex: payload.toString("hex"),
    };
  }

  async submit(record, signedAuthEntryXdr) {
    const signedEntry = xdr.SorobanAuthorizationEntry.fromXDR(signedAuthEntryXdr, "base64");
    validateSignedEntry(record, signedEntry);
    const source = await this.server.getAccount(this.relayer.publicKey());
    const operation = { ...buildOperation(record.canonical), auth: [signedEntry] };
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    }).addOperation(operation).setTimeout(300).build();
    const simulation = await this.server.simulateTransaction(tx, undefined, "enforce");
    if (!rpc.Api.isSimulationSuccess(simulation)) throw httpError(422, "Signed auth entry failed enforcing simulation");
    const assembled = rpc.assembleTransaction(tx, simulation).build();
    assertFeeWithinLimit(assembled.fee);
    assembled.sign(this.relayer);
    const sent = await this.server.sendTransaction(assembled);
    if (sent.status !== "PENDING") throw httpError(502, `Relayer returned ${sent.status}`);
    const settled = await pollTransaction(this.server, sent.hash);
    if (settled.status !== "SUCCESS") throw httpError(502, "Contract account transaction failed");
    return { transactionHash: sent.hash, settledAt: new Date().toISOString() };
  }
}

export function contractAccountReadiness(env = process.env) {
  const enabled = String(env.CONTRACT_ACCOUNT_ENABLED || "").toLowerCase() === "true";
  const submitEnabled = String(env.CONTRACT_ACCOUNT_SUBMIT_ENABLED || "").toLowerCase() === "true";
  const contractValid = StrKey.isValidContract(env.CONTRACT_ACCOUNT_ID || "");
  const merchantValid = StrKey.isValidEd25519PublicKey(env.CONTRACT_ACCOUNT_MERCHANT || "");
  const relayerValid = readRelayerPublicKey(env) != null;
  const upstash = readUpstashConfig(env).configured;
  return {
    status: enabled && contractValid && merchantValid && relayerValid && upstash
      ? submitEnabled ? "ready-submit-testnet" : "ready-preview"
      : enabled ? "blocked" : "disabled",
    enabled,
    submitEnabled,
    network: CONTRACT_ACCOUNT_NETWORK,
    contractId: contractValid ? env.CONTRACT_ACCOUNT_ID : null,
    merchant: merchantValid ? env.CONTRACT_ACCOUNT_MERCHANT : null,
    assetContractId: USDC_SAC_TESTNET,
    relayerPublicKey: readRelayerPublicKey(env),
    upstash,
    missing: [
      !contractValid && "CONTRACT_ACCOUNT_ID",
      !merchantValid && "CONTRACT_ACCOUNT_MERCHANT",
      !relayerValid && "CONTRACT_ACCOUNT_RELAYER_SECRET",
      !upstash && "UPSTASH_OR_KV_REST_API_CREDENTIALS",
    ].filter(Boolean),
  };
}

export function validateContractAccountConfig(env = process.env) {
  if (String(env.CONTRACT_ACCOUNT_ENABLED || "").toLowerCase() !== "true") {
    throw httpError(503, "Contract account runtime is disabled");
  }
  if ((env.CONTRACT_ACCOUNT_NETWORK || CONTRACT_ACCOUNT_NETWORK) !== CONTRACT_ACCOUNT_NETWORK) {
    throw httpError(409, "Only Stellar testnet contract accounts are allowed");
  }
  const contractId = env.CONTRACT_ACCOUNT_ID || "";
  const merchant = env.CONTRACT_ACCOUNT_MERCHANT || "";
  const relayerSecret = env.CONTRACT_ACCOUNT_RELAYER_SECRET || "";
  if (!StrKey.isValidContract(contractId)) throw httpError(503, "CONTRACT_ACCOUNT_ID is invalid");
  if (!StrKey.isValidEd25519PublicKey(merchant)) throw httpError(503, "CONTRACT_ACCOUNT_MERCHANT is invalid");
  if (!StrKey.isValidEd25519SecretSeed(relayerSecret)) {
    throw httpError(503, "CONTRACT_ACCOUNT_RELAYER_SECRET is invalid");
  }
  return {
    contractId,
    merchant,
    relayerSecret,
    sessionPublicKey: env.CONTRACT_ACCOUNT_SESSION_PUBLIC_KEY || "",
    assetContractId: USDC_SAC_TESTNET,
    rpcUrl: env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  };
}

export function validateCanonicalRequest(body, config, now = new Date()) {
  if (body.network && body.network !== CONTRACT_ACCOUNT_NETWORK) throw httpError(409, "Mainnet is not allowed");
  if (body.contractId && body.contractId !== config.contractId) throw httpError(409, "Contract override is not allowed");
  const action = body.action;
  if (!["grant", "revoke", "transfer"].includes(action)) throw httpError(400, "Unsupported contract account action");
  const base = {
    action,
    network: CONTRACT_ACCOUNT_NETWORK,
    contractId: config.contractId,
    signerType: action === "transfer" ? "session-ed25519" : "owner-passkey",
  };
  if (action === "revoke") return base;
  if (action === "grant") {
    const signer = body.sessionPublicKey || config.sessionPublicKey;
    if (!StrKey.isValidEd25519PublicKey(signer || "")) throw httpError(400, "Invalid session public key");
    return {
      ...base,
      sessionPublicKey: signer,
      destination: config.merchant,
      assetContractId: USDC_SAC_TESTNET,
      perPaymentLimit: CONTRACT_ACCOUNT_PER_PAYMENT_LIMIT.toString(),
      totalLimit: CONTRACT_ACCOUNT_TOTAL_LIMIT.toString(),
      expiresAt: Math.floor(now.getTime() / 1000) + 86_400,
    };
  }
  const amount = BigInt(body.amount ?? CONTRACT_ACCOUNT_PER_PAYMENT_LIMIT);
  if (amount <= 0n || amount > CONTRACT_ACCOUNT_PER_PAYMENT_LIMIT) {
    throw httpError(409, "Transfer amount exceeds the 0.01 USDC policy");
  }
  if (body.destination && body.destination !== config.merchant) throw httpError(409, "Destination override is not allowed");
  if (body.assetContractId && body.assetContractId !== USDC_SAC_TESTNET) throw httpError(409, "Asset override is not allowed");
  return {
    ...base,
    destination: config.merchant,
    assetContractId: USDC_SAC_TESTNET,
    amount: amount.toString(),
  };
}

function isStructuredAssertion(assertion) {
  return assertion != null
    && typeof assertion === "object"
    && ["passkey", "session"].includes(assertion.type);
}

export function attachContractSignature(record, assertion) {
  if (!assertion || typeof assertion !== "object") throw httpError(400, "A passkey or session assertion is required");
  const expectedType = record.canonical.signerType === "owner-passkey" ? "passkey" : "session";
  if (assertion.type !== expectedType) throw httpError(409, "Assertion signer type does not match action");
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(record.unsignedAuthEntryXdr, "base64");
  let signatureValue;
  if (assertion.type === "passkey") {
    signatureValue = enumScVal("Passkey", structScVal({
      authenticator_data: readBoundedBytes(assertion.authenticatorData, 37, 512, "authenticatorData"),
      client_data_json: readBoundedBytes(assertion.clientDataJson, 32, 2048, "clientDataJson"),
      credential_id_hash: readFixedBytes(assertion.credentialIdHash, 32, "credentialIdHash"),
      signature: readFixedBytes(assertion.signature, 64, "signature"),
    }));
  } else {
    signatureValue = enumScVal("Session", structScVal({
      public_key: readFixedBytes(assertion.publicKey, 32, "publicKey"),
      signature: readFixedBytes(assertion.signature, 64, "signature"),
    }));
  }
  entry.credentials().address().signature(signatureValue);
  validateSignedEntry(record, entry);
  return entry.toXDR("base64");
}
function buildOperation(request) {
  const account = new Contract(request.contractId);
  if (request.action === "grant") {
    return account.call(
      "grant",
      xdr.ScVal.scvBytes(StrKey.decodeEd25519PublicKey(request.sessionPublicKey)),
      xdr.ScVal.scvVec([new Address(request.destination).toScVal()]),
      xdr.ScVal.scvVec([new Address(request.assetContractId).toScVal()]),
      nativeToScVal(BigInt(request.perPaymentLimit), { type: "i128" }),
      nativeToScVal(BigInt(request.totalLimit), { type: "i128" }),
      nativeToScVal(BigInt(request.expiresAt), { type: "u64" }),
    );
  }
  if (request.action === "revoke") return account.call("revoke");
  return new Contract(request.assetContractId).call(
    "transfer",
    new Address(request.contractId).toScVal(),
    new Address(request.destination).toScVal(),
    nativeToScVal(BigInt(request.amount), { type: "i128" }),
  );
}

function extractSingleAddressAuthEntry(transaction, expectedAddress) {
  const operation = transaction.operations[0];
  const entries = operation?.auth || [];
  const matches = entries.filter((entry) => {
    if (entry.credentials().switch().value !== xdr.SorobanCredentialsType.sorobanCredentialsAddress().value) return false;
    return Address.fromScAddress(entry.credentials().address().address()).toString() === expectedAddress;
  });
  if (matches.length !== 1) throw httpError(422, "Expected exactly one contract account authorization entry");
  return matches[0];
}

function authorizationPayload(entry) {
  const credentials = entry.credentials().address();
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(Networks.TESTNET)),
      nonce: credentials.nonce(),
      signatureExpirationLedger: credentials.signatureExpirationLedger(),
      invocation: entry.rootInvocation(),
    }),
  );
  return hash(preimage.toXDR());
}

function validateSignedEntry(record, signedEntry) {
  const expected = xdr.SorobanAuthorizationEntry.fromXDR(record.unsignedAuthEntryXdr, "base64");
  if (signedEntry.rootInvocation().toXDR("hex") !== expected.rootInvocation().toXDR("hex")) {
    throw httpError(409, "Signed invocation does not match prepared request");
  }
  const actualCredentials = signedEntry.credentials().address();
  const expectedCredentials = expected.credentials().address();
  if (
    actualCredentials.address().toXDR("hex") !== expectedCredentials.address().toXDR("hex")
    || actualCredentials.nonce().toString() !== expectedCredentials.nonce().toString()
    || actualCredentials.signatureExpirationLedger() !== expectedCredentials.signatureExpirationLedger()
  ) {
    throw httpError(409, "Signed authorization credentials do not match prepared request");
  }
  if (actualCredentials.signature().switch().value === xdr.ScValType.scvVoid().value) {
    throw httpError(400, "Authorization entry has no signature");
  }
  const payload = authorizationPayload(signedEntry).toString("hex");
  if (payload !== record.signaturePayloadHex) throw httpError(409, "Authorization payload mismatch");
}

function assertFeeWithinLimit(fee) {
  if (BigInt(fee) > CONTRACT_ACCOUNT_MAX_FEE) throw httpError(409, "Relayer fee exceeds 0.1 XLM");
}

async function pollTransaction(server, transactionHash) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await server.getTransaction(transactionHash);
    if (result.status !== "NOT_FOUND") return result;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw httpError(504, "Contract account settlement confirmation timed out");
}

function createContractAccountRateLimiter(env) {
  const upstash = readUpstashConfig(env);
  if (!upstash.configured) return null;
  const redis = new Redis({ url: upstash.url, token: upstash.token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "spendhub:account:rate",
    analytics: false,
  });
}
function readRelayerPublicKey(env) {
  try {
    return Keypair.fromSecret(env.CONTRACT_ACCOUNT_RELAYER_SECRET || "").publicKey();
  } catch {
    return null;
  }
}

function digestCanonical(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function humanSummary(request) {
  if (request.action === "grant") {
    return {
      action: "Grant agent session",
      destination: request.destination,
      asset: "USDC",
      perPaymentLimit: "0.01",
      totalLimit: "0.02",
      expiresAt: request.expiresAt,
    };
  }
  if (request.action === "revoke") return { action: "Revoke agent session" };
  return {
    action: "Agent pays merchant",
    destination: request.destination,
    asset: "USDC",
    amount: (Number(request.amount) / 10_000_000).toFixed(7),
  };
}

function safePublic(value) {
  const scan = assertNoSensitiveData(value, "contractAccountPublicResponse");
  if (!scan.allowed) throw httpError(500, "Sensitive contract account output blocked");
  return value;
}

function isSafeXdr(value) {
  return typeof value === "string" && value.length >= 64 && value.length <= 16_384 && /^[A-Za-z0-9+/=]+$/.test(value);
}

function enumScVal(variant, value) {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), value]);
}

function structScVal(fields) {
  const entries = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(key),
      val: xdr.ScVal.scvBytes(value),
    }));
  return xdr.ScVal.scvMap(entries);
}

function readFixedBytes(value, length, label) {
  const bytes = decodeBase64Url(value, label);
  if (bytes.length !== length) throw httpError(400, `${label} must contain ${length} bytes`);
  return bytes;
}

function readBoundedBytes(value, minimum, maximum, label) {
  const bytes = decodeBase64Url(value, label);
  if (bytes.length < minimum || bytes.length > maximum) {
    throw httpError(400, `${label} length is outside the allowed range`);
  }
  return bytes;
}

function decodeBase64Url(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw httpError(400, `${label} must be base64url`);
  return Buffer.from(value, "base64url");
}
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

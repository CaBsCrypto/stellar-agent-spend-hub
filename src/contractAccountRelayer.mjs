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
import {
  CONTRACT_ACCOUNT_MAX_FEE,
  CONTRACT_ACCOUNT_NETWORK,
  CONTRACT_ACCOUNT_PER_PAYMENT_LIMIT,
  CONTRACT_ACCOUNT_TOTAL_LIMIT,
  contractAccountReadiness,
  validateContractAccountConfig,
} from "./contractAccountConfig.mjs";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { ContractAccountRepository } from "./contractAccountRepository.mjs";
import { readUpstashConfig } from "./upstashConfig.mjs";
import { createPreparedRequestRecord } from "./contractAccountRequestStore.mjs";
import { humanSummary, safeContractAccountPublic as safePublic } from "./contractAccountReceipt.mjs";
import {
  assertFeeWithinLimit,
  ensureContractAccountSubmitEnabled,
  isSafeXdr,
  validateSubmitPayload,
} from "./contractAccountSubmitGuards.mjs";


export class ContractAccountRelayer {
  constructor({
    env = process.env,
    repository = null,
    executor = null,
    now = () => new Date(),
  } = {}) {
    this.env = env;
    this.rateLimiter = createContractAccountRateLimiter(env);
    this.config = validateContractAccountConfig(env);
    this.repository = repository || new ContractAccountRepository({ env });
    this.executor = executor || new StellarContractAccountExecutor({ config: this.config });
    this.now = now;
  }

  async prepare(body = {}) {
    const request = validateCanonicalRequest(body, this.config, this.now());
    const prepared = await this.executor.prepare(request);
    const record = createPreparedRequestRecord({ request, prepared, now: this.now });
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
    ensureContractAccountSubmitEnabled(this.env);
    validateSubmitPayload({ requestId, signedAuthEntryXdr, assertion });
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
      const publicError = httpError(error.status || 502, "Contract account settlement failed");
      publicError.cause = error;
      throw publicError;
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
    const operation = attachAuthorization(buildOperation(record.canonical), signedEntry);
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

export function attachAuthorization(operation, signedEntry) {
  const invocation = operation.body().invokeHostFunctionOp();
  invocation.auth([signedEntry]);
  return operation;
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

export {
  CONTRACT_ACCOUNT_MAX_FEE,
  CONTRACT_ACCOUNT_NETWORK,
  CONTRACT_ACCOUNT_PER_PAYMENT_LIMIT,
  CONTRACT_ACCOUNT_TOTAL_LIMIT,
  contractAccountReadiness,
  validateContractAccountConfig,
};

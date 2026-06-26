import { createReceipt, IntentType, RiskLevel } from "./domain.mjs";
import { PaymentExecutionMode, resolvePaymentExecutionMode } from "./paymentRuntime.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";
import { runSorobanTestnetDemo } from "../scripts/soroban-testnet-demo.mjs";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const DEFAULT_MAX_AMOUNT = 1;

export async function runAdminSorobanTransfer({ request, body = {}, env = process.env, service, runner, now = () => new Date() } = {}) {
  let input = null;
  try {
    authorizeSorobanAdmin({ auth: readHeader(request, "authorization"), env });
    input = validateTransferInput({ body, request, env });
    const existing = service?.getSorobanExecution(input.idempotencyKey);
    if (existing) return { ...existing, idempotentReplay: true };

    const intent = buildAdminSorobanIntent({ input, now });
    const evaluation = buildAdminSorobanEvaluation();
    const preview = buildSorobanReceipt({ intent, evaluation, input, executionStatus: "preview", transactionHash: null, now });

    if (input.mode === "dry-run") {
      const report = safeReport({
        ok: true,
        status: "preview",
        executionMode: PaymentExecutionMode.sorobanDryRun,
        transactionHash: null,
        receipt: preview,
      });
      await service?.recordSorobanExecution(input.idempotencyKey, report);
      return report;
    }

    assertSubmitEnabled(env);
    await service?.recordSorobanExecution(
      input.idempotencyKey,
      safeReport({
        ok: false,
        status: "submitting",
        executionMode: PaymentExecutionMode.sorobanTestnetSubmit,
        transactionHash: null,
        receipt: { ...preview, executionStatus: "submitted", finality: "submit-in-progress" },
      }),
    );

    const result = await runSorobanTestnetDemo({
      action: "transfer",
      env: transferCommandEnv({ env, input }),
      execute: true,
      runner,
    });
    if (!result.ok) throw httpError(502, result.error || "Soroban transfer execution failed");

    const transactionHash = extractTransactionHash(`${result.stdout || ""}\n${result.stderr || ""}`);
    if (!transactionHash) throw httpError(502, "Soroban submit completed without a transaction hash");

    const receipt = buildSorobanReceipt({ intent, evaluation, input, executionStatus: "settled", transactionHash, now });
    const report = safeReport({
      ok: true,
      status: "settled",
      executionMode: PaymentExecutionMode.sorobanTestnetSubmit,
      transactionHash,
      receipt,
    });
    await service?.recordSorobanExecution(input.idempotencyKey, report);
    return report;
  } catch (error) {
    const message = redactEnvSecrets(error.message || "Admin Soroban transfer failed", env);
    if (input?.idempotencyKey && input.mode === "submit" && service) {
      await service.recordSorobanExecution(
        input.idempotencyKey,
        safeReport({
          ok: false,
          status: "failed",
          executionMode: PaymentExecutionMode.sorobanTestnetSubmit,
          transactionHash: null,
          receipt: null,
          error: message,
        }),
      );
    }
    throw httpError(error.status || 500, message);
  }
}

export function validateTransferInput({ body = {}, request, env = process.env }) {
  assertTestnetOnly(env);
  const mode = body.mode === "submit" ? "submit" : "dry-run";
  const idempotencyKey = readHeader(request, "idempotency-key") || body.idempotencyKey;
  if (!idempotencyKey || !/^[a-zA-Z0-9:_-]{8,128}$/.test(idempotencyKey)) {
    throw httpError(400, "A safe idempotency key of 8-128 characters is required");
  }

  const contractId = requiredPublicId(env.SOROBAN_SMART_WALLET_CONTRACT_ID, "SOROBAN_SMART_WALLET_CONTRACT_ID");
  const assetContractId = requiredPublicId(env.SOROBAN_NATIVE_ASSET_CONTRACT_ID, "SOROBAN_NATIVE_ASSET_CONTRACT_ID");
  const sessionPublicKey = requiredPublicId(env.SOROBAN_SESSION_PUBLIC_KEY, "SOROBAN_SESSION_PUBLIC_KEY");
  const destination = requiredPublicId(env.SOROBAN_TEST_DESTINATION, "SOROBAN_TEST_DESTINATION");
  const providerId = String(body.providerId || env.SOROBAN_PROVIDER_ID || "browserbase-mcp");
  const allowedProviders = csv(env.SOROBAN_ALLOWED_PROVIDERS || env.SOROBAN_PROVIDER_ID || "browserbase-mcp");
  if (!allowedProviders.includes(providerId)) throw httpError(403, "Provider is outside the Soroban admin allowlist");

  const amount = Number(body.amount ?? env.SOROBAN_TEST_AMOUNT ?? DEFAULT_MAX_AMOUNT);
  const maxAmount = Number(env.SOROBAN_TINY_MAX_AMOUNT || DEFAULT_MAX_AMOUNT);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > maxAmount) {
    throw httpError(400, `Amount must be a positive integer no greater than ${maxAmount} native SAC units`);
  }

  const nonce = Number(body.nonce ?? env.SOROBAN_TRANSFER_NONCE);
  if (!Number.isSafeInteger(nonce) || nonce <= 0) throw httpError(400, "A positive integer Soroban nonce is required");
  if (body.contractId && body.contractId !== contractId) throw httpError(403, "Contract id override is not allowed");
  if (body.assetContractId && body.assetContractId !== assetContractId) throw httpError(403, "Asset contract override is not allowed");
  if (body.destination && body.destination !== destination) throw httpError(403, "Destination override is not allowed");

  return { mode, idempotencyKey, contractId, assetContractId, sessionPublicKey, destination, providerId, amount, nonce };
}

export function buildAdminSorobanIntent({ input, now = () => new Date() }) {
  return {
    id: `intent-admin-soroban-${input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`,
    intentType: IntentType.payService,
    providerId: input.providerId,
    providerName: input.providerId,
    category: IntentType.payService,
    amount: input.amount,
    currency: "XLM",
    dueDate: now().toISOString().slice(0, 10),
    sourceOfFunds: "soroban-smart-wallet-prefunded",
    riskLevel: RiskLevel.low,
    destinationAddress: input.destination,
    privacyRequirement: "no-pii",
    proofRequired: false,
    proofStatus: "not-required",
    autopilotRequested: false,
    publicMetadata: { purpose: "admin-soroban-testnet-tiny-transfer" },
    agentReason: "Tiny supervised Soroban SAC transfer on Stellar testnet.",
  };
}

export function extractTransactionHash(output = "") {
  const text = String(output);
  const labeled = text.match(/(?:transaction(?:\s+hash)?|tx(?:_?hash)?)["'\s:=]+([0-9a-f]{64})/i);
  if (labeled) return labeled[1].toLowerCase();
  const explorer = text.match(/\/tx\/([0-9a-f]{64})/i);
  if (explorer) return explorer[1].toLowerCase();
  const hashes = text.match(/\b[0-9a-f]{64}\b/gi) || [];
  return hashes.length === 1 ? hashes[0].toLowerCase() : null;
}

export function authorizeSorobanAdmin({ auth, env = process.env }) {
  const expected = env.SOROBAN_SUBMIT_ADMIN_TOKEN;
  if (!expected) throw httpError(500, "SOROBAN_SUBMIT_ADMIN_TOKEN is not configured");
  if (!String(auth || "").startsWith("Bearer ")) throw httpError(401, "Missing bearer token");
  const actual = String(auth).slice("Bearer ".length).trim();
  if (!timingSafeEqualString(actual, expected)) throw httpError(403, "Invalid bearer token");
}

function assertSubmitEnabled(env) {
  if (String(env.SOROBAN_SUBMIT_ENABLED || "").trim().toLowerCase() !== "true") {
    throw httpError(409, "SOROBAN_SUBMIT_ENABLED must be true for supervised Soroban submit");
  }
  if (env.SOROBAN_EXECUTION_DRIVER !== "stellar-cli") {
    throw httpError(409, "SOROBAN_EXECUTION_DRIVER must be stellar-cli for supervised submit");
  }
  if (resolvePaymentExecutionMode(env) !== PaymentExecutionMode.sorobanTestnetSubmit) {
    throw httpError(409, "SPEND_HUB_PAYMENT_RAIL must be soroban-testnet-submit for supervised submit");
  }
}

function assertTestnetOnly(env) {
  if (env.SOROBAN_NETWORK && env.SOROBAN_NETWORK !== "testnet") throw httpError(400, "Only Stellar testnet is allowed");
  if (env.SOROBAN_NETWORK_PASSPHRASE && env.SOROBAN_NETWORK_PASSPHRASE !== TESTNET_PASSPHRASE) {
    throw httpError(400, "Only the Stellar testnet network passphrase is allowed");
  }
  if (env.SOROBAN_RPC_URL && !/^https:\/\/soroban-testnet\.stellar\.org\/?$/i.test(env.SOROBAN_RPC_URL)) {
    throw httpError(400, "Only the official Stellar testnet Soroban RPC is allowed");
  }
  if (String(env.SOROBAN_ASSET || "native").toLowerCase() !== "native") {
    throw httpError(400, "Only native XLM SAC is allowed in Sprint 08");
  }
}

function buildAdminSorobanEvaluation() {
  return {
    allowed: true,
    requiresConfirmation: true,
    reasons: [],
    evidence: [
      "Admin bearer token verified",
      "Human-confirmed testnet execution",
      "Smart wallet contract and native SAC locked by environment allowlist",
      "Amount inside tiny transfer limit",
      "No PII in Soroban receipt",
    ],
    legalDecision: null,
    privacyDecision: { proofHash: null, commitment: null, privacyLevel: "no-pii" },
  };
}

function buildSorobanReceipt({ intent, evaluation, input, executionStatus, transactionHash, now }) {
  const receipt = createReceipt({
    intent,
    evaluation,
    approvedBy: "admin-human-confirmation",
    railResult: {
      transactionHash,
      rail: "Soroban Smart Wallet",
      network: "stellar:testnet",
      asset: "XLM",
      finality: transactionHash ? "stellar-testnet-submitted" : "not-submitted-soroban-dry-run",
      executionStatus,
    },
  });
  return {
    ...receipt,
    timestamp: now().toISOString(),
    contractId: input.contractId,
    assetContractId: input.assetContractId,
    destination: input.destination,
    providerId: input.providerId,
    nonce: input.nonce,
    idempotencyKey: input.idempotencyKey,
    executionStatus,
  };
}

function transferCommandEnv({ env, input }) {
  return {
    ...env,
    SOROBAN_NETWORK: "testnet",
    SOROBAN_ASSET: "native",
    SOROBAN_SMART_WALLET_CONTRACT_ID: input.contractId,
    SOROBAN_NATIVE_ASSET_CONTRACT_ID: input.assetContractId,
    SOROBAN_SESSION_PUBLIC_KEY: input.sessionPublicKey,
    SOROBAN_TEST_DESTINATION: input.destination,
    SOROBAN_PROVIDER_ID: input.providerId,
    SOROBAN_TEST_AMOUNT: String(input.amount),
    SOROBAN_TRANSFER_NONCE: String(input.nonce),
  };
}

function safeReport(value) {
  const scan = assertNoSensitiveData(value, "adminSorobanTransferReport");
  if (!scan.allowed) throw httpError(500, scan.reasons.join("; "));
  return value;
}

function requiredPublicId(value, name) {
  if (!value) throw httpError(409, `${name} is required`);
  return String(value);
}

function readHeader(request, name) {
  if (!request?.headers) return "";
  if (typeof request.headers.get === "function") return request.headers.get(name) || "";
  return request.headers[name] || request.headers[name.toLowerCase()] || request.headers[name.toUpperCase()] || "";
}

function csv(value) {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function timingSafeEqualString(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

function redactEnvSecrets(message, env) {
  let redacted = String(message);
  for (const [key, value] of Object.entries(env || {})) {
    if (!value || typeof value !== "string") continue;
    if (/(SECRET|TOKEN|SEED|MNEMONIC|PRIVATE)/i.test(key)) redacted = redacted.replaceAll(value, "[REDACTED]");
  }
  return redacted.replace(/\bS[A-Z2-7]{55}\b/g, "[REDACTED_STELLAR_SECRET]");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}


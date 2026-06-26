import { createReceipt } from "./domain.mjs";

const REQUIRED_ENV = ["STELLAR_SECRET_KEY", "STELLAR_PUBLIC_KEY", "STELLAR_HORIZON_URL"];

export class StellarTestnetRealAdapter {
  constructor({ env = {}, sdkLoader = null, fetchImpl = null } = {}) {
    this.name = "Stellar Testnet Real Rail";
    this.network = "stellar:testnet";
    this.asset = "XLM";
    this.env = env;
    this.fetchImpl = fetchImpl || globalThis.fetch?.bind(globalThis);
    this.sdkLoader = sdkLoader || (() => import("@stellar/stellar-sdk"));
  }

  diagnostics() {
    const missing = requiredMissing(this.env, REQUIRED_ENV);
    return {
      mode: missing.length === 0 ? "env-configured" : "missing-env",
      missing,
      publicKey: redactPublicKey(this.env.STELLAR_PUBLIC_KEY),
      horizonUrl: this.env.STELLAR_HORIZON_URL || null,
      secretKeyPresent: Boolean(this.env.STELLAR_SECRET_KEY),
      submitEnabled: isSubmitEnabled(this.env),
      sdkPackage: "@stellar/stellar-sdk",
    };
  }

  async readiness({ checkHorizon = false } = {}) {
    const diagnostics = this.diagnostics();
    if (diagnostics.missing.length > 0) {
      return { ...diagnostics, status: "not-ready", reason: "Missing Stellar testnet env vars" };
    }

    let sdk;
    try {
      sdk = await this.sdkLoader();
    } catch (error) {
      return { ...diagnostics, status: "sdk-missing", reason: error.code || error.message };
    }

    const keypair = validateKeypair({ sdk, env: this.env });
    if (!keypair.valid) {
      return { ...diagnostics, status: "invalid-keypair", reason: keypair.reason };
    }

    if (checkHorizon) {
      const horizon = await this.checkHorizon(this.env.STELLAR_HORIZON_URL);
      if (!horizon.ok) {
        return { ...diagnostics, status: "horizon-unreachable", reason: horizon.reason };
      }
      return { ...diagnostics, horizon, status: "ready", reason: "SDK, env, keypair and Horizon available" };
    }

    return { ...diagnostics, status: "ready", reason: "SDK, env and keypair available" };
  }

  async checkHorizon(horizonUrl) {
    if (!this.fetchImpl) return { ok: false, reason: "fetch unavailable" };
    try {
      const response = await this.fetchImpl(horizonUrl, { method: "GET" });
      return { ok: response.ok, status: response.status, reason: response.ok ? "reachable" : `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async preparePayment(intent, evaluation) {
    const readiness = await this.readiness();
    const canSubmit = evaluation.allowed && readiness.status === "ready" && readiness.submitEnabled;
    return {
      rail: this.name,
      network: this.network,
      asset: this.asset,
      canSubmit,
      submitMode: readiness.submitEnabled ? "submit-enabled" : "dry-run-only",
      memo: safeMemo(intent),
      destination: this.env.STELLAR_TEST_DESTINATION || intent.destinationAddress,
      amount: String(this.env.STELLAR_TEST_AMOUNT_XLM || "0.000001"),
      readiness,
    };
  }

  async settlePayment(intent, evaluation, approvedBy = "user-passkey") {
    const prepared = await this.preparePayment(intent, evaluation);
    if (!evaluation.allowed || prepared.readiness.status !== "ready") {
      return createReceipt({
        intent,
        evaluation,
        approvedBy,
        railResult: {
          transactionHash: null,
          rail: this.name,
          network: this.network,
          asset: this.asset,
          finality: prepared.readiness.status === "ready" ? "blocked-before-submit" : "not-submitted-testnet-not-ready",
        },
      });
    }

    if (!prepared.readiness.submitEnabled) {
      return createReceipt({
        intent,
        evaluation,
        approvedBy,
        railResult: {
          transactionHash: `stellar_testnet_ready_${intent.id}_${Date.now().toString(36)}`,
          rail: this.name,
          network: this.network,
          asset: this.asset,
          finality: "dry-run-ready-not-submitted",
        },
      });
    }

    const sdk = await this.sdkLoader();
    const submitted = await this.submitNativePayment({ sdk, intent, prepared });
    return createReceipt({
      intent,
      evaluation,
      approvedBy,
      railResult: {
        transactionHash: submitted.hash,
        rail: this.name,
        network: this.network,
        asset: this.asset,
        finality: "submitted-testnet",
      },
    });
  }

  async submitNativePayment({ sdk, prepared }) {
    const Keypair = sdk.Keypair;
    const Horizon = sdk.Horizon;
    const Server = Horizon?.Server || sdk.Server;
    const TransactionBuilder = sdk.TransactionBuilder;
    const Operation = sdk.Operation;
    const Asset = sdk.Asset;
    const Memo = sdk.Memo;
    const Networks = sdk.Networks;
    const baseFee = sdk.BASE_FEE || "100";

    if (!Keypair || !Server || !TransactionBuilder || !Operation || !Asset || !Memo || !Networks?.TESTNET) {
      throw new Error("@stellar/stellar-sdk is missing required Horizon transaction APIs");
    }

    const keypair = Keypair.fromSecret(this.env.STELLAR_SECRET_KEY);
    const server = new Server(this.env.STELLAR_HORIZON_URL);
    const account = await server.loadAccount(this.env.STELLAR_PUBLIC_KEY);
    const fee = typeof server.fetchBaseFee === "function" ? await server.fetchBaseFee() : baseFee;
    const transaction = new TransactionBuilder(account, {
      fee: String(fee),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: prepared.destination,
          asset: Asset.native(),
          amount: String(prepared.amount),
        }),
      )
      .addMemo(Memo.text(prepared.memo))
      .setTimeout(60)
      .build();

    transaction.sign(keypair);
    const result = await server.submitTransaction(transaction);
    return { hash: result.hash };
  }
}

export function redactPublicKey(value) {
  if (!value) return null;
  if (value.length <= 12) return "***";
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function isSubmitEnabled(env) {
  return String(env.STELLAR_SUBMIT_ENABLED || "").trim().toLowerCase() === "true";
}

function validateKeypair({ sdk, env }) {
  try {
    if (!sdk.Keypair?.fromSecret) return { valid: false, reason: "SDK Keypair API unavailable" };
    const keypair = sdk.Keypair.fromSecret(env.STELLAR_SECRET_KEY);
    if (keypair.publicKey() !== env.STELLAR_PUBLIC_KEY) {
      return { valid: false, reason: "STELLAR_PUBLIC_KEY does not match STELLAR_SECRET_KEY" };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

function safeMemo(intent) {
  const id = String(intent.id || "intent").replace(/[^a-zA-Z0-9]/g, "");
  return `spend:${id.slice(-18)}`.slice(0, 28);
}

function requiredMissing(env, names) {
  return names.filter((name) => !env[name]);
}



import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { getAddress, isAddress } from "viem";
import { BASE_SEPOLIA_USDC, NetworkId } from "./chainRegistry.mjs";
import { buildBaseRiskReport, validateEvmTransactionHash } from "./baseRiskService.mjs";

const PRICE = "0.01";
const PRICE_BASE_UNITS = "10000";
const DEFAULT_FACILITATOR = "https://x402.org/facilitator";
const ROUTE = "GET /api/x402/base-risk";

export class BaseX402Service {
  constructor({
    env = process.env,
    fetchImpl = globalThis.fetch,
    runtimeFactory = null,
    riskLoader = null,
    onSettlement = null,
  } = {}) {
    this.env = env;
    this.fetch = fetchImpl;
    this.runtimeFactory = runtimeFactory || (() => createRuntime(env));
    this.riskLoader = riskLoader || ((hash) => buildBaseRiskReport(hash, { env, fetchImpl }));
    this.onSettlement = onSettlement;
    this.runtimePromise = null;
  }

  readiness() {
    const recipient = String(this.env.BASE_X402_MERCHANT_ADDRESS || "");
    return {
      status: !flag(this.env.MULTICHAIN_ENABLED) || !flag(this.env.BASE_X402_ENABLED)
        ? "disabled"
        : isAddress(recipient)
          ? "ready"
          : "not-configured",
      enabled: flag(this.env.MULTICHAIN_ENABLED) && flag(this.env.BASE_X402_ENABLED),
      network: NetworkId.baseSepolia,
      asset: "USDC",
      assetId: BASE_SEPOLIA_USDC,
      amount: PRICE,
      amountBaseUnits: PRICE_BASE_UNITS,
      recipient: isAddress(recipient) ? getAddress(recipient) : null,
      facilitator: this.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR,
    };
  }

  async handle(request, url) {
    const readiness = this.readiness();
    if (!readiness.enabled) return json({ error: "Base x402 rail is disabled" }, 503);
    if (readiness.status !== "ready") return json({ error: "Base x402 merchant is not configured" }, 503);

    const hash = validateEvmTransactionHash(url.searchParams.get("tx"));
    const report = await this.riskLoader(hash);
    const context = requestContext(request, url);
    const runtime = await this.runtime();
    const result = await runtime.processHTTPRequest(context);

    if (result.type === "payment-error") return instructionsResponse(result.response);
    if (result.type !== "payment-verified") return json({ error: "Payment required" }, 402);

    const responseBody = Buffer.from(JSON.stringify({ report }));
    const settlement = await runtime.processSettlement(
      result.paymentPayload,
      result.paymentRequirements,
      result.declaredExtensions,
      { request: context, responseBody, responseHeaders: { "Content-Type": "application/json; charset=utf-8" } },
    );
    if (!settlement.success) return instructionsResponse(settlement.response);
    if (
      settlement.network !== NetworkId.baseSepolia
      || result.paymentRequirements.asset.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase()
      || result.paymentRequirements.amount !== PRICE_BASE_UNITS
      || getAddress(result.paymentRequirements.payTo) !== readiness.recipient
    ) {
      throw httpError(409, "x402 settlement does not match the quoted Base payment");
    }
    const receipt = {
      id: `base-x402-${String(settlement.transaction).replace(/^0x/, "").slice(0, 12)}`,
      protocol: "x402",
      network: NetworkId.baseSepolia,
      asset: "USDC",
      assetId: BASE_SEPOLIA_USDC,
      amount: PRICE,
      amountBaseUnits: PRICE_BASE_UNITS,
      payer: settlement.payer,
      recipient: readiness.recipient,
      transactionHash: settlement.transaction,
      settledAt: new Date().toISOString(),
    };
    const stored = this.onSettlement ? await this.onSettlement(receipt) : receipt;
    return new Response(JSON.stringify({ report, receipt: stored }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...settlement.headers,
      },
    });
  }

  async runtime() {
    this.runtimePromise ||= Promise.resolve(this.runtimeFactory()).then(async (runtime) => {
      if (typeof runtime.initialize === "function") await runtime.initialize();
      return runtime;
    });
    return this.runtimePromise;
  }
}

export function createRuntime(env = process.env) {
  const recipient = String(env.BASE_X402_MERCHANT_ADDRESS || "");
  if (!isAddress(recipient)) throw httpError(503, "BASE_X402_MERCHANT_ADDRESS is invalid");
  const facilitator = new HTTPFacilitatorClient({
    url: env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR,
  });
  const core = new x402ResourceServer(facilitator);
  registerExactEvmScheme(core, { networks: [NetworkId.baseSepolia] });
  return new x402HTTPResourceServer(core, {
    [ROUTE]: {
      accepts: {
        scheme: "exact",
        payTo: getAddress(recipient),
        price: `$${PRICE}`,
        network: NetworkId.baseSepolia,
        maxTimeoutSeconds: 600,
      },
      resource: "/api/x402/base-risk",
      description: "Base Sepolia transaction heuristic report",
      mimeType: "application/json",
      serviceName: "Stellar Agent Spend Hub",
      tags: ["agentic-payments", "base", "risk-report"],
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "Payment Required",
          protocol: "x402",
          network: NetworkId.baseSepolia,
          asset: "USDC",
          amount: PRICE,
          amountBaseUnits: PRICE_BASE_UNITS,
        },
      }),
    },
  });
}

function requestContext(request, url) {
  const adapter = {
    getHeader(name) {
      const value = request.headers?.get
        ? request.headers.get(name)
        : request.headers?.[String(name).toLowerCase()];
      return Array.isArray(value) ? value[0] : value == null ? undefined : String(value);
    },
    getMethod: () => String(request.method || "GET").toUpperCase(),
    getPath: () => url.pathname,
    getUrl: () => url.toString(),
    getAcceptHeader() {
      return this.getHeader("accept") || "application/json";
    },
    getUserAgent() {
      return this.getHeader("user-agent") || "unknown";
    },
    getQueryParams: () => Object.fromEntries(url.searchParams.entries()),
    getQueryParam: (name) => url.searchParams.get(name) || undefined,
    getBody: () => request.body,
  };
  return {
    adapter,
    path: url.pathname,
    method: adapter.getMethod(),
    paymentHeader: adapter.getHeader("payment-signature"),
  };
}

function instructionsResponse(instructions) {
  const headers = new Headers(instructions.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  const body = instructions.body == null
    ? ""
    : typeof instructions.body === "string"
      ? instructions.body
      : JSON.stringify(instructions.body);
  return new Response(body, { status: instructions.status, headers });
}

function json(payload, status) {
  return Response.json(payload, { status });
}

function flag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

import { dynamic, exact } from "../apiRouteHelpers.mjs";

export function spendIntentRoutes({ service, env, dependencies }) {
  return [
    dynamic("GET", /^\/api\/machine-resource\/([^/]+)$/, ["providerId"], async ({ params, url, request }) => {
      if (String(env.LEGACY_402_ENABLED || "").toLowerCase() === "false") {
        return { status: 410, body: { error: "Legacy demo protocol is disabled; use /api/mpp/stellar-risk" } };
      }
      const result = await service.requestMachineResource({
        providerId: params.providerId,
        resourceId: url.searchParams.get("resource") || "agent-resource",
        amount: url.searchParams.get("amount") || null,
        credential: request.headers["x-payment-credential"] || null,
      });
      return { status: result.status || 200, body: result };
    }),
    exact("GET", "/api/providers/search", async ({ url }) => ({
      body: {
        providers: service.searchProviders({
          query: url.searchParams.get("q") || "",
          category: url.searchParams.get("category") || "",
        }),
      },
    })),
    exact("POST", "/api/intents", async ({ readJson, request }) => {
      const body = await readJson();
      const idempotencyKey = request.headers["idempotency-key"] || body.idempotencyKey || null;
      return { status: 201, body: { intent: await service.createIntent({ ...body, idempotencyKey }) } };
    }),
    dynamic(
      "POST",
      /^\/api\/intents\/([^/]+)\/(prepare|proof|approve|dismiss|link-spend-request|link-approve|link-deny)$/,
      ["intentId", "action"],
      async ({ params, readJson }) => {
        const body = await readJson();
        const { intentId, action } = params;
        if (action === "prepare") return { body: { prepared: await service.prepareIntent(intentId) } };
        if (action === "proof") return { body: await service.generateProof({ intentId, ...body }) };
        if (action === "approve") return { body: { receipt: await service.approveIntent(intentId, body.approvedBy || "user-passkey") } };
        if (action === "dismiss") return { body: { intent: await service.dismissIntent(intentId, body.dismissedBy || "user") } };
        if (action === "link-spend-request") return { body: { spendRequest: await service.createLinkSpendRequest(intentId) } };
        if (action === "link-approve") return { body: { receipt: await service.approveLinkSpendRequest(intentId, body.approvedBy || "link-biometric-simulated") } };
        return { body: { spendRequest: await service.denyLinkSpendRequest(intentId, body.deniedBy || "user") } };
      },
    ),
    dynamic("POST", /^\/api\/intents\/([^/]+)\/quote$/, ["intentId"], async ({ params, readJson }) => {
      const intent = service.findIntent(params.intentId);
      const provider = service.getProvider(intent.providerId);
      if (!provider) throw Object.assign(new Error("Provider not found"), { status: 404 });
      const body = await readJson();
      const merchant = env.BASE_X402_MERCHANT_ADDRESS || null;
      const paymentOptions = [
        {
          protocol: provider.paymentMethod?.includes("smart-wallet")
            ? "stellar-contract-account"
            : "stellar-mpp",
          network: "stellar:testnet",
          maxPrice: String(intent.amount),
          assetId: env.USDC_SAC_TESTNET || env.CONTRACT_ACCOUNT_USDC_SAC || undefined,
          recipient: env.MPP_STELLAR_RECIPIENT || env.CONTRACT_ACCOUNT_MERCHANT || undefined,
        },
        ...(merchant ? [{
          protocol: "x402",
          network: "eip155:84532",
          maxPrice: "0.01",
          recipient: merchant,
        }] : []),
      ];
      return {
        body: {
          quote: await dependencies.multichain().quote({
            provider: { ...provider, resource: provider.description, paymentOptions },
            balances: body.balances || {},
            allowedNetworks: body.allowedNetworks,
            preferredNetwork: body.preferredNetwork,
          }),
        },
      };
    }),
    dynamic("POST", /^\/api\/intents\/([^/]+)\/record-settlement$/, ["intentId"], async ({ params, readJson }) => {
      service.findIntent(params.intentId);
      return { body: { receipt: await dependencies.multichain().verifyAndRecordSettlement(await readJson()) } };
    }),
  ];
}

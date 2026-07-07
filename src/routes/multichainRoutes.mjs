import { dynamic, exact } from "../apiRouteHelpers.mjs";

export function multichainRoutes({ env, dependencies }) {
  return [
    exact("GET", "/api/chains", async () => ({
      body: {
        ...dependencies.multichain().chains(),
        baseX402: dependencies.baseX402().readiness(),
      },
    })),
    exact("GET", "/api/treasury", async ({ url }) => ({
      body: dependencies.multichain().treasury({ evmAddress: url.searchParams.get("evmAddress") }),
    })),
    exact("GET", "/api/privy/config", async () => ({
      body: {
        enabled: Boolean(env.PRIVY_APP_ID && env.PRIVY_CLIENT_ID),
        appId: env.PRIVY_APP_ID || null,
        clientId: env.PRIVY_CLIENT_ID || null,
        supportedNetworks: ["eip155:84532", "eip155:43113"],
        loginMethods: ["email", "google"],
      },
    })),
    exact("GET", "/api/x402/base-readiness", async () => ({
      body: await dependencies.baseX402().acceptanceReadiness(),
    })),
    exact("GET", "/api/x402/base-risk", async ({ request, url }) => (
      dependencies.baseX402().handle(request, url)
    )),
    exact("GET", "/api/multichain/evidence", async () => ({
      body: await dependencies.multichain().evidence(),
    })),
    exact("POST", "/api/bridges", async ({ readJson }) => ({
      status: 201,
      body: { bridge: await dependencies.multichain().createBridge(await readJson()) },
    })),
    dynamic("POST", /^\/api\/bridges\/([^/]+)\/prepare$/, ["bridgeId"], async ({ params }) => ({
      body: await dependencies.multichain().prepareBridge(params.bridgeId),
    })),
    dynamic("POST", /^\/api\/bridges\/([^/]+)\/record-burn$/, ["bridgeId"], async ({ params, readJson }) => ({
      body: { bridge: await dependencies.multichain().recordBurn(params.bridgeId, await readJson()) },
    })),
    dynamic("GET", /^\/api\/bridges\/([^/]+)$/, ["bridgeId"], async ({ params }) => ({
      body: { bridge: await dependencies.multichain().bridgeStatus(params.bridgeId) },
    })),
  ];
}

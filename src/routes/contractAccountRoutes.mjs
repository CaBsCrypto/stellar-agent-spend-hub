import { dynamic, exact } from "../apiRouteHelpers.mjs";
import { clientIp } from "../apiHttp.mjs";
import { contractAccountReadiness } from "../contractAccountRelayer.mjs";

export function contractAccountRoutes({ env, dependencies }) {
  return [
    exact("POST", "/api/contract-account/ceremony", async ({ readJson, request }) => ({
      status: 201,
      body: await dependencies.contractAccountCeremonies().register(await readJson(), { ip: clientIp(request) }),
    })),
    dynamic("GET", /^\/api\/contract-account\/ceremony\/([^/]+)$/, ["ceremonyId"], async ({ params }) => ({
      body: await dependencies.contractAccountCeremonies().status(params.ceremonyId),
    })),
    exact("GET", "/api/contract-account/status", async () => {
      const readiness = contractAccountReadiness(env);
      return {
        body: readiness.enabled
          ? await dependencies.contractAccount().status()
          : { readiness, receipts: [] },
      };
    }),
    exact("POST", "/api/contract-account/prepare", async ({ readJson, request }) => ({
      body: await dependencies.contractAccount().prepare(await readJson(), { ip: clientIp(request) }),
    })),
    exact("POST", "/api/contract-account/submit", async ({ readJson, request }) => ({
      body: await dependencies.contractAccount().submit(await readJson(), { ip: clientIp(request) }),
    })),
  ];
}

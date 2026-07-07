import { exact } from "../apiRouteHelpers.mjs";
import { toWebRequest } from "../apiHttp.mjs";
import { STELLAR_RISK_PROVIDER, validateProviderDefinition } from "../providerKit.mjs";

export function mppRoutes({ dependencies }) {
  return [
    exact("GET", "/api/mpp/stellar-risk", async ({ request, url }) => (
      dependencies.mpp().handleRiskRequest(toWebRequest(request, url), url.searchParams.get("tx"))
    )),
    exact("GET", "/api/mpp/receipts", async () => ({
      body: { receipts: await dependencies.mppReceipts().listReceipts(20) },
    })),
    exact("GET", "/api/evidence", async ({ url }) => ({
      body: await dependencies.publicEvidence().manifest({ mode: url.searchParams.get("mode") }),
    })),
    exact("GET", "/api/diagnostics/public", async () => ({
      body: await dependencies.publicEvidence().diagnostics(),
    })),
    exact("GET", "/api/provider-kit/definition", async () => ({
      body: { provider: STELLAR_RISK_PROVIDER },
    })),
    exact("POST", "/api/provider-kit/validate", async ({ readJson }) => ({
      body: { provider: validateProviderDefinition(await readJson()) },
    })),
  ];
}

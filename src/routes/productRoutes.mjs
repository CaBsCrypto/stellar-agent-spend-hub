import { exact } from "../apiRouteHelpers.mjs";
import {
  productActivityView,
  productHomeView,
  productSpendView,
  providersView,
} from "../productReadModels.mjs";

export function productRoutes({ service, env, dependencies }) {
  return [
    exact("GET", "/api/health", async () => ({ body: { ok: true, readiness: await service.readiness(env) } })),
    exact("GET", "/api/rail/diagnostics", async () => ({ body: await service.railDiagnostics() })),
    exact("GET", "/api/link/diagnostics", async () => ({ body: await service.linkDiagnostics() })),
    exact("GET", "/api/state", async () => ({ body: await service.getState() })),
    exact("GET", "/api/spend", async () => ({ body: await productSpendView(service) })),
    exact("GET", "/api/home", async () => ({
      body: await productHomeView({ service, publicEvidence: dependencies.publicEvidence() }),
    })),
    exact("GET", "/api/activity", async () => ({
      body: await productActivityView({ service, publicEvidence: dependencies.publicEvidence() }),
    })),
    exact("GET", "/api/providers", async ({ url }) => ({
      body: providersView(service, {
        query: url.searchParams.get("q") || "",
        category: url.searchParams.get("category") || "",
      }),
    })),
    exact("GET", "/api/overview", async ({ url }) => {
      const evidenceService = dependencies.publicEvidence();
      const [evidence, diagnostics] = await Promise.all([
        evidenceService.manifest({ mode: url.searchParams.get("mode") }),
        evidenceService.diagnostics(),
      ]);
      return { body: { evidence, diagnostics } };
    }),
  ];
}

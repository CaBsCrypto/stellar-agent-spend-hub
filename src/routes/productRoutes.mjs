import { exact } from "../apiRouteHelpers.mjs";
import { clientIp } from "../apiHttp.mjs";
import { FeedbackRepository, feedbackReadiness } from "../feedbackRepository.mjs";
import {
  productActivityView,
  productHomeView,
  productSpendView,
  providersView,
} from "../productReadModels.mjs";

export function productRoutes({ service, env, dependencies }) {
  const feedback = new FeedbackRepository({ env });
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
    exact("GET", "/api/feedback", async () => ({ body: { feedback: await feedback.summary(), readiness: feedbackReadiness(env) } })),
    exact("POST", "/api/feedback", async ({ request, readJson }) => ({
      status: 201,
      body: { feedback: await feedback.create(await readJson(), { ip: clientIp(request), userAgent: request.headers["user-agent"] || "" }) },
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

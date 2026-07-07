import { dynamic, exact } from "../apiRouteHelpers.mjs";
import { authenticatePilotRequest, clientIp as pilotClientIp, pilotReadiness, PILOT_TENANT_ID } from "../pilotAuth.mjs";
import { pilotRepositoryReadiness } from "../pilotRepository.mjs";
import { handlePilotMcpHttp } from "../mcp/pilotMcpHttp.mjs";

export function pilotRoutes({ env, dependencies }) {
  return [
    exact("POST", "/api/mcp", async ({ request, response }) => {
      await handlePilotMcpHttp({
        request,
        pilotServiceFactory: dependencies.pilot,
        response,
        env,
        rateLimiter: dependencies.pilotRateLimiter(),
      });
    }),
    exact("GET", "/api/pilot/readiness", async () => ({
      body: {
        pilot: pilotReadiness(env),
        repository: pilotRepositoryReadiness(env),
        providerCount: 1,
      },
    })),
    exact("GET", "/api/pilot/evidence", async () => ({
      body: await dependencies.pilot().evidence(),
    })),
    dynamic("GET", /^\/api\/pilot\/requests\/([^/]+)$/, ["requestId"], async ({ params, request }) => {
      await dependencies.pilotRateLimiter().enforce({ tenantId: PILOT_TENANT_ID, ip: pilotClientIp(request) });
      return { body: { request: await dependencies.pilot().getPublicRequest(params.requestId) } };
    }),
    dynamic("POST", /^\/api\/pilot\/requests\/([^/]+)\/approve$/, ["requestId"], async ({ params, readJson, request }) => {
      await dependencies.pilotRateLimiter().enforce({ tenantId: PILOT_TENANT_ID, ip: pilotClientIp(request) });
      const body = await readJson();
      return { body: { request: await dependencies.pilot().approve(params.requestId, body.approvalToken) } };
    }),
    dynamic("POST", /^\/api\/pilot\/requests\/([^/]+)\/claim$/, ["requestId"], async ({ params, request }) => {
      const { tenantId } = authenticatePilotRequest(request, env);
      await dependencies.pilotRateLimiter().enforce({ tenantId, ip: pilotClientIp(request) });
      return { body: await dependencies.pilot().claim(params.requestId, tenantId) };
    }),
    dynamic("POST", /^\/api\/pilot\/requests\/([^/]+)\/complete$/, ["requestId"], async ({ params, readJson, request }) => {
      const { tenantId } = authenticatePilotRequest(request, env);
      await dependencies.pilotRateLimiter().enforce({ tenantId, ip: pilotClientIp(request) });
      return { body: { request: await dependencies.pilot().complete(params.requestId, await readJson(), tenantId) } };
    }),
  ];
}

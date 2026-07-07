import {
  matchRoute,
  normalizeApiPath,
  normalizeErrorStatus,
  publicErrorMessage,
  readJson,
  selectRoute,
  writeJson,
  writeRouteResult,
} from "./apiHttp.mjs";
import { createDependencies, createRoutes } from "./apiRoutes.mjs";

export function createApiRouter({ service, env = process.env, dependencies: suppliedDependencies = null } = {}) {
  if (!service) throw new Error("API router requires SpendHubService");

  const dependencies = suppliedDependencies || createDependencies(env);
  const routes = createRoutes({ service, env, dependencies });

  return {
    routes,
    async handle({ request, response, url }) {
      const method = String(request.method || "GET").toUpperCase();
      const pathname = normalizeApiPath(url);
      const { selected, allowed } = selectRoute(routes, method, pathname);

      if (!selected) {
        if (allowed.length > 0) {
          response.setHeader("Allow", allowed.join(", "));
          writeJson(response, 405, { error: "Method not allowed" });
          return;
        }
        writeJson(response, 404, { error: "Not found" });
        return;
      }

      try {
        const result = await selected.route.handler({
          request,
          response,
          url,
          params: selected.params,
          readJson: () => readJson(request),
        });
        await writeRouteResult(response, result);
      } catch (error) {
        writeJson(response, normalizeErrorStatus(error), { error: publicErrorMessage(error) });
      }
    },
  };
}

export { matchRoute };

import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { SpendHubService } from "../src/spendHubService.mjs";
import { createApiRouter } from "../src/apiRouter.mjs";

const SPA_ROUTES = new Set(["/", "/discover", "/spend", "/activity", "/providers", "/mpp", "/wallet", "/treasury", "/evidence", "/security"]);
const ROOT_ASSETS = { "/manifest.webmanifest": "/src/client/manifest.webmanifest", "/sw.js": "/src/client/sw.js" };
const routerCache = new WeakMap();
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

if (isCliEntrypoint()) {
  const root = process.cwd();
  const port = Number(process.env.PORT || 4179);
  const { server } = await createSpendHubServer({ root, port, env: process.env });
  server.listen(port, () => {
    console.log(`Stellar Agent Spend Hub running at http://localhost:${port}`);
  });
}

export async function createSpendHubServer({
  root = process.cwd(),
  port = 4179,
  env = process.env,
  statePath = join(root, "data", "runtime-state.json"),
} = {}) {
  const service = await new SpendHubService({ statePath, env }).load();
  const apiRouter = createApiRouter({ service, env });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://localhost:${port}`);
      if (url.pathname.startsWith("/api/")) {
        await apiRouter.handle({ request, response, url });
        return;
      }
      await handleStatic({ response, url, root });
    } catch (error) {
      const status = error.status || (error.code === "ENOENT" ? 404 : 500);
      writeJson(response, status, { error: status === 500 ? "Internal server error" : error.message || "Not found" });
    }
  });
  return { server, service };
}

export async function handleApi({ request, response, url, service, env }) {
  let cached = routerCache.get(service);
  if (!cached || cached.env !== env) {
    cached = { env, router: createApiRouter({ service, env }) };
    routerCache.set(service, cached);
  }
  await cached.router.handle({ request, response, url });
}

export async function handleStatic({ response, url, root }) {
  const pathname = url.pathname;
  let requested;
  if (SPA_ROUTES.has(pathname)) requested = "/index.html";
  else if (ROOT_ASSETS[pathname]) requested = ROOT_ASSETS[pathname];
  else if (pathname.startsWith("/src/client/")) requested = pathname;
  else throw Object.assign(new Error("Not found"), { status: 404 });

  const normalized = normalize(requested).replace(/^([/\\])+/, "");
  const rootPath = resolve(root);
  const publicAllowedRoot = requested === "/index.html"
    ? resolve(rootPath, "public")
    : resolve(rootPath, "public", "src", "client");
  const candidates = [
    { filePath: resolve(rootPath, "public", normalized), allowedRoot: publicAllowedRoot },
    ...(requested === "/index.html" ? [{ filePath: resolve(rootPath, normalized), allowedRoot: rootPath }] : []),
  ];
  for (const candidate of candidates) {
    const insideAllowedRoot = candidate.filePath === candidate.allowedRoot
      || candidate.filePath.startsWith(`${candidate.allowedRoot}${sep}`);
    if (!insideAllowedRoot) continue;
    try {
      const body = await readFile(candidate.filePath);
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(candidate.filePath)] || "application/octet-stream",
        "Cache-Control": process.env.DEV_WATCH || extname(candidate.filePath) === ".html" ? "no-cache" : "public, max-age=300",
      });
      response.end(body);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw Object.assign(new Error("Not found"), { status: 404 });
}

function writeJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}
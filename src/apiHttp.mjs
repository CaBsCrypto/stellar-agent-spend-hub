export function normalizeApiPath(url) {
  const rewrittenPilotPath = url.pathname === "/api/pilot"
    ? url.searchParams.get("pilotPath")
    : null;
  const rewrittenRoutePath = url.pathname === "/api/router"
    ? url.searchParams.get("routePath")
    : null;

  if (rewrittenRoutePath && isSafeRewritePath(rewrittenRoutePath)) {
    return `/api/${rewrittenRoutePath.replace(/^\/+|\/+$/g, "")}`;
  }
  if (rewrittenPilotPath && isSafeRewritePath(rewrittenPilotPath)) {
    return `/api/pilot/${rewrittenPilotPath.replace(/^\/+|\/+$/g, "")}`;
  }
  return url.pathname;
}

export function selectRoute(routes, method, pathname) {
  const pathMatches = routes
    .map((route) => ({ route, params: matchRoute(route, pathname) }))
    .filter((candidate) => candidate.params !== null);
  return {
    selected: pathMatches.find((candidate) => candidate.route.method === method) || null,
    allowed: [...new Set(pathMatches.map(({ route }) => route.method))].sort(),
  };
}

export function matchRoute(route, pathname) {
  if (route.path) return route.path === pathname ? {} : null;
  const match = pathname.match(route.pattern);
  if (!match) return null;
  try {
    return Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
  } catch {
    return null;
  }
}

export async function readJson(request) {
  try {
    if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
    if (typeof request.body === "string" && request.body.trim()) return JSON.parse(request.body);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400, cause: error });
  }
}

export function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || "local")
    .split(",")[0]
    .trim();
}

export function toWebRequest(request, url) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value != null) headers.set(name, String(value));
  }
  return new Request(url, { method: request.method || "GET", headers });
}

export async function writeRouteResult(response, result) {
  if (result instanceof Response) {
    await writeWebResponse(response, result);
    return;
  }
  if (response.writableEnded) return;
  writeJson(response, result?.status || 200, result?.body ?? result ?? {});
}

export async function writeWebResponse(response, webResponse) {
  for (const [name, value] of webResponse.headers.entries()) response.setHeader(name, value);
  response.statusCode = webResponse.status;
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

export function writeJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export function normalizeErrorStatus(error) {
  const status = Number(error?.status || 500);
  return status >= 400 && status <= 599 ? status : 500;
}

export function publicErrorMessage(error) {
  if (error?.status) return error.message || "Request failed";
  return error?.publicMessage || "Internal server error";
}

function isSafeRewritePath(pathname) {
  return /^[a-zA-Z0-9/_-]+$/.test(pathname);
}

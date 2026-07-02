export const ROUTES = Object.freeze([
  { path: "/", id: "overview", label: "Agent Home", group: "Agent", loader: () => import("./pages/overview.mjs") },
  { path: "/discover", id: "discover", label: "Discover", group: "Agent", loader: () => import("./pages/discover.mjs") },
  { path: "/spend", id: "spend", label: "Agent Spend", group: "Agent", loader: () => import("./pages/spend.mjs") },
  { path: "/activity", id: "activity", label: "Activity", group: "Agent", loader: () => import("./pages/activity.mjs") },
  { path: "/wallet", id: "wallet", label: "Smart Wallet", group: "Stellar", loader: () => import("./pages/wallet.mjs") },
  { path: "/mpp", id: "mpp", label: "MPP Payments", group: "Stellar", loader: () => import("./pages/mpp.mjs") },
  { path: "/evidence", id: "evidence", label: "Evidence", group: "Trust", loader: () => import("./pages/evidence.mjs") },
  { path: "/security", id: "security", label: "Security", group: "Trust", loader: () => import("./pages/security.mjs") },
  { path: "/providers", id: "providers", label: "For Providers", group: "Builders", loader: () => import("./pages/providers.mjs") },
  { path: "/treasury", id: "treasury", label: "Multichain Lab", group: "Labs", hidden: true, loader: () => import("./pages/treasury.mjs") },
]);

export function resolveRoute(pathname) {
  return ROUTES.find((route) => route.path === normalizePath(pathname)) || null;
}

export function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.split("/").filter(Boolean).join("/")}`;
}

export function createRouter({ onRoute, windowRef = window, documentRef = document } = {}) {
  let controller = null;
  let sequence = 0;

  async function dispatch() {
    controller?.abort();
    controller = new AbortController();
    const requestId = ++sequence;
    const url = new URL(windowRef.location.href);
    const route = resolveRoute(url.pathname);
    await onRoute({ route, url, signal: controller.signal, requestId, isCurrent: () => requestId === sequence });
  }

  function navigate(href, { replace = false } = {}) {
    const next = new URL(href, windowRef.location.origin);
    const current = `${windowRef.location.pathname}${windowRef.location.search}`;
    const target = `${next.pathname}${next.search}`;
    if (current === target) return dispatch();
    windowRef.history[replace ? "replaceState" : "pushState"]({}, "", target);
    return dispatch();
  }

  function onClick(event) {
    const link = event.target.closest?.("a[data-link]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = new URL(link.href, windowRef.location.origin);
    if (target.origin !== windowRef.location.origin) return;
    event.preventDefault();
    navigate(`${target.pathname}${target.search}`);
  }

  const onPopState = () => dispatch();
  documentRef.addEventListener("click", onClick);
  windowRef.addEventListener("popstate", onPopState);

  return {
    start: dispatch,
    navigate,
    refresh: dispatch,
    destroy() {
      controller?.abort();
      documentRef.removeEventListener("click", onClick);
      windowRef.removeEventListener("popstate", onPopState);
    },
  };
}
import { createApiClient } from "./api.mjs";
import { createResourceStore } from "./store.mjs";
import { createRouter } from "./routes.mjs";
import { renderShell, bindShell, showToast } from "./shell.mjs";
import { errorState } from "./components.mjs";

const root = document.querySelector("#app");
const api = createApiClient();
const store = createResourceStore({ api });
let activePage = null;
let activeRouteId = null;
let shellBound = false;

const router = createRouter({
  async onRoute({ route, url, signal, isCurrent }) {
    activePage?.destroy?.();
    activePage = null;

    if (activeRouteId !== route?.id) {
      root.innerHTML = renderShell(route);
      if (!shellBound) {
        bindShell(root);
        shellBound = true;
      }
      activeRouteId = route?.id || "not-found";
    } else {
      updateActiveNavigation(route);
    }

    const outlet = root.querySelector("#page-content");
    outlet.innerHTML = `<div class="route-loading" role="status" aria-label="Loading ${route?.label || "page"}">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton-row">${'<div class="skeleton skeleton-card"></div>'.repeat(4)}</div>
      <div class="skeleton skeleton-block"></div>
    </div>`;

    try {
      const module = route ? await route.loader() : await import("./pages/notFound.mjs");
      const page = module.createPage();
      const context = {
        api,
        store,
        router,
        url,
        route,
        signal,
        showToast: (message) => showToast(root, message),
      };
      const data = await page.load(context);
      if (!isCurrent() || signal.aborted) return;
      outlet.innerHTML = page.render(data, context);
      activePage = page;
      page.bind?.(outlet, data, context);
      outlet.querySelector("h1")?.focus();
      window.scrollTo({ top: 0, behavior: "auto" });
      document.title = `${route?.label || "Not Found"} | Stellar Agent Spend Hub`;
    } catch (error) {
      if (error?.name === "AbortError" || !isCurrent()) return;
      outlet.innerHTML = errorState(error);
      outlet.querySelector("[data-action='retry']")?.addEventListener("click", () => router.refresh());
    }
  },
});

await router.start();

function updateActiveNavigation(route) {
  root.querySelectorAll("nav a[data-link]").forEach((link) => {
    if (link.getAttribute("href") === route?.path) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}
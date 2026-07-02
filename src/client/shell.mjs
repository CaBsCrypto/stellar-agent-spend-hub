import { ROUTES } from "./routes.mjs";
import { escapeHtml } from "./format.mjs";

export function renderShell(activeRoute) {
  const visibleRoutes = ROUTES.filter((route) => !route.hidden);
  const groups = [...new Set(visibleRoutes.map((route) => route.group))];
  return `<div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <a class="brand" href="/" data-link><span class="brand-mark">S</span><span><strong>Stellar Agent</strong><small>Spend Hub</small></span></a>
      <nav aria-label="Primary navigation">
        ${groups.map((group) => `<div class="nav-group"><span>${escapeHtml(group)}</span>${visibleRoutes.filter((route) => route.group === group).map((route) => `<a href="${route.path}" data-link ${activeRoute?.id === route.id ? 'aria-current="page"' : ""}>${escapeHtml(route.label)}</a>`).join("")}</div>`).join("")}
      </nav>
      <div class="sidebar-footer"><span>Stellar testnet | USDC</span><strong>Supervised agent mode</strong></div>
    </aside>
    <div class="app-stage">
      <header class="mobile-bar"><a class="mobile-brand" href="/" data-link>Stellar Agent Spend Hub</a><button class="menu-button" data-shell-action="toggle-menu" aria-controls="sidebar" aria-expanded="false"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><b class="sr-only">Open navigation</b></button></header>
      <main id="page-content" class="page-content" tabindex="-1"></main>
    </div>
    <div class="sidebar-scrim" data-shell-action="close-menu"></div>
    <div id="toast-region" class="toast-region" aria-live="polite"></div>
  </div>`;
}

export function bindShell(root) {
  root.addEventListener("click", (event) => {
    const control = event.target.closest?.("[data-shell-action]");
    if (!control) return;
    const action = control.dataset.shellAction;
    if (action === "toggle-menu") root.querySelector(".app-shell")?.classList.toggle("menu-open");
    if (action === "close-menu") root.querySelector(".app-shell")?.classList.remove("menu-open");
    const menuButton = root.querySelector(".menu-button");
    if (menuButton) menuButton.setAttribute("aria-expanded", String(root.querySelector(".app-shell")?.classList.contains("menu-open")));
  });
  root.addEventListener("click", (event) => {
    if (event.target.closest?.("a[data-link]")) root.querySelector(".app-shell")?.classList.remove("menu-open");
  });
}

export function showToast(root, message) {
  const region = root.querySelector("#toast-region");
  if (!region) return;
  region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { if (region) region.innerHTML = ""; }, 2600);
}
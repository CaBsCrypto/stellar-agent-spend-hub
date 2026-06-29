import { pageHeader } from "../components.mjs";

export function createPage() {
  return {
    async load() { return {}; },
    render() {
      return `<section class="not-found">${pageHeader({ eyebrow: "404", title: "Page not found", summary: "This route is not part of the Stellar Agent Spend Hub." })}<a class="primary-button" href="/" data-link>Return to overview</a></section>`;
    },
    bind() {},
    destroy() {},
  };
}
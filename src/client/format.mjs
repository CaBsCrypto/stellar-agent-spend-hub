export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function money(value, currency = "USDC") {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${escapeHtml(currency)}`;
}

export function shortHash(value, size = 9) {
  const text = String(value || "");
  if (!text) return "Not available";
  return text.length > size * 2 ? `${text.slice(0, size)}...${text.slice(-size)}` : text;
}

export function formatDate(value) {
  if (!value) return "Pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Pending" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function queryValue(url, key, fallback = "") {
  return url.searchParams.get(key) || fallback;
}
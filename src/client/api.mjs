export function createApiClient({ fetchImpl = globalThis.fetch } = {}) {
  return async function api(path, options = {}) {
    const response = await fetchImpl(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const message = typeof payload === "object" && payload?.error
        ? payload.error
        : `Request failed (${response.status})`;
      throw Object.assign(new Error(message), { status: response.status });
    }
    return payload;
  };
}
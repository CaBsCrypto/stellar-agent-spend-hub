export function createResourceStore({ api, now = () => Date.now(), defaultMaxAgeMs = 15_000 } = {}) {
  if (typeof api !== "function") throw new Error("Resource store requires an API client");
  const cache = new Map();
  const inFlight = new Map();

  async function load(key, path, { force = false, signal, maxAgeMs = defaultMaxAgeMs } = {}) {
    const cached = cache.get(key);
    if (!force && cached && now() - cached.loadedAt <= maxAgeMs) return cached.value;
    if (!force && inFlight.has(key)) return withAbort(inFlight.get(key), signal);

    const request = api(path, { signal })
      .then((value) => {
        cache.set(key, { value, loadedAt: now() });
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return withAbort(request, signal);
  }

  function invalidate(...keys) {
    if (keys.length === 0) cache.clear();
    else keys.forEach((key) => cache.delete(key));
  }

  return {
    load,
    invalidate,
    peek: (key) => cache.get(key)?.value,
    clear: () => {
      cache.clear();
      inFlight.clear();
    },
  };
}

function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function abortError() {
  return Object.assign(new Error("Navigation cancelled"), { name: "AbortError" });
}
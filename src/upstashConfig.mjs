export function readUpstashConfig(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || null;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || null;
  return {
    configured: Boolean(url && token),
    url,
    token,
    source: env.UPSTASH_REDIS_REST_URL ? "upstash-direct" : url ? "vercel-marketplace" : "none",
  };
}

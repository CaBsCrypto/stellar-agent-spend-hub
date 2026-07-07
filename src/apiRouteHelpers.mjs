export const exact = (method, path, handler) => ({ method, path, handler });

export const dynamic = (method, pattern, keys, handler) => ({
  method,
  pattern,
  keys,
  handler,
});

export class ProviderDirectoryAdapter {
  constructor({ providers = [] } = {}) {
    this.providers = providers;
  }

  search({ query = "", category } = {}) {
    const terms = query.toLowerCase().split(/\s+/).map((term) => term.replace(/[^a-z0-9-]/g, "")).filter((term) => term.length > 2);
    return this.providers
      .map((provider, index) => ({ provider, index, score: scoreProvider(provider, terms, category) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.provider);
  }

  get(providerId) {
    return this.providers.find((provider) => provider.providerId === providerId) || null;
  }
}

function scoreProvider(provider, terms, category) {
  if (category && provider.category !== category) return 0;
  if (!terms.length) return 1;
  const fields = [provider.name, provider.description, ...(provider.tags || [])].map((value) => String(value || "").toLowerCase());
  const haystack = fields.join(" ");
  let score = 0;
  for (const term of terms) {
    if (fields[0].includes(term)) score += 4;
    if (fields[1].includes(term)) score += 3;
    if ((provider.tags || []).some((tag) => String(tag).toLowerCase().includes(term))) score += 2;
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

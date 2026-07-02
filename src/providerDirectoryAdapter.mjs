export class ProviderDirectoryAdapter {
  constructor({ providers = [] } = {}) {
    this.providers = providers;
  }

  search({ query = "", category } = {}) {
    const terms = query.toLowerCase().split(/\s+/).map((term) => term.replace(/[^a-z0-9-]/g, "")).filter((term) => term.length > 2);
    return this.providers.filter((provider) => {
      const matchesCategory = category ? provider.category === category : true;
      const haystack = `${provider.name} ${provider.description} ${provider.tags.join(" ")}`.toLowerCase();
      const matchesQuery = terms.length === 0 || terms.some((term) => haystack.includes(term));
      return matchesCategory && matchesQuery;
    });
  }

  get(providerId) {
    return this.providers.find((provider) => provider.providerId === providerId) || null;
  }
}
export class ProviderDirectoryAdapter {
  constructor({ providers = [] } = {}) {
    this.providers = providers;
  }

  search({ query = "", category } = {}) {
    const normalized = query.toLowerCase();
    return this.providers.filter((provider) => {
      const matchesCategory = category ? provider.category === category : true;
      const haystack = `${provider.name} ${provider.description} ${provider.tags.join(" ")}`.toLowerCase();
      return matchesCategory && (!normalized || haystack.includes(normalized));
    });
  }

  get(providerId) {
    return this.providers.find((provider) => provider.providerId === providerId) || null;
  }
}
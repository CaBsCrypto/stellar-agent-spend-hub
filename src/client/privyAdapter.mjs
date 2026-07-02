const BASE_SEPOLIA = "0x14a34";
const AVALANCHE_FUJI = "0xa869";

export class PrivyAdapter {
  constructor({
    configLoader = () => fetch("/api/privy/config").then(readJson),
    sdkLoader = () => import("@privy-io/js-sdk-core"),
    onStateChange = () => {},
  } = {}) {
    this.configLoader = configLoader;
    this.sdkLoader = sdkLoader;
    this.onStateChange = onStateChange;
    this.client = null;
    this.user = null;
    this.wallet = null;
    this.provider = null;
    this.iframe = null;
    this.messageListener = null;
    this.status = "loading";
  }

  async initialize() {
    const config = await this.configLoader();
    if (!config.enabled || !config.appId || !config.clientId) {
      this.status = "not-configured";
      this.emit();
      return this.getState();
    }
    const sdk = await this.sdkLoader();
    this.sdk = sdk;
    this.client = new sdk.default({
      appId: config.appId,
      clientId: config.clientId,
      storage: new sdk.LocalStorage(),
    });
    await this.client.initialize();
    this.mountSecureContext();
    const session = await this.client.user.get();
    this.user = session?.user || null;
    if (this.user) await this.connectEmbeddedWallet();
    this.status = this.user ? "connected" : "ready";
    this.emit();
    return this.getState();
  }

  getState() {
    return {
      status: this.status,
      configured: Boolean(this.client),
      authenticated: Boolean(this.user),
      walletAddress: this.wallet?.address || null,
      networks: ["eip155:84532", "eip155:43113"],
      loginMethods: ["email", "google"],
    };
  }

  async sendEmailCode(email) {
    this.requireClient();
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("Enter a valid email address.");
    await this.client.auth.email.sendCode(normalized);
    return { sent: true };
  }

  async loginWithEmail(email, code) {
    this.requireClient();
    const result = await this.client.auth.email.loginWithCode(
      String(email || "").trim().toLowerCase(),
      String(code || "").trim(),
      "login-or-sign-up",
      { embedded: { ethereum: { createOnLogin: "users-without-wallets" } } },
    );
    this.user = result;
    await this.connectEmbeddedWallet({ createIfMissing: true });
    this.status = "connected";
    this.emit();
    return this.getState();
  }

  async loginWithGoogle() {
    this.requireClient();
    const redirect = new URL("/treasury?privy_oauth=1", window.location.origin).toString();
    const result = await this.client.auth.oauth.generateURL("google", redirect);
    window.location.assign(result.url);
  }

  async completeGoogleOAuth({ authorizationCode, stateCode }) {
    this.requireClient();
    if (!authorizationCode || !stateCode) throw new Error("Google OAuth callback is incomplete.");
    const result = await this.client.auth.oauth.loginWithCode(
      authorizationCode,
      stateCode,
      "google",
      "raw",
      "login-or-sign-up",
      { embedded: { ethereum: { createOnLogin: "users-without-wallets" } } },
    );
    this.user = result;
    await this.connectEmbeddedWallet({ createIfMissing: true });
    this.status = "connected";
    this.emit();
    return this.getState();
  }

  async getEvmProvider(network = "eip155:84532") {
    if (!this.provider) await this.connectEmbeddedWallet();
    const chainId = network === "eip155:43113" ? AVALANCHE_FUJI : BASE_SEPOLIA;
    await this.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    return this.provider;
  }

  async getX402Signer() {
    const provider = await this.getEvmProvider("eip155:84532");
    const address = this.wallet.address;
    return {
      address,
      signTypedData: async (typedData) => provider.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(serializeBigInts(typedData))],
      }),
    };
  }

  async sendTransaction(transaction, network = "eip155:84532") {
    const provider = await this.getEvmProvider(network);
    return provider.request({
      method: "eth_sendTransaction",
      params: [{ ...transaction, from: this.wallet.address }],
    });
  }

  async logout() {
    if (this.client && this.user?.id) await this.client.auth.logout({ userId: this.user.id });
    this.user = null;
    this.wallet = null;
    this.provider = null;
    this.status = this.client ? "ready" : "not-configured";
    this.emit();
  }

  destroy() {
    if (this.messageListener) window.removeEventListener("message", this.messageListener);
    this.iframe?.remove();
    this.messageListener = null;
    this.iframe = null;
  }

  async connectEmbeddedWallet({ createIfMissing = false } = {}) {
    this.requireClient();
    let user = this.user;
    let wallet = this.sdk.getUserEmbeddedEthereumWallet(user);
    if (!wallet && createIfMissing) {
      const created = await this.client.embeddedWallet.create({});
      user = created.user || created;
      this.user = user;
      wallet = this.sdk.getUserEmbeddedEthereumWallet(user);
    }
    if (!wallet) throw new Error("Privy embedded EVM wallet is unavailable.");
    const entropy = this.sdk.getEntropyDetailsFromUser(user);
    this.provider = await this.client.embeddedWallet.getEthereumProvider({
      wallet,
      entropyId: entropy.entropyId,
      entropyIdVerifier: entropy.entropyIdVerifier,
    });
    this.wallet = wallet;
  }

  mountSecureContext() {
    if (this.iframe) return;
    const iframe = document.createElement("iframe");
    iframe.src = this.client.embeddedWallet.getURL();
    iframe.hidden = true;
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    iframe.addEventListener("load", () => this.client.setMessagePoster(iframe.contentWindow), { once: true });
    this.messageListener = (event) => {
      if (event.source !== iframe.contentWindow) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        this.client.embeddedWallet.onMessage(data);
      } catch {
        // Ignore unrelated or malformed cross-window messages.
      }
    };
    window.addEventListener("message", this.messageListener);
    this.iframe = iframe;
  }

  requireClient() {
    if (!this.client) throw new Error("Privy is not configured.");
  }

  emit() {
    this.onStateChange(this.getState());
  }
}

export function readOAuthCallback(url = new URL(window.location.href)) {
  if (url.searchParams.get("privy_oauth") !== "1") return null;
  return {
    authorizationCode: url.searchParams.get("authorization_code") || url.searchParams.get("code"),
    stateCode: url.searchParams.get("state_code") || url.searchParams.get("state"),
  };
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function serializeBigInts(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

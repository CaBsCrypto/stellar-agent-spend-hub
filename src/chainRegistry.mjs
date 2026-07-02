import { USDC_SAC_TESTNET } from "@stellar/mpp";

export const NetworkId = Object.freeze({
  stellarTestnet: "stellar:testnet",
  baseSepolia: "eip155:84532",
  avalancheFuji: "eip155:43113",
});

export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const AVALANCHE_FUJI_USDC = "0x5425890298aed601595a70AB815c96711a31Bc65";
export const CCTP_V2_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
export const CCTP_V2_MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

const DEFINITIONS = Object.freeze({
  [NetworkId.stellarTestnet]: Object.freeze({
    network: NetworkId.stellarTestnet,
    family: "stellar",
    chainId: null,
    name: "Stellar Testnet",
    nativeAsset: "XLM",
    explorerBaseUrl: "https://stellar.expert/explorer/testnet",
    asset: Object.freeze({
      symbol: "USDC",
      id: USDC_SAC_TESTNET,
      decimals: 7,
    }),
    capabilities: Object.freeze(["mpp-charge", "mpp-session", "contract-account", "cctp-destination"]),
  }),
  [NetworkId.baseSepolia]: Object.freeze({
    network: NetworkId.baseSepolia,
    family: "evm",
    chainId: 84532,
    name: "Base Sepolia",
    nativeAsset: "ETH",
    explorerBaseUrl: "https://sepolia.basescan.org",
    asset: Object.freeze({
      symbol: "USDC",
      id: BASE_SEPOLIA_USDC,
      decimals: 6,
    }),
    capabilities: Object.freeze(["x402-exact", "privy-wallet", "cctp-source"]),
  }),
  [NetworkId.avalancheFuji]: Object.freeze({
    network: NetworkId.avalancheFuji,
    family: "evm",
    chainId: 43113,
    name: "Avalanche Fuji",
    nativeAsset: "AVAX",
    explorerBaseUrl: "https://testnet.snowtrace.io",
    asset: Object.freeze({
      symbol: "USDC",
      id: AVALANCHE_FUJI_USDC,
      decimals: 6,
    }),
    capabilities: Object.freeze(["privy-wallet", "cctp-source", "dry-run"]),
  }),
});

export function createChainRegistry(env = process.env) {
  return new Map(Object.entries(DEFINITIONS).map(([network, definition]) => [
    network,
    Object.freeze({
      ...definition,
      enabled: network === NetworkId.stellarTestnet
        || (network === NetworkId.baseSepolia && flag(env.MULTICHAIN_ENABLED))
        || (network === NetworkId.avalancheFuji && flag(env.MULTICHAIN_ENABLED)),
      submitEnabled: network === NetworkId.stellarTestnet
        ? false
        : network === NetworkId.baseSepolia
          ? flag(env.BASE_X402_ENABLED)
          : false,
    }),
  ]));
}

export function publicChains(env = process.env) {
  return [...createChainRegistry(env).values()].map((chain) => ({
    network: chain.network,
    family: chain.family,
    chainId: chain.chainId,
    name: chain.name,
    nativeAsset: chain.nativeAsset,
    explorerBaseUrl: chain.explorerBaseUrl,
    asset: { ...chain.asset },
    capabilities: [...chain.capabilities],
    enabled: chain.enabled,
    submitEnabled: chain.submitEnabled,
  }));
}

export function requireChain(network, env = process.env) {
  const chain = createChainRegistry(env).get(String(network || ""));
  if (!chain) throw httpError(400, "Unsupported network");
  return chain;
}

export function explorerTransactionUrl(network, transactionHash, env = process.env) {
  const chain = requireChain(network, env);
  if (!transactionHash) return null;
  return `${chain.explorerBaseUrl}/${chain.family === "stellar" ? "tx/" : "tx/"}${transactionHash}`;
}

function flag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

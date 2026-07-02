import { randomUUID } from "node:crypto";
import { NetworkId, createChainRegistry } from "./chainRegistry.mjs";
import { compareBaseUnits } from "./multichainMoney.mjs";
import { normalizeProviderDefinition } from "./providerDefinitionV2.mjs";

const RAILS = Object.freeze([
  Object.freeze({ id: "stellar-mpp", network: NetworkId.stellarTestnet, protocol: "stellar-mpp", status: "ready", feeRank: 3 }),
  Object.freeze({ id: "stellar-contract-account", network: NetworkId.stellarTestnet, protocol: "stellar-contract-account", status: "ready", feeRank: 2 }),
  Object.freeze({ id: "base-x402", network: NetworkId.baseSepolia, protocol: "x402", status: "guarded", feeRank: 3 }),
  Object.freeze({ id: "avalanche-x402", network: NetworkId.avalancheFuji, protocol: "x402", status: "disabled", feeRank: 2 }),
]);

export class RailRegistry {
  constructor({ env = process.env, now = () => new Date() } = {}) {
    this.env = env;
    this.now = now;
    this.chains = createChainRegistry(env);
  }

  readiness() {
    return RAILS.map((rail) => {
      const chain = this.chains.get(rail.network);
      return {
        ...rail,
        enabled: rail.network === NetworkId.stellarTestnet || chain.enabled,
        submitEnabled: chain.submitEnabled && rail.status !== "disabled",
      };
    });
  }

  quote({ provider, balances = {}, allowedNetworks = Object.values(NetworkId), preferredNetwork = null }) {
    const definition = normalizeProviderDefinition(provider, this.env);
    const candidates = definition.paymentOptions.map((option) => {
      const rail = RAILS.find((item) => item.protocol === option.protocol && item.network === option.network);
      const chain = this.chains.get(option.network);
      const balanceBaseUnits = String(balances[option.network]?.USDC ?? "0");
      const networkAllowed = allowedNetworks.includes(option.network);
      const balanceSufficient = compareBaseUnits(balanceBaseUnits, option.amountBaseUnits) >= 0;
      const executable = Boolean(
        rail
        && chain
        && networkAllowed
        && option.status === "available"
        && rail.status !== "disabled"
        && (option.network === NetworkId.stellarTestnet || (chain.enabled && chain.submitEnabled))
        && balanceSufficient
      );
      const reasons = [];
      if (!rail) reasons.push("No registered rail");
      if (!networkAllowed) reasons.push("Network outside policy allowlist");
      if (option.status !== "available") reasons.push("Provider option disabled");
      if (rail?.status === "disabled") reasons.push("Rail submit is disabled");
      if (option.network !== NetworkId.stellarTestnet && chain && !chain.submitEnabled) {
        reasons.push("Network submit gate is closed");
      }
      if (!balanceSufficient) reasons.push("Insufficient network balance; bridge must be a separate intent");
      const score = executable
        ? 100 + rail.feeRank + (option.network === NetworkId.stellarTestnet ? 2 : 0) + (preferredNetwork === option.network ? 1 : 0)
        : -1;
      return {
        railId: rail?.id || null,
        protocol: option.protocol,
        network: option.network,
        asset: option.asset,
        assetId: option.assetId,
        amount: option.amount,
        amountBaseUnits: option.amountBaseUnits,
        decimals: option.decimals,
        recipient: option.recipient,
        balanceBaseUnits,
        balanceSufficient,
        executable,
        score,
        reasons,
      };
    }).sort(compareCandidates);
    const recommendation = candidates.find((candidate) => candidate.executable) || null;
    const createdAt = this.now();
    return {
      quoteId: randomUUID(),
      providerId: definition.providerId,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 10 * 60 * 1000).toISOString(),
      requiresHumanConfirmation: true,
      recommendation,
      candidates,
      bridgeSuggested: !recommendation && candidates.some((candidate) => !candidate.balanceSufficient),
    };
  }
}

function compareCandidates(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  if (left.network === NetworkId.stellarTestnet && right.network !== NetworkId.stellarTestnet) return -1;
  if (right.network === NetworkId.stellarTestnet && left.network !== NetworkId.stellarTestnet) return 1;
  return left.network.localeCompare(right.network);
}

import { randomBytes } from "node:crypto";
import { hashApiKey } from "../src/pilotAuth.mjs";

const apiKey = `pilot_${randomBytes(32).toString("base64url")}`;
console.log(JSON.stringify({
  apiKey,
  apiKeyHash: hashApiKey(apiKey),
  warning: "Store the raw key locally once. Only MCP_PILOT_API_KEY_HASH belongs in Vercel.",
}, null, 2));

import { context } from "esbuild";
import { watch } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { extname } from "node:path";
import { createSpendHubServer } from "./serve.mjs";

process.env.DEV_WATCH = "1";
const port = Number(process.env.PORT || 4179);

await rm("public", { recursive: true, force: true });
await mkdir("public/src", { recursive: true });
await cp("index.html", "public/index.html");
await cp("src/client", "public/src/client", { recursive: true });

const ctx = await context({
  entryPoints: ["src/client/app.mjs"],
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: "public/src/client",
  entryNames: "app",
  chunkNames: "chunks/[name]-[hash]",
  outExtension: { ".js": ".mjs" },
  platform: "browser",
  target: ["es2022"],
  sourcemap: "inline",
  logLevel: "info",
});
await ctx.watch();

// esbuild rebuilds the JS bundle; CSS and index.html are plain copies.
watch("src/client", { recursive: true }, async (event, file) => {
  if (!file || extname(file) !== ".css") return;
  try {
    await cp(`src/client/${file}`, `public/src/client/${file}`);
    console.log(`[dev-watch] copied ${file}`);
  } catch (error) {
    console.error(`[dev-watch] copy failed for ${file}: ${error.message}`);
  }
});
watch("index.html", async () => {
  try {
    await cp("index.html", "public/index.html");
    console.log("[dev-watch] copied index.html");
  } catch (error) {
    console.error(`[dev-watch] copy failed for index.html: ${error.message}`);
  }
});

const { server } = await createSpendHubServer({ root: process.cwd(), port, env: process.env });
server.listen(port, () => {
  console.log(`Stellar Agent Spend Hub (watch mode) at http://localhost:${port}`);
});

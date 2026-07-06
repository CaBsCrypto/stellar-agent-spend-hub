import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("public", { recursive: true, force: true });
await mkdir("public/src", { recursive: true });
await cp("index.html", "public/index.html");
await cp("src/client", "public/src/client", { recursive: true });
await build({
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
  sourcemap: false,
  minify: true,
  metafile: true,
}).then((result) => {
  const outputs = Object.entries(result.metafile.outputs)
    .filter(([file]) => file.endsWith(".mjs"))
    .sort((a, b) => b[1].bytes - a[1].bytes);
  for (const [file, meta] of outputs) console.log(`${(meta.bytes / 1024).toFixed(1).padStart(8)} KB  ${file}`);
  console.log("Client-only static assets bundled to public/.");
});
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { build } from "esbuild";

await resetPublicDir();
await mkdir("public/src/client/icons", { recursive: true });
await mkdir("public/src/client/styles", { recursive: true });
await copyPath("index.html", "public/index.html");
await copyPath("src/client/styles", "public/src/client/styles");
await copyPath("src/client/icons", "public/src/client/icons");
await copyPath("src/client/manifest.webmanifest", "public/src/client/manifest.webmanifest");
await copyPath("src/client/sw.js", "public/src/client/sw.js");
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
  console.log("Client bundle, styles and PWA assets bundled to public/.");
});


async function resetPublicDir() {
  try {
    await rm("public", { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    if (!["EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error;
    console.warn(`Could not fully remove public (${error.code}); overwriting build assets in place.`);
  }
}


async function copyPath(source, destination) {
  const sourceStat = await stat(source);
  if (sourceStat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyPath(`${source}/${entry.name}`, `${destination}/${entry.name}`);
    }
    return;
  }
  await mkdir(destination.split("/").slice(0, -1).join("/"), { recursive: true });
  await writeFile(destination, await readFile(source));
}

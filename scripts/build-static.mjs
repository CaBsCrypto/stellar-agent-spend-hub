import { cp, mkdir, rm } from "node:fs/promises";

await rm("public", { recursive: true, force: true });
await mkdir("public/src", { recursive: true });
await cp("index.html", "public/index.html");
await cp("src/client", "public/src/client", { recursive: true });
console.log("Client-only static assets copied to public/.");
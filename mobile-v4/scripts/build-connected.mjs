import { build } from "../../node_modules/esbuild/lib/main.js";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "mobile-v4/dist-connected");
await mkdir(out, { recursive: true });
await build({
  entryPoints: [path.join(root, "mobile-v4/staging/main.tsx")],
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  jsx: "automatic",
  outfile: path.join(out, "connected.js"),
  tsconfig: path.join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", "import.meta.env": "{}" },
  alias: {
    react: path.join(root, "mobile-v4/node_modules/react"),
    "react-dom": path.join(root, "mobile-v4/node_modules/react-dom"),
  },
});
await build({
  entryPoints: [path.join(root, "mobile-v4/staging/worker.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  minify: true,
  outfile: path.join(out, "_worker.js"),
  tsconfig: path.join(root, "tsconfig.json"),
  external: ["node:*", "cloudflare:workers"],
  alias: {
    "@tanstack/react-start/server": path.join(root, "mobile-v4/staging/request-context.ts"),
  },
});
await copyFile(path.join(root, "mobile-v4/public/icon-192.png"), path.join(out, "icon-192.png"));
const html = await readFile(path.join(root, "mobile-v4/index.html"), "utf8");
await writeFile(
  path.join(out, "index.html"),
  html
    .replace(/<link rel="manifest"[^>]*>/, "")
    .replace(
      '<script type="module" src="/src/main.tsx"></script>',
      '<link rel="stylesheet" href="/connected.css" /><script type="module" src="/connected.js"></script>',
    ),
);
await writeFile(
  path.join(out, "_headers"),
  "/*\n  X-Robots-Tag: noindex\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n",
);
console.log("Built connected staging shell and authenticated worker (no bundled secrets).");

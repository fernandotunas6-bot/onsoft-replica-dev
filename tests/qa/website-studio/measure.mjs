// Run after a production build. Byte counts are uncompressed assets, not network latency.
import { globSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [manifest] = globSync(".output/server/_tanstack-start-manifest*.mjs");
if (!manifest) throw Error("Build the application before measuring.");
const { tsrStartManifest } = await import(pathToFileURL(process.cwd() + "/" + manifest));
const paths = tsrStartManifest().routes.__root__.preloads ?? [];
const baseline = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8")).__root__
  : null;
const result = {
  metric: "Root route manifest preloads; uncompressed bytes",
  before: baseline ? { files: baseline.files, bytes: baseline.bytes } : null,
  after: {
    files: paths.length,
    bytes: paths.reduce((total, path) => total + statSync(".output/public" + path).size, 0),
  },
  editorChunks: globSync(".output/public/assets/WebsiteStudio-*.js").map((path) => ({
    asset: path.replace(".output/public", ""),
    bytes: statSync(path).size,
    preloadedByRoot: paths.includes(path.replace(".output/public", "")),
  })),
  rootEditorReferences: paths.filter((path) => /WebsiteStudio|puck|tiptap/i.test(path)),
  serverEditorModules: globSync(".output/server/_libs/*")
    .filter((path) => /puckeditor|happy-dom/i.test(path))
    .map((path) => path.replace(".output/server/", "")),
  qaFilesShipped: globSync(".output/public/**/*").filter((path) => /\/tests\/qa\//.test(path)),
  limits:
    "Build evidence only; not authenticated runtime, INP/LCP/CLS p75 or a Cloudflare deployment.",
};
if (
  result.rootEditorReferences.length ||
  result.serverEditorModules.length ||
  result.qaFilesShipped.length ||
  result.editorChunks.some((chunk) => chunk.preloadedByRoot)
)
  throw Error("The editor escaped its client-only route boundary: " + JSON.stringify(result));
writeFileSync(
  "docs/qa/website-studio-2026-10-24/performance.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));

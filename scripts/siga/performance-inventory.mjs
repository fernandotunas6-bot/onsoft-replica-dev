import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Inventário reproduzível: não contacta APIs nem lê dados de escolas.
const root = fileURLToPath(new URL("../../", import.meta.url));
const inventory = JSON.parse(readFileSync(resolve(root, "scripts/siga/modules.json"), "utf8"));
const manifestsDir = resolve(root, "node_modules/.nitro/vite/services/ssr/assets");
const manifests = readdirSync(manifestsDir).filter((name) =>
  /^_tanstack-start-manifest.*\.js$/.test(name),
);
if (manifests.length !== 1) {
  throw new Error("É necessário um build de produção com um único manifesto SSR actual.");
}
const manifestPath = resolve(root, ".output/server", manifests[0].replace(/\.js$/, ".mjs"));
const { tsrStartManifest } = await import(pathToFileURL(manifestPath).href);
const { routes } = tsrStartManifest();
const publicDir = resolve(root, ".output/public");
const assets = new Map();
function asset(href) {
  if (!assets.has(href)) {
    const bytes = readFileSync(resolve(publicDir, `.${href}`));
    assets.set(href, { href, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  return assets.get(href);
}
function budget(paths) {
  const files = [...new Set(paths)].map(asset);
  return {
    files: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    gzipBytes: files.reduce((total, file) => total + file.gzipBytes, 0),
    assets: files,
  };
}
const shell = routes.__root__.preloads ?? [];
const walk = (path) => {
  const info = statSync(path);
  if (!info.isDirectory()) return /\.(ts|tsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => walk(resolve(path, name)));
};
const modules = inventory.modules.map((module) => {
  const paths = [...new Set([...(module.routes ?? []), ...(module.feature ?? [])])];
  const source = paths
    .flatMap((path) => walk(resolve(root, path)))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const match = Object.entries(routes).find(([, route]) =>
    module.routes?.some((path) => resolve(root, path) === route.filePath),
  );
  return {
    id: module.id,
    label: module.label,
    sourceFiles: paths.length,
    queryHooks: (source.match(/\buse(?:Suspense)?Query\(/g) ?? []).length,
    realtimeHandlers: (source.match(/"postgres_changes"/g) ?? []).length,
    dynamicImports: (source.match(/\bimport\(/g) ?? []).length,
    route: match?.[0] ?? null,
    preloadBudget: match ? budget([...shell, ...(match[1].preloads ?? [])]) : null,
  };
});
console.log(
  JSON.stringify(
    {
      kind: "production-preload-and-source-inventory",
      note: "Bytes de artefactos/preloads, não latência nem Web Vitals. Hooks contados nos ficheiros canónicos; não equivalem a pedidos executados.",
      shell: budget(shell),
      modules,
    },
    null,
    2,
  ),
);

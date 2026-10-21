import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const panel = path.join(root, "painel/escolas");
execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: panel, stdio: "inherit" });
const manifest = JSON.parse(
  fs.readFileSync(path.join(panel, "dist/content-manifest.json"), "utf8"),
);
const expected = JSON.parse(
  fs.readFileSync(path.join(root, "src/features/school-website/template.json"), "utf8"),
);
if (manifest.version !== expected.version)
  throw Error(
    "Modelo do website desactualizado. Execute node scripts/siga/sync-school-website-template.mjs e versione o resultado.",
  );
const routes = JSON.parse(fs.readFileSync(path.join(panel, "docs/routes.json"), "utf8"));
const pages = {};
for (const route of routes)
  if (!route.url.startsWith("/portal/") && route.url != "/404/")
    pages[route.url] = fs.readFileSync(path.join(panel, "dist", route.url, "index.html"), "utf8");
fs.writeFileSync(
  path.join(root, "src/features/school-website/site-pages.generated.json"),
  JSON.stringify(pages),
);
const assets = path.join(root, "public/_school-website");
fs.mkdirSync(assets, { recursive: true });
for (const entry of fs.readdirSync(path.join(panel, "dist"), { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name === "assets")
    fs.cpSync(path.join(panel, "dist/assets"), path.join(assets, "assets"), { recursive: true });
  if (
    entry.isFile() &&
    /\.(?:m?js|css|json)$/.test(entry.name) &&
    !["school-runtime.json", "content-manifest.json"].includes(entry.name)
  ) {
    let content = fs.readFileSync(path.join(panel, "dist", entry.name));
    if (entry.name.endsWith(".css"))
      content = Buffer.from(content.toString().replaceAll("/assets/", "/_school-website/assets/"));
    fs.writeFileSync(path.join(assets, entry.name), content);
  }
}
console.log("Website multi-escola: páginas de servidor e recursos preparados.");

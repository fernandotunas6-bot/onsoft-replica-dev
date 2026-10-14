#!/usr/bin/env node
// Publica a demonstração Flutter (dados fictícios, sem servidor) num projecto
// Cloudflare Pages só para revisão visual. Não toca em m.portal-siga.com, no
// Worker do domínio nem no projecto siga-plus-mobile-v4.
//
//   node scripts/publish-demo.mjs [--branch=nome] [--skip-build]
//
// Precisa de CLOUDFLARE_API_TOKEN (permissão Pages: Edit) e
// CLOUDFLARE_ACCOUNT_ID no ambiente. O URL fica impresso no fim:
// https://<branch>.siga-plus-flutter-demo.pages.dev
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = process.env.SIGA_DEMO_PAGES_PROJECT || "siga-plus-flutter-demo";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

// O Pages aceita só [a-z0-9-] no alias do ramo.
const branch = (arg("branch") || git("rev-parse", "--abbrev-ref", "HEAD"))
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 28);

for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"])
  if (!process.env[key]) {
    console.error(`${key} em falta no ambiente.`);
    process.exit(1);
  }

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...options });

if (!process.argv.includes("--skip-build")) {
  run("flutter", ["pub", "get"]);
  run("flutter", [
    "build",
    "web",
    "-t",
    "lib/main_demo.dart",
    "--release",
    "--no-web-resources-cdn",
    "--pwa-strategy=none",
  ]);
}
const out = path.join(root, "build/web");
if (!existsSync(path.join(out, "main.dart.js"))) {
  console.error("build/web sem main.dart.js: compilar primeiro.");
  process.exit(1);
}

const wrangler = ["--yes", "wrangler@4.42.0"];
try {
  // Primeira vez: cria o projecto (Direct Upload). Depois falha por já existir.
  execFileSync(
    "npx",
    [...wrangler, "pages", "project", "create", project, "--production-branch=main"],
    { cwd: root, stdio: "pipe" },
  );
  console.log(`Projecto Pages ${project} criado.`);
} catch {
  // já existe
}
run("npx", [
  ...wrangler,
  "pages",
  "deploy",
  out,
  `--project-name=${project}`,
  `--branch=${branch}`,
  `--commit-hash=${git("rev-parse", "HEAD")}`,
  "--commit-dirty=true",
]);
console.log(`\nPré-visualização: https://${branch}.${project}.pages.dev`);

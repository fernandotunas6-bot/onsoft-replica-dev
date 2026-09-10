#!/usr/bin/env node
/**
 * Deploy Unificado do Ecossistema SIGA Plus para Cloudflare.
 *
 * Orquestra o build e deploy de:
 * 1. DOC    (painel/docs)  → Cloudflare Pages (siga-docs.pages.dev)
 * 2. WEB    (painel/web)   → Cloudflare Pages (siga-web.pages.dev)
 * 3. ADMIN  (painel/admin) → Cloudflare Pages (siga-admin.pages.dev)
 * 4. SIGA   (raiz)         → Cloudflare Workers (portal-siga.com)
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Carregar variáveis de ambiente do .env da raiz
const envFile = path.resolve(root, ".env");
const envVars = {};
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val;
      }
    }
  }
}

const mergedEnv = {
  ...process.env,
  ...envVars,
  VITE_PAYFLOW_URL:
    envVars["VITE_PAYFLOW_URL"] ||
    process.env.VITE_PAYFLOW_URL ||
    "https://payflow.portal-siga.com",
};

function runStep(title, fn) {
  console.log(`\n======================================================`);
  console.log(`🚀 ${title}`);
  console.log(`======================================================\n`);
  const start = Date.now();
  fn();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Concluído em ${elapsed}s`);
}

console.log("=== INICIANDO DEPLOY COMPLETO DO ECOSSISTEMA SIGA PLUS ===");

// 1. DOC (painel/docs)
runStep("Deploy DOC (painel/docs → siga-docs.pages.dev)", () => {
  const docsDir = path.resolve(root, "painel/docs");
  console.log("==> Building DOC (VitePress)...");
  execSync("npm run build", { cwd: docsDir, stdio: "inherit", env: mergedEnv });
  console.log("==> Deploying DOC to Cloudflare Pages...");
  execSync(
    "npx wrangler pages deploy .vitepress/dist --project-name siga-docs --branch main --commit-dirty=true",
    {
      cwd: docsDir,
      stdio: "inherit",
      env: mergedEnv,
    },
  );
});

// 2. WEB (painel/web)
runStep("Deploy WEB (painel/web → siga-web.pages.dev)", () => {
  const webDir = path.resolve(root, "painel/web");
  console.log("==> Building WEB (Vite SPA)...");
  execSync("npm run build", { cwd: webDir, stdio: "inherit", env: mergedEnv });
  console.log("==> Deploying WEB to Cloudflare Pages...");
  execSync("npx wrangler pages deploy dist --project-name siga-web --branch main --commit-dirty=true", {
    cwd: webDir,
    stdio: "inherit",
    env: mergedEnv,
  });
});

// 3. ADMIN (painel/admin)
runStep("Deploy ADMIN (painel/admin → siga-admin.pages.dev)", () => {
  const adminDir = path.resolve(root, "painel/admin");
  console.log("==> Building ADMIN (Next.js Static Export)...");
  execSync("npm run build", { cwd: adminDir, stdio: "inherit", env: mergedEnv });
  console.log("==> Deploying ADMIN to Cloudflare Pages...");
  execSync("npx wrangler pages deploy out --project-name siga-admin --branch main --commit-dirty=true", {
    cwd: adminDir,
    stdio: "inherit",
    env: mergedEnv,
  });
});

// 4. PAYFLOW (painel/payflow)
runStep("Deploy PAYFLOW (painel/payflow → payflow.portal-siga.com)", () => {
  const payflowDir = path.resolve(root, "painel/payflow");
  console.log("==> Building PAYFLOW (vinext)...");
  execSync("npm run build", { cwd: payflowDir, stdio: "inherit", env: mergedEnv });
  console.log("==> Deploying PAYFLOW to Cloudflare Workers...");
  const wranglerDist = path.resolve(payflowDir, "dist/server/wrangler.json");
  if (fs.existsSync(wranglerDist)) {
    const cfg = JSON.parse(fs.readFileSync(wranglerDist, "utf-8"));
    cfg.r2_buckets = [];
    cfg.d1_databases = [];
    fs.writeFileSync(wranglerDist, JSON.stringify(cfg, null, 2), "utf-8");
  }
  execSync("npx wrangler deploy --config wrangler.json", {
    cwd: path.resolve(payflowDir, "dist/server"),
    stdio: "inherit",
    env: mergedEnv,
  });
});

// 5. SIGA (raiz)
runStep("Deploy SIGA Plus (raiz → Cloudflare Workers / portal-siga.com)", () => {
  execSync("node scripts/deploy-cf.mjs", { cwd: root, stdio: "inherit", env: mergedEnv });
});

console.log(`\n======================================================`);
console.log(`🎉 DEPLOY DE TODO O ECOSSISTEMA CONCLUÍDO COM SUCESSO!`);
console.log(`======================================================`);
console.log(`  SIGA PLUS : https://portal-siga.com`);
console.log(`  PAYFLOW   : https://payflow.portal-siga.com`);
console.log(`  WEB       : https://siga-web.pages.dev`);
console.log(`  ADMIN     : https://siga-admin.pages.dev`);
console.log(`  DOCS      : https://siga-docs.pages.dev`);
console.log(`======================================================\n`);

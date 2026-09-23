import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Load .env file
const envFile = path.resolve(".env");
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

function requireEnv(name) {
  const value = envVars[name] || process.env[name];
  if (!value) {
    console.error(
      `==> Missing required env var ${name}. Set it in .env (never commit it) before deploying.`,
    );
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("VITE_SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const CLOUDFLARE_API_TOKEN = requireEnv("CLOUDFLARE_API_TOKEN");
const CLOUDFLARE_ACCOUNT_ID = requireEnv("CLOUDFLARE_ACCOUNT_ID");

console.log("==> Building for Cloudflare (production)...");
const WEB_URL = envVars["VITE_WEB_URL"] || "https://siga-web.pages.dev";
const ADMIN_URL = envVars["VITE_ADMIN_URL"] || "https://siga-admin.pages.dev";
const DOCS_URL = envVars["VITE_DOCS_URL"] || "https://siga-docs.pages.dev";
const SIGA_URL = envVars["VITE_SIGA_URL"] || "https://portal-siga.com";
const PAYFLOW_URL = envVars["VITE_PAYFLOW_URL"] || "https://payflow.portal-siga.com";

execSync("npx vite build --mode production", {
  stdio: "inherit",
  env: {
    ...process.env,
    ...envVars,
    NODE_ENV: "production",
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
    VITE_WEB_URL: WEB_URL,
    VITE_ADMIN_URL: ADMIN_URL,
    VITE_DOCS_URL: DOCS_URL,
    VITE_SIGA_URL: SIGA_URL,
    VITE_PAYFLOW_URL: PAYFLOW_URL,
  },
});

const wranglerPath = path.resolve(".output/server/wrangler.json");
if (fs.existsSync(wranglerPath)) {
  const config = JSON.parse(fs.readFileSync(wranglerPath, "utf-8"));
  config.vars = {
    ...config.vars,
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    // SUPABASE_SERVICE_ROLE_KEY e RESEND_API_KEY NÃO entram aqui. `vars` do
    // Cloudflare são texto simples: aparecem na listagem de bindings de
    // qualquer deploy e no painel, a quem tiver leitura da conta. A chave de
    // serviço do Supabase ignora o RLS por completo — numa base multi-inquilino
    // é acesso total a todas as escolas. Vão por `wrangler secret put`, abaixo.
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
    APP_URL: envVars["APP_URL"] || "https://portal-siga.com",
    APP_NAME: envVars["APP_NAME"] || "SIGA Plus",
    VITE_APP_URL: envVars["VITE_APP_URL"] || "https://portal-siga.com",
    VITE_APP_NAME: envVars["VITE_APP_NAME"] || "SIGA Plus",
    VITE_WEB_URL: WEB_URL,
    VITE_ADMIN_URL: ADMIN_URL,
    VITE_DOCS_URL: DOCS_URL,
    VITE_SIGA_URL: SIGA_URL,
    VITE_PAYFLOW_URL: PAYFLOW_URL,
  };
  fs.writeFileSync(wranglerPath, JSON.stringify(config, null, 2), "utf-8");
  console.log("==> Attached production Supabase & App environment variables to wrangler.json");
}

const cfEnv = { ...process.env, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID };
const workerCwd = path.resolve(".output/server");

/**
 * Segredos por `wrangler secret put`, cifrados e fora da listagem de bindings.
 *
 * O valor vai por stdin e nunca por argumento da linha de comandos: argumentos
 * ficam visíveis na tabela de processos da máquina e no histórico da shell.
 *
 * Os segredos persistem entre deploys, por isso são postos ANTES — assim a
 * versão nova nunca chega a subir sem eles. Num worker que ainda não exista,
 * `wrangler secret put` falha; nesse caso põem-se depois do primeiro deploy.
 */
function porSegredo(nome, valor) {
  execSync(`npx wrangler secret put ${nome} --config wrangler.json`, {
    cwd: workerCwd,
    input: valor,
    stdio: ["pipe", "inherit", "inherit"],
    env: cfEnv,
  });
}

const segredos = [
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY],
  ...(envVars["RESEND_API_KEY"] ? [["RESEND_API_KEY", envVars["RESEND_API_KEY"]]] : []),
];

let segredosPostos = false;
try {
  console.log("==> Setting encrypted secrets on the worker...");
  for (const [nome, valor] of segredos) porSegredo(nome, valor);
  segredosPostos = true;
  console.log(`==> ${segredos.length} secret(s) stored encrypted (not visible as vars)`);
} catch {
  console.log("==> Worker not found yet; secrets will be set after the first deploy.");
}

console.log("==> Deploying to Cloudflare Workers...");
execSync("npx wrangler deploy --config wrangler.json", {
  cwd: workerCwd,
  stdio: "inherit",
  env: cfEnv,
});

if (!segredosPostos) {
  console.log("==> Setting encrypted secrets on the freshly created worker...");
  for (const [nome, valor] of segredos) porSegredo(nome, valor);
  console.log(`==> ${segredos.length} secret(s) stored encrypted (not visible as vars)`);
}
console.log("==> Cloudflare deployment successfully updated!");

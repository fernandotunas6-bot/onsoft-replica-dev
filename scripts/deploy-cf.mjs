import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { collectWorkerSecrets, collectWorkerVars } from "./worker-secrets.mjs";

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
// Obrigatória; vai como segredo (collectWorkerSecrets), nunca em vars.
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const CLOUDFLARE_API_TOKEN = requireEnv("CLOUDFLARE_API_TOKEN");
const CLOUDFLARE_ACCOUNT_ID = requireEnv("CLOUDFLARE_ACCOUNT_ID");

// App móvel em public/mobile/ (m.portal-siga.com), publicada nos assets do mesmo Worker.
console.log("==> Building mobile app (m.portal-siga.com)...");
execSync("node scripts/build-mobile.mjs", {
  stdio: "inherit",
  env: {
    ...process.env,
    ...envVars,
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
  },
});

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
    ...Object.fromEntries(collectWorkerVars(envVars, process.env)),
  };
  // Sem isto, `wrangler deploy` substitui todas as variáveis do Worker pelas deste
  // ficheiro: o que estivesse definido à mão no painel (métodos AppyPay, domínio da
  // plataforma…) desaparecia a cada publicação.
  config.keep_vars = true;
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
 * versão nova nunca chega a subir sem eles.
 *
 * O stderr é capturado em vez de herdado, porque há duas falhas que se têm de
 * distinguir uma da outra e de todas as restantes (ver `classificarFalha`). É
 * reemitido tal e qual, para não se perder nada no terminal.
 */
function porSegredo(nome, valor) {
  try {
    execSync(`npx wrangler secret put ${nome} --config wrangler.json`, {
      cwd: workerCwd,
      input: valor,
      stdio: ["pipe", "inherit", "pipe"],
      env: cfEnv,
    });
  } catch (erro) {
    const stderr = String(erro.stderr ?? "");
    if (stderr) process.stderr.write(stderr);
    erro.stderrTexto = stderr;
    throw erro;
  }
}

/**
 * Duas falhas são esperadas e resolvem-se pondo os segredos DEPOIS do deploy.
 * Qualquer outra — token sem permissão, conta errada, rede — não se engole: um
 * deploy que continua a seguir a uma falha que não percebeu põe no ar uma versão
 * sem as chaves que precisa.
 *
 *  · 10053 «Binding name already in use» — o worker no ar ainda tem o nome como
 *    `var` em texto simples, e o Cloudflare não deixa criar um segredo por cima.
 *    É a transição de `vars` para segredos, uma vez por worker. **O deploy que
 *    se segue tira a `var` e a chave fica em falta até o segredo subir, poucos
 *    segundos depois** — é inevitável num só deploy, e por isso é dito em voz
 *    alta em vez de ficar escondido.
 *  · 10007 / `script_not_found` — o worker ainda não existe. Nasce no deploy.
 */
function classificarFalha(erro) {
  const texto = String(erro.stderrTexto ?? erro.stderr ?? erro.message ?? "");
  if (/10053|already in use/i.test(texto)) return "var-em-texto-simples";
  if (/10007|script_not_found|workers\.api\.error\.script_not_found/i.test(texto))
    return "sem-worker";
  return null;
}

// Todas as chaves sensíveis definidas (lista em worker-secrets.mjs). Os nomes
// aparecem no registo; os valores nunca.
const segredos = collectWorkerSecrets(envVars, process.env);
console.log(`==> Secrets to set: ${segredos.map(([nome]) => nome).join(", ")}`);

let segredosPostos = false;
try {
  console.log("==> Setting encrypted secrets on the worker...");
  for (const [nome, valor] of segredos) porSegredo(nome, valor);
  segredosPostos = true;
  console.log(`==> ${segredos.length} secret(s) stored encrypted (not visible as vars)`);
} catch (erro) {
  const causa = classificarFalha(erro);
  if (causa === null) {
    console.error("==> `wrangler secret put` failed for a reason this script does not");
    console.error("    recognise (see the error above). Refusing to deploy a version that");
    console.error("    would go live without its keys.");
    process.exit(1);
  }
  if (causa === "var-em-texto-simples") {
    console.log("==> A plain-text var still holds this name on the live Worker, so the secret");
    console.log("    cannot be created yet. The deploy below removes the var; the secrets go");
    console.log("    in right after. EXPECT A FEW SECONDS WITH THE KEY ABSENT — this happens");
    console.log("    once per Worker, on the migration from vars to secrets.");
  } else {
    console.log("==> Worker does not exist yet; secrets will be set after the first deploy.");
  }
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

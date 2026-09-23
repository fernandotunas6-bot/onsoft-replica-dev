import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Segredos não podem viajar em `vars` do Cloudflare.
 *
 * `vars` são texto simples: aparecem no painel e na listagem de bindings de
 * qualquer deploy, a quem tiver leitura da conta. `wrangler secret put` guarda
 * cifrado e fora dessa listagem — o runtime lê-os da mesma maneira, por isso a
 * troca não custa nada ao código da aplicação.
 *
 * A diferença importa mais aqui do que na maioria dos sítios:
 * `SUPABASE_SERVICE_ROLE_KEY` **ignora o RLS por completo**. Numa base
 * multi-inquilino como esta, quem a tiver lê e escreve os dados de todas as
 * escolas, não só de uma. Esteve em `vars` até 2026-09-20.
 *
 * O teste lê o script de deploy em vez de correr um deploy: é o script que
 * decide o que vai para onde, e ler é determinístico e não gasta um deploy.
 */

const REPO = resolve(__dirname, "../..");

/** Nomes cujo valor é um segredo, independentemente do serviço. */
const PADRAO_SEGREDO = /SERVICE_ROLE|SECRET|_API_KEY|_TOKEN|PASSWORD|PRIVATE_KEY/i;

/**
 * Chaves públicas por desenho, que podem e devem ir em `vars`: a publishable do
 * Supabase é para o browser, e o URL não é segredo nenhum.
 */
const PUBLICAS = new Set([
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
]);

function blocoDeVars(código: string): string {
  const inicio = código.indexOf("config.vars = {");
  expect(inicio, "`config.vars = {` não encontrado — o script mudou de forma").toBeGreaterThan(-1);
  let profundidade = 0;
  for (let i = código.indexOf("{", inicio); i < código.length; i += 1) {
    if (código[i] === "{") profundidade += 1;
    else if (código[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return código.slice(inicio, i + 1);
    }
  }
  throw new Error("bloco `config.vars` sem fecho");
}

describe("deploy para o Cloudflare", () => {
  const script = readFileSync(resolve(REPO, "scripts/deploy-cf.mjs"), "utf8");

  it("nenhum segredo entra em `vars`, que são texto simples", () => {
    const bloco = blocoDeVars(script);
    // Linhas de comentário não são atribuições — o aviso pode nomear as chaves.
    const linhas = bloco
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"));

    const emTextoSimples = new Set<string>();
    for (const linha of linhas) {
      for (const m of linha.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) {
        const nome = m[1];
        if (PUBLICAS.has(nome)) continue;
        if (PADRAO_SEGREDO.test(nome)) emTextoSimples.add(nome);
      }
    }

    expect(
      [...emTextoSimples],
      `Estes segredos iriam em \`vars\` do Cloudflare, que são texto simples e aparecem na ` +
        `listagem de bindings: ${[...emTextoSimples].join(", ")}. Usar \`wrangler secret put\`. ` +
        `A chave de serviço do Supabase ignora o RLS — expô-la é dar acesso a todas as escolas.`,
    ).toEqual([]);
  });

  it("os segredos são postos por `wrangler secret put`, e por stdin", () => {
    expect(
      script,
      "o script deixou de usar `wrangler secret put` — os segredos ficaram sem destino",
    ).toMatch(/wrangler secret put/);

    // O valor tem de ir por stdin: em argumento ficaria visível na tabela de
    // processos da máquina e no histórico da shell.
    //
    // Procura o COMANDO (`npx wrangler secret put`), não a primeira menção à
    // frase — que aparece no comentário que explica porquê, muito antes.
    const iComando = script.indexOf("npx wrangler secret put");
    expect(iComando, "comando `npx wrangler secret put` não encontrado").toBeGreaterThan(-1);
    expect(
      script.slice(iComando, iComando + 400),
      "o valor do segredo tem de ir por `input:` (stdin), nunca no comando",
    ).toMatch(/input:/);
    expect(
      script,
      "o segredo não pode ser interpolado no comando — ficaria na tabela de processos",
    ).not.toMatch(/wrangler secret put[^\n]*\$\{(?!nome)/);
  });

  it("a chave de serviço continua a ser exigida — o worker precisa dela em runtime", () => {
    // Se alguém a "resolver" apagando-a do deploy, o admin client fica sem chave
    // e todas as leituras privilegiadas passam a falhar em produção.
    expect(script).toMatch(/requireEnv\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  });
});

#!/usr/bin/env node
/**
 * Tipos da base — `npm run siga:gen-types`
 *
 * `src/integrations/supabase/types.ts` foi mantido à mão durante meses: chegou a
 * descrever 76 das 162 tabelas de produção, e as consultas tipadas sobre o resto
 * falhavam na compilação. Regenerá-lo resolveu, mas a saída do `supabase gen
 * types` não diz que é gerada — e um ficheiro de 12 mil linhas sem esse aviso
 * volta a ser editado à mão pela primeira pessoa que precise de uma coluna.
 *
 * Este script gera e carimba. O cabeçalho é o que `tests/security/types-vs-producao`
 * exige, e existe para que a exigência seja satisfeita por construção e não por
 * alguém se lembrar.
 *
 * Requer o CLI do Supabase ligado ao projecto (`supabase link`).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DESTINO = resolve(root, "src/integrations/supabase/types.ts");

export const CABECALHO = `/**
 * Tipos gerados a partir da produção — não editar à mão.
 *
 * Regenerar com \`npm run siga:gen-types\` depois de qualquer migração aplicada.
 * Editar este ficheiro à mão foi como ele passou a descrever menos de metade das
 * tabelas, dando cobertura de tipos a código que falhava em execução.
 */
`;

/** Carimba um conteúdo já gerado, sem duplicar o cabeçalho. */
export function carimbar(conteudo) {
  const semCabecalhoAntigo = conteudo.replace(
    /^\/\*\*[\s\S]*?não editar à mão[\s\S]*?\*\/\n+/,
    "",
  );
  return CABECALHO + "\n" + semCabecalhoAntigo.replace(/^\n+/, "");
}

// Executado directamente (não importado por um teste).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const apenasCarimbar = process.argv.includes("--apenas-carimbar");

  let gerado;
  if (apenasCarimbar) {
    if (!existsSync(DESTINO)) {
      console.error("Não há ficheiro para carimbar. Corra sem --apenas-carimbar.");
      process.exit(1);
    }
    gerado = readFileSync(DESTINO, "utf8");
    console.log("A carimbar o ficheiro existente (sem regenerar)…");
  } else {
    console.log("A gerar a partir do projecto ligado…");
    gerado = execFileSync("npx", ["supabase", "gen", "types", "typescript", "--linked"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  }

  writeFileSync(DESTINO, carimbar(gerado));
  const tabelas = (carimbar(gerado).match(/\n {8}Row: \{/g) ?? []).length;
  console.log(`Escrito: ${DESTINO.replace(root + "/", "")} (${tabelas} tabelas)`);
}

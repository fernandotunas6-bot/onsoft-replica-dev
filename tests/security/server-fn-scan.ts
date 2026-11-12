import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Varredura das `createServerFn` do `src/`. Existe porque a autorização do SIGA
 * vive no código da aplicação: o cliente de servidor fala com a base pela chave
 * de serviço, logo a RLS é defesa da API do Supabase e não o que protege as
 * leituras da app. Quem as protege é o middleware de cada server function — e
 * até agora isso era uma convenção que ninguém verificava.
 *
 * Ver `tests/security/server-fn-guards.test.ts`.
 */

export type ServerFnDeclaration = {
  /** Caminho relativo à raiz do repositório. */
  file: string;
  /** Nome exportado, ou `(anónima)` quando a declaração não tem nome. */
  name: string;
  /** Linha da chamada a `createServerFn`, para a mensagem de erro. */
  line: number;
  /** Middlewares declarados na cadeia, na ordem em que aparecem. */
  middlewares: string[];
};

/**
 * Substitui comentários e literais de texto por espaços do mesmo tamanho. Sem
 * isto, as cinco menções a `createServerFn` em comentários de `format-error.ts`,
 * `platform-guard.ts`, `provisioning-core.ts`, `provisioning-service.ts` e
 * `alunos/$studentId.tsx` contavam como funções sem guarda.
 *
 * Mantém o comprimento do texto para que os números de linha não se desloquem.
 */
export function blankCommentsAndStrings(source: string): string {
  const out = source.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === ch) break;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** Nome da constante a que a `createServerFn` está atribuída, se houver. */
function declaredName(code: string, callIndex: number): string {
  const before = code.slice(Math.max(0, callIndex - 400), callIndex);
  const match = before.match(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*$/);
  return match ? match[1] : "(anónima)";
}

/** Middlewares da cadeia, do `createServerFn` até ao `.handler(` que a fecha. */
function chainMiddlewares(code: string, callIndex: number): string[] {
  const handler = code.indexOf(".handler(", callIndex);
  const chain =
    handler === -1 ? code.slice(callIndex, callIndex + 2000) : code.slice(callIndex, handler);
  return [...chain.matchAll(/\.middleware\(\s*\[([^\]]*)\]/g)]
    .flatMap((m) => m[1].split(","))
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Ficheiros versionados de `src/` que podem declarar server functions. */
export function sourceFiles(): string[] {
  return execSync("git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'", {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

/** Todas as `createServerFn` declaradas em `src/`, guardadas ou não. */
export function scanServerFns(files = sourceFiles()): ServerFnDeclaration[] {
  const found: ServerFnDeclaration[] = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    if (!raw.includes("createServerFn")) continue;
    const code = blankCommentsAndStrings(raw);
    for (const match of code.matchAll(/\bcreateServerFn\s*\(/g)) {
      const at = match.index ?? 0;
      found.push({
        file,
        name: declaredName(code, at),
        line: code.slice(0, at).split("\n").length,
        middlewares: chainMiddlewares(code, at),
      });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

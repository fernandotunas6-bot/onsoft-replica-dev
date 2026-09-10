import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Proíbe o padrão que já produziu dois ciclos infinitos de render.
 *
 * `const { data: linhas = [] } = useQuery(...)` cria um array **novo a cada
 * render** enquanto `data` for `undefined` — o que acontece sempre que a query
 * está desactivada (`enabled: false`), a carregar ou em erro. Se esse valor
 * entrar num array de dependências e o efeito chamar um `setState` com uma
 * estrutura nova, o componente nunca estabiliza:
 *
 *   dependência muda → setState muda de identidade → render → repete
 *
 * Foi assim que a aba Currículo de `/pedagogica` entrava em ciclo mal montava
 * (`teacherAvailability`, com a query desactivada por omissão) e que a
 * `AppSidebar` pendurava o processo ao ser montada num teste (`grants`).
 *
 * A alternativa é `?? EMPTY_LIST` (`src/lib/stable-empty.ts`), que mantém a
 * identidade estável.
 *
 * A regra é deliberadamente estreita: só apanha a desestruturação directa do
 * resultado de uma query. Valores por omissão em props (`function Grafico({
 * data = [] })`) têm a mesma identidade instável, mas só fazem mal se
 * alimentarem dependências de hooks — nos componentes que os usam hoje,
 * nenhum o faz.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !entry.endsWith(".d.ts") ? [full] : [];
  });
}

describe("identidade estável em resultados de query", () => {
  it("nenhum ficheiro desestrutura `data` com [] ou {} por omissão", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        const code = line.trim();
        if (code.startsWith("*") || code.startsWith("//")) return; // comentários
        // `const { data: x = [] } = useQuery({` — a desestruturação com valor
        // por omissão directamente sobre o resultado de uma query.
        const destructuresQueryData = /\{\s*data(\s*:\s*\w+)?\s*=\s*(\[\]|\{\})/.test(code);
        const isQuery = /=\s*use(Suspense)?(Query|Queries|Mutation)\(/.test(code);
        if (destructuresQueryData && isQuery) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${index + 1}  ${code}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("EMPTY_LIST devolve sempre a mesma referência", async () => {
    const { EMPTY_LIST } = await import("@/lib/stable-empty");
    const outra = (await import("@/lib/stable-empty")).EMPTY_LIST;
    expect(EMPTY_LIST).toBe(outra);
    expect(Object.isFrozen(EMPTY_LIST)).toBe(true);
  });
});

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

/**
 * `const { data: x = [] } = useQuery({` — a desestruturação com valor por omissão
 * directamente sobre o resultado de uma query. Extraída para fora do varrimento para o
 * caso de controlo poder exercitá-la sem tocar no disco.
 */
function éInfracção(linha: string): boolean {
  const code = linha.trim();
  if (code.startsWith("*") || code.startsWith("//")) return false; // comentários
  const destructuresQueryData = /\{\s*data(\s*:\s*\w+)?\s*=\s*(\[\]|\{\})/.test(code);
  const isQuery = /=\s*use(Suspense)?(Query|Queries|Mutation)\(/.test(code);
  return destructuresQueryData && isQuery;
}

describe("identidade estável em resultados de query", () => {
  it("inspecciona mesmo a base de código", () => {
    // Sem isto, o teste seguinte passa a verde com zero ficheiros lidos — bastava o
    // caminho mudar ou o varrimento partir-se. Um teste que diz "está limpo" tem de
    // provar que olhou para alguma coisa.
    expect(sourceFiles(SRC).length).toBeGreaterThan(500);
  });

  it("o detector apanha a forma proibida", () => {
    // Controlo: sem ele, `offenders` vazio não distingue "não há" de "não procurei".
    expect(éInfracção("const { data: linhas = [] } = useQuery({ queryKey: [] });")).toBe(true);
    expect(éInfracção("const { data: mapa = {} } = useSuspenseQuery({ queryKey: [] });")).toBe(
      true,
    );
    // E não apanha o que é legítimo, senão a regra deixava de ser usável.
    expect(éInfracção("const { data } = useQuery({ queryKey: [] });")).toBe(false);
    expect(éInfracção("const linhas = query.data ?? EMPTY_LIST;")).toBe(false);
    expect(éInfracção("// const { data: x = [] } = useQuery({")).toBe(false);
  });

  it("nenhum ficheiro desestrutura `data` com [] ou {} por omissão", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (éInfracção(line)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${index + 1}  ${line.trim()}`);
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

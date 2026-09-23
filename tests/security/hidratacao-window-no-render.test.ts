import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * `typeof window` a decidir o que um componente renderiza.
 *
 * O padrão apareceu três vezes nesta base. **Uma** delas foi um defeito a sério, chegou à
 * produção e foi medida lá; as outras duas eram a mesma forma em sítios onde não podia
 * morder. A distinção está aqui escrita de propósito — foi verificada uma a uma, e quem
 * ler isto não deve concluir que qualquer ocorrência é um bug em produção:
 *
 *   · `DesktopTitleBar` — **defeito real.** `!isDesktop && typeof window !== "undefined" &&
 *     !search.includes(…)` devolvia `null` no cliente e renderizava a barra inteira no
 *     servidor. Deu React #418 em `/alterar-senha` (a única rota que rende `AppShell`
 *     deslogado) e em todas as páginas de quem tem sessão. Confirmado por controlo:
 *     revertendo-o o erro volta, com ele desaparece.
 *   · `appearance.tsx` — **não podia morder.** `isDark` lia `matchMedia` no corpo do
 *     provider, mas o estado nasce em `defaults` (`mode: "light"`) e o valor guardado só
 *     entra num `useEffect`: no primeiro render o modo é sempre `"light"` dos dois lados.
 *     Verificado com o `isDark` revertido, `mode: "system"` semeado e o SO em escuro — sem
 *     #418.
 *   · `calendario.ics.tsx` — **código inalcançável.** A rota tem um `server.handlers.GET`
 *     que responde a todos os pedidos (HTML fixo ou o ficheiro ICS), portanto o componente
 *     `CalendarFeedPage` nunca renderiza. Medido: nenhuma das variantes de pedido devolve
 *     o shell da aplicação.
 *
 * As duas últimas ficaram corrigidas na mesma, e é esta regra que as justifica — não um
 * sintoma observado.
 *
 * O padrão é sempre o mesmo, e a intenção é sempre boa: a guarda `typeof window` é posta
 * para não ler `window` no servidor. Só que numa expressão que decide o render, o efeito
 * dela é **inverter o resultado** entre servidor e cliente, que é exactamente o que a
 * hidratação não tolera.
 *
 * A regra: dentro do corpo de um componente, ao nível de topo, não se pergunta por
 * `window` nem por `document`. Lá dentro de um `useEffect` ou de um handler é outra
 * história — esses só correm no cliente, e por isso não são apanhados aqui. Quem precisa
 * do valor no render põe-no em estado e define-o no efeito; servidor e primeiro render do
 * cliente concordam, e o valor certo entra no render seguinte.
 *
 * Porque é que isto não se via em desenvolvimento: nesta montagem o React só o relata no
 * build de produção. Para reproduzir localmente sem o `workerd` (que exige macOS 13.5+),
 * troca-se o preset do nitro para `node-server` — ver o registo de 2026-09-23 em
 * `docs/agents/CONTINUE.md`.
 */

const REPO = resolve(__dirname, "../..");

/** Remove comentários e literais de string, para o detector não se apanhar a si próprio. */
function semComentarios(código: string): string {
  return código
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/**
 * Componentes React do ficheiro, com o corpo delimitado por contagem de chavetas.
 * Inicial maiúscula é o que distingue um componente de um helper qualquer.
 */
function componentesDe(código: string): Array<{ nome: string; corpo: string; início: number }> {
  const definição =
    /(?:export\s+)?(?:function\s+([A-Z][A-Za-z0-9_]*)\s*\(|const\s+([A-Z][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::[^=]*)?=>)/g;
  const encontrados: Array<{ nome: string; corpo: string; início: number }> = [];
  for (const m of código.matchAll(definição)) {
    const nome = m[1] ?? m[2] ?? "";
    const abre = código.indexOf("{", (m.index ?? 0) + m[0].length - 1);
    if (abre === -1) continue;
    let profundidade = 0;
    let fim = abre;
    for (; fim < código.length; fim++) {
      if (código[fim] === "{") profundidade++;
      else if (código[fim] === "}") {
        profundidade--;
        if (profundidade === 0) break;
      }
    }
    encontrados.push({ nome, corpo: código.slice(abre + 1, fim), início: abre + 1 });
  }
  return encontrados;
}

/** `typeof window`/`typeof document` no topo do corpo — fora de efeitos e handlers. */
function perguntasNoRender(): string[] {
  const achados: string[] = [];
  const walk = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const completo = resolve(dir, entrada);
      if (statSync(completo).isDirectory()) {
        walk(completo);
        continue;
      }
      if (!/\.tsx$/.test(entrada)) continue;
      const código = semComentarios(readFileSync(completo, "utf8"));

      for (const componente of componentesDe(código)) {
        let profundidade = 0;
        let deslocamento = 0;
        for (const linha of componente.corpo.split("\n")) {
          if (profundidade === 0 && /typeof\s+(window|document)\s*[!=]==/.test(linha)) {
            const nLinha = código.slice(0, componente.início + deslocamento).split("\n").length;
            achados.push(`${relative(REPO, completo)}:${nLinha} <${componente.nome}>`);
          }
          profundidade += (linha.match(/[{(]/g) ?? []).length - (linha.match(/[})]/g) ?? []).length;
          if (profundidade < 0) profundidade = 0;
          deslocamento += linha.length + 1;
        }
      }
    }
  };
  walk(resolve(REPO, "src"));
  return [...new Set(achados)].sort();
}

describe("hidratação: `window` não decide o render", () => {
  it("encontra componentes suficientes para a verificação valer", () => {
    // Um detector que não inspecciona nada passa a verde e não serve de nada. Este
    // ficheiro já teve três versões erradas do varrimento noutras frentes — o limiar
    // existe para isso não voltar a passar despercebido.
    let componentes = 0;
    const walk = (dir: string) => {
      for (const entrada of readdirSync(dir)) {
        const completo = resolve(dir, entrada);
        if (statSync(completo).isDirectory()) walk(completo);
        else if (/\.tsx$/.test(entrada)) {
          componentes += componentesDe(semComentarios(readFileSync(completo, "utf8"))).length;
        }
      }
    };
    walk(resolve(REPO, "src"));
    expect(componentes).toBeGreaterThan(300);
  });

  it("o detector apanha a forma que já chegou à produção", () => {
    // Controlo: sem isto, "0 achados" não distingue "está limpo" de "não procurei".
    const amostra = `
      export function Exemplo() {
        const [isDesktop, setIsDesktop] = useState(false);
        if (!isDesktop && typeof window !== "undefined" && !window.location.search) {
          return null;
        }
        return <div />;
      }
    `;
    const componentes = componentesDe(semComentarios(amostra));
    expect(componentes).toHaveLength(1);
    expect(componentes[0]!.corpo).toMatch(/typeof\s+window\s*!==/);
  });

  it("nenhum componente pergunta por `window` no corpo de topo", () => {
    const suspeitos = perguntasNoRender();
    expect(
      suspeitos,
      `Estes componentes decidem o render a perguntar por \`window\`/\`document\`: ` +
        `${suspeitos.join("; ")}. No servidor a resposta é sempre "não existe", no ` +
        `cliente é sempre "existe" — a condição inverte-se entre os dois lados e a ` +
        `hidratação falha (React #418), o que deita fora o HTML do servidor e anula o ` +
        `SSR. Ponha o valor em estado e defina-o num \`useEffect\`: assim o servidor e o ` +
        `primeiro render do cliente concordam.`,
    ).toEqual([]);
  });
});

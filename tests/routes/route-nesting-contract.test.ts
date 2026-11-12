import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Uma página dentro de outra (`financeiro.rh.faltas.tsx` dentro de `financeiro.tsx`)
 * só aparece se a página de cima tiver um `<Outlet />`. Sem ele, o endereço abre a
 * página de cima: `/financeiro/rh` mostrava o Caixa, e `/alumni/pipeline` o painel
 * do Alumni. As páginas que não são esquema de outras ficam fora com `_`
 * (`financeiro_.rh_.faltas.tsx`), e o endereço é o mesmo.
 */

const root = resolve(import.meta.dirname, "../..");
const tree = readFileSync(resolve(root, "src/routeTree.gen.ts"), "utf8");

/** `FinanceiroRoute` → `./routes/financeiro` */
const fileOfRoute = new Map(
  [...tree.matchAll(/import \{ Route as (\w+)RouteImport \} from '\.\/routes\/([^']+)'/g)].map(
    ([, name, file]) => [`${name}Route`, file],
  ),
);

/** [filho, pai] para cada rota que não pende da raiz. */
const nested = [
  ...tree.matchAll(
    /const (\w+Route) = \w+RouteImport\.update\(\{[^}]*?getParentRoute: \(\) => (\w+Route),/gs,
  ),
]
  .map(([, child, parent]) => [child, parent] as const)
  .filter(([, parent]) => parent !== "rootRouteImport");

function source(route: string) {
  const file = fileOfRoute.get(route);
  if (!file) throw new Error(`Sem ficheiro para ${route}`);
  for (const ext of [".tsx", ".ts"]) {
    try {
      return readFileSync(resolve(root, "src/routes", `${file}${ext}`), "utf8");
    } catch {
      // tenta a outra extensão
    }
  }
  throw new Error(`Não encontrei src/routes/${file}`);
}

describe("rotas dentro de outras rotas", () => {
  it("lê a árvore gerada", () => {
    expect(fileOfRoute.size).toBeGreaterThan(50);
  });

  it("cada página dentro de outra tem onde aparecer", () => {
    const hidden = nested.filter(([child, parent]) => {
      const parentSource = source(parent);
      const childSource = source(child);
      // Rotas de servidor (`server.handlers`, como `/api/…` e `/calendario/ics`)
      // respondem ao pedido sem desenhar a página de cima.
      if (/\bhandlers\s*:/.test(childSource)) return false;
      if (!/\bcomponent\s*:/.test(parentSource)) return false;
      return !parentSource.includes("<Outlet");
    });
    expect(hidden.map(([child, parent]) => `${child} dentro de ${parent}`)).toEqual([]);
  });

  it("o RH e o Alumni ficam fora das páginas de cima, com o mesmo endereço", () => {
    for (const path of [
      "/financeiro/rh",
      "/financeiro/rh/faltas",
      "/financeiro/rh/folha",
      "/financeiro/rh/pagamentos",
      "/financeiro/rh/presenca",
      "/financeiro/rh/salarios",
      "/alumni/pipeline",
      "/alumni/$alumniId",
      "/alumni/portal/portfolio/print",
    ]) {
      expect(tree, path).toContain(`'${path}': typeof`);
    }
    for (const [child] of nested) {
      expect(child).not.toMatch(/^(FinanceiroRh|Alumni)/);
    }
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREA_LABEL, areaToneForPath, type AreaTone } from "@/lib/area-tone";

/**
 * O `group` do PageHeader é o meio do breadcrumb; o tom vem de `areaToneForPath`.
 * Sendo escrito à mão em cada página, divergia da área que pinta a própria
 * página: Facturas dizia «Relatórios» em verde financeiro, e as cinco páginas
 * de `/financeiro/rh` anunciavam três áreas diferentes entre irmãs.
 */

/**
 * Sub-áreas com nome próprio, além do rótulo da área.
 *
 * `comunicacao` junta Arquivos, Comunicações e as treze páginas de Alumni —
 * que são um produto com nome próprio. Obrigá-las a dizer «Gestão e
 * Comunicação» seria pior do que o problema; o que se corrigiu foi falarem
 * de si por cinco nomes diferentes. Em `sistema`, as páginas da conta de quem
 * usa não são as definições da escola.
 */
const SUBAREAS: Partial<Record<AreaTone, readonly string[]>> = {
  comunicacao: ["Alumni"],
  sistema: ["Conta"],
};

/**
 * Excepções por página, com razão.
 *
 * `/professor/presenca` toma o tom de RH por partilhar o modelo de assiduidade,
 * mas é um ecrã do professor: mudar-lhe o breadcrumb para «Finanças · RH» era
 * dizer ao docente que está no financeiro da escola.
 */
const EXCEPCOES = new Set(["/professor/presenca"]);

function rotulosPermitidos(area: AreaTone): string[] {
  return [AREA_LABEL[area], ...(SUBAREAS[area] ?? [])];
}

function routeFiles(dir: string, prefix = ""): Array<[file: string, source: string]> {
  const out: Array<[string, string]> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("__") || entry.name.startsWith("[")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...routeFiles(full, `${prefix}${entry.name}.`));
    } else if (entry.name.endsWith(".tsx")) {
      out.push([prefix + entry.name, readFileSync(full, "utf8")]);
    }
  }
  return out;
}

/**
 * Nome do ficheiro de rota → caminho, como no encaminhamento por ficheiros.
 *
 * Um segmento com `_` final (`pedagogica_.risco`) sai do layout do pai mas
 * mantém o URL do pai — `/pedagogica/risco`. Deixar lá o underscore fazia a
 * página não corresponder a nenhum prefixo de área e escapar à verificação.
 */
function pathForRouteFile(file: string): string {
  const name = file.replace(/\.tsx$/, "").replace(/\.index$/, "");
  if (name === "index") return "/";
  return `/${name
    .split(".")
    .filter((s) => s && !s.startsWith("_"))
    .map((s) => s.replace(/_$/, ""))
    .join("/")}`;
}

const pages = routeFiles("src/routes")
  .map(([file, source]) => ({
    path: pathForRouteFile(file),
    group: /group="([^"]+)"/.exec(source)?.[1],
  }))
  .filter((p): p is { path: string; group: string } => Boolean(p.group))
  .map((p) => ({ ...p, area: areaToneForPath(p.path) }));

const porVerificar = pages.filter((p) => !EXCEPCOES.has(p.path));

describe("o grupo do cabeçalho concorda com a área da página", () => {
  it("encontra as páginas com grupo declarado", () => {
    expect(porVerificar.length).toBeGreaterThan(40);
  });

  it("não deixa nenhuma página fora de uma área", () => {
    expect(porVerificar.filter((p) => p.area === "marca").map((p) => p.path)).toEqual([]);
  });

  it.each(porVerificar.map((p) => [p.path, p.group, p.area] as const))(
    "%s diz «%s»",
    (_path, group, area) => {
      expect(rotulosPermitidos(area)).toContain(group);
    },
  );
});

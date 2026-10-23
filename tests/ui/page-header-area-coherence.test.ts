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

/** Áreas já normalizadas. Cresce à medida que cada área for limpa. */
const AREAS_LIMPAS = new Set<AreaTone>(["financeiro", "rh"]);

/**
 * Excepções dentro de uma área limpa, com razão.
 *
 * `/professor/presenca` toma o tom de RH por partilhar o modelo de assiduidade,
 * mas é um ecrã do professor: mudar-lhe o breadcrumb para «Finanças · RH» era
 * dizer ao docente que está no financeiro da escola.
 */
const EXCEPCOES = new Set(["/professor/presenca"]);

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

/** Nome do ficheiro de rota → caminho, como no encaminhamento por ficheiros. */
function pathForRouteFile(file: string): string {
  const name = file.replace(/\.tsx$/, "").replace(/\.index$/, "");
  if (name === "index") return "/";
  return `/${name
    .split(".")
    .filter((s) => s && !s.startsWith("_"))
    .join("/")}`;
}

const pages = routeFiles("src/routes")
  .map(([file, source]) => ({
    path: pathForRouteFile(file),
    group: /group="([^"]+)"/.exec(source)?.[1],
  }))
  .filter((p): p is { path: string; group: string } => Boolean(p.group))
  .map((p) => ({ ...p, area: areaToneForPath(p.path) }));

const porVerificar = pages.filter((p) => AREAS_LIMPAS.has(p.area) && !EXCEPCOES.has(p.path));

describe("o grupo do cabeçalho concorda com a área da página", () => {
  it("encontra as páginas financeiras", () => {
    expect(porVerificar.length).toBeGreaterThan(8);
  });

  it.each(porVerificar.map((p) => [p.path, p.group, AREA_LABEL[p.area]]))(
    "%s diz «%s»",
    (_path, group, esperado) => {
      expect(group).toBe(esperado);
    },
  );
});

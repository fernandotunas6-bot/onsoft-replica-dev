import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { paths } from "../src/components/Icon";
import { studentModules, teacherModules } from "../src/components/Academic";
import { serviceCatalog } from "../src/pages/catalog";

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [readFileSync(join(dir, entry.name), "utf8")]
        : [],
  );

it("todos os ícones usados existem: nenhum cai no «?» por engano", () => {
  const used = new Set<string>();
  for (const source of sources("src"))
    for (const m of source.matchAll(/<Icon name="([a-z0-9-]+)"/g)) used.add(m[1]!);
  // Separadores, menus e módulos: ["Etiqueta", "ícone", "destino"].
  // Só os triplos com uma etiqueta visível (maiúscula); listas de ids ficam de fora.
  for (const file of ["src/App.tsx", "src/components/Academic.tsx", "src/pages/catalog.ts"])
    for (const m of readFileSync(file, "utf8").matchAll(
      /\["([^"\n]+)", "([a-z0-9-]+)", "([^"\n]+)"\]/g,
    ))
      if (/[A-ZÀ-Ú]/.test(m[1]! + m[3]!)) used.add(m[2]!);
  for (const role of ["professor", "aluno"] as const)
    for (const [, icon] of serviceCatalog(role)) used.add(icon!);
  ["monitor-smartphone", "sun", "moon"].forEach((name) => used.add(name));
  expect([...used].filter((name) => !paths[name]).sort()).toEqual([]);
});

it("cada serviço do professor e do aluno tem um ícone próprio", () => {
  for (const modules of [teacherModules, studentModules]) {
    const icons = modules.map(([, icon]) => icon);
    const repeated = icons.filter((icon, i) => icons.indexOf(icon) !== i);
    expect(repeated, modules.map(([label]) => label).join(", ")).toEqual([]);
  }
});

it("cada ícone é um SVG de traço sem cor nem scripts embutidos", () => {
  for (const [name, svg] of Object.entries(paths)) {
    expect(svg, name).toMatch(/^<(path|rect|circle)\b/);
    expect(svg, name).not.toMatch(/fill="(?!none)|stroke="#|on[a-z]+=|<script|href=/i);
  }
});

#!/usr/bin/env node
/**
 * Auto-construção de um módulo SIGA (estender, não reescrever).
 * Uso: node scripts/siga/scaffold-module.mjs <id> [--route /caminho] [--with-page]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2).filter((item) => item !== "--");
const id = args.find((item) => !item.startsWith("--"));
const withPage = args.includes("--with-page");
const routeFlag = args.find((item) => item.startsWith("--route="));
const routePath = routeFlag ? routeFlag.slice("--route=".length) : `/${id ?? ""}`;

if (!id || !/^[a-z][a-z0-9-]{1,40}$/.test(id)) {
  console.error("Uso: npm run siga:scaffold -- <id-minusculas> [--route=/caminho] [--with-page]");
  process.exit(1);
}

const pascal = id
  .split("-")
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join("");
const featureDir = resolve(root, "src/features", id);
const testDir = resolve(root, "tests", id);
const created = [];

function writeNew(path, contents) {
  if (existsSync(path)) {
    console.log(`skip  ${path.slice(root.length + 1)}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  created.push(path.slice(root.length + 1));
  console.log(`write ${path.slice(root.length + 1)}`);
}

writeNew(
  resolve(featureDir, "schemas.ts"),
  `import { z } from "zod";

export const list${pascal}InputSchema = z.object({
  query: z.string().trim().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type List${pascal}Input = z.infer<typeof list${pascal}InputSchema>;
`,
);

writeNew(
  resolve(featureDir, "server.ts"),
  `import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import { list${pascal}InputSchema } from "./schemas";

export const list${pascal} = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => list${pascal}InputSchema.parse(input ?? {}))
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    void membership;
    void db;
    void publicDatabaseError;
    return [];
  });
`,
);

writeNew(
  resolve(testDir, "schemas.test.ts"),
  `import { describe, expect, it } from "vitest";
import { list${pascal}InputSchema } from "@/features/${id}/schemas";

describe("${id} schemas", () => {
  it("accepts empty list input", () => {
    expect(list${pascal}InputSchema.parse({}).limit).toBe(50);
  });
});
`,
);

if (withPage) {
  const fileName = routePath.replace(/^\//, "").replaceAll("/", ".") || id;
  writeNew(
    resolve(root, "src/routes", `${fileName}.tsx`),
    `import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";

const filterDefaults = { q: "" };

export const Route = createFileRoute("${routePath}")({
  validateSearch: (search: Record<string, unknown>) => search,
  head: () => ({ meta: [{ title: "${pascal} · SIGA" }] }),
  component: ${pascal}Page,
});

function ${pascal}Page() {
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "${id}",
    filterDefaults,
  );
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader group="SIGA" title="${pascal}" description="Módulo gerado pelo scaffold. Estender, não reescrever." />
        <ListFilterBar
          values={filters}
          activeCount={activeCount}
          onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
          onReset={resetFilters}
          fields={[{ name: "q", placeholder: "Pesquisar…", "aria-label": "Pesquisar" }]}
        />
      </div>
    </AppShell>
  );
}
`,
  );
}

const skillDir = resolve(root, ".cursor/skills", `siga-${id}`);
writeNew(
  resolve(skillDir, "SKILL.md"),
  `---
name: siga-${id}
description: >-
  Extends the SIGA ${id} school-management module. Use when changing
  src/features/${id}, related routes, or when the user mentions ${id}.
---

# SIGA · ${pascal}

1. Ler \`docs/agents/CONTINUE.md\` e o skill \`siga\`.
2. Estender \`src/features/${id}/schemas.ts\` e \`server.ts\` — não reescrever outros módulos.
3. Listas: \`usePersistedListFilters\` + \`ListFilterBar\`.
4. Escrita SGA via \`loadSgaAdminClient\` + \`requireSgaWriter\`.
5. Teste Zod em \`tests/${id}/schemas.test.ts\`.
`,
);

const catalogPath = resolve(root, "scripts/siga/modules.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
if (!catalog.modules.some((mod) => mod.id === id)) {
  catalog.modules.push({
    id,
    skill: `siga-${id}`,
    label: pascal,
    routes: withPage ? [`src/routes/${routePath.replace(/^\//, "").replaceAll("/", ".")}.tsx`] : [],
    feature: [`src/features/${id}/schemas.ts`, `src/features/${id}/server.ts`],
    tests: [`tests/${id}/schemas.test.ts`],
  });
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log("update scripts/siga/modules.json");
}

console.log(
  created.length ? `\nCriados ${created.length} ficheiro(s).` : "\nNada novo — já existia.",
);
console.log(
  "Seguinte: ligar a tabela SGA real no server.ts e adicionar o path em access-policy.ts.",
);

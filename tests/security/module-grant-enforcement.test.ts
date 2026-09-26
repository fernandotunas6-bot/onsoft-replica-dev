import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

let grantLevel: string | null = null;
let grantError: unknown = null;

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: grantLevel ? { level: grantLevel } : null,
          error: grantError,
        }),
      };
      return chain;
    },
  },
}));

import { assertModuleNotBlocked } from "@/integrations/supabase/sga-admin";

describe("permissões por módulo aplicadas no servidor", () => {
  beforeEach(() => {
    grantLevel = null;
    grantError = null;
  });

  it("'Nenhum' bloqueia o módulo", async () => {
    grantLevel = "Nenhum";
    await expect(assertModuleNotBlocked("s", "u", "financeiro")).rejects.toThrow(/Financeiro/);
  });

  it("sem sobreposição, ou com outro nível, não bloqueia", async () => {
    await expect(assertModuleNotBlocked("s", "u", "financeiro")).resolves.toBeUndefined();
    for (const level of ["Leitura", "Escrita", "Total"]) {
      grantLevel = level;
      await expect(assertModuleNotBlocked("s", "u", "pessoas")).resolves.toBeUndefined();
    }
  });

  it("'Leitura' bloqueia escritas mas não leituras", async () => {
    grantLevel = "Leitura";
    await expect(assertModuleNotBlocked("s", "u", "financeiro", "read")).resolves.toBeUndefined();
    await expect(assertModuleNotBlocked("s", "u", "financeiro", "write")).rejects.toThrow(
      /só tem leitura/,
    );
    grantLevel = "Escrita";
    await expect(assertModuleNotBlocked("s", "u", "financeiro", "write")).resolves.toBeUndefined();
  });

  it("tabela por aplicar não bloqueia (igual ao contexto da conta)", async () => {
    grantError = { code: "42P01", message: "relation does not exist" };
    await expect(assertModuleNotBlocked("s", "u", "gestao")).resolves.toBeUndefined();
  });
});

describe("funções dos módulos passam pelo bloqueio", () => {
  const MODULE_DIRS = [
    "finance",
    "students",
    "people",
    "documents",
    "enrollment",
    "alumni",
    "academic",
    "pedagogica",
    "calendar",
    "communications",
    "lesson-plans",
    "ai-assist",
    "school",
    "integrations",
    "catracas",
    "saas",
    "arquivos",
    "import",
  ];
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? files(full) : full.endsWith(".ts") ? [full] : [];
    });

  it("funções POST que alteram dados usam a verificação de escrita", () => {
    const READ =
      /^(list|get(?!OrCreate)|search|fetch|load|preview|export|download|find|count|resolve|check|validate|compute|calc|read|build|lookup|summar|print|analyzeStudentRisk$|diagnoseErrorReport$)/i;
    const offenders: string[] = [];
    for (const file of MODULE_DIRS.flatMap((dir) =>
      files(join(process.cwd(), "src/features", dir)),
    )) {
      const source = readFileSync(file, "utf8");
      const exports = [
        ...source.matchAll(/export const (\w+)\s*=\s*createServerFn\(\{\s*method:\s*"POST"/g),
      ];
      for (const match of exports) {
        const name = match[1]!;
        if (READ.test(name)) continue;
        const start = match.index! + match[0].length;
        const next = source.indexOf("export const", start);
        const body = source.slice(start, next > 0 ? next : undefined);
        if (/\brequireSgaWriterFor\(/.test(body)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nenhuma chama requireSgaWriter directamente (usa requireSgaWriterFor)", () => {
    const offenders = MODULE_DIRS.flatMap((dir) => files(join(process.cwd(), "src/features", dir)))
      .filter((file) => /\brequireSgaWriter\(/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd() + "/", ""));
    expect(offenders).toEqual([]);
  });
});

describe("RH respeita as permissões do módulo Financeiro", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), "src/features/hr", file), "utf8");

  it("cada verificação de papel do RH também consulta a permissão por módulo", () => {
    for (const file of [
      "absences.ts",
      "attendance-assurance.ts",
      "payments.ts",
      "payroll.ts",
      "server.ts",
      "teacher-lesson-exceptions.ts",
      "teacher-lessons.ts",
      "materialize-lessons.ts",
    ]) {
      expect(read(file), file).toMatch(/assertModuleNotBlocked\([^)]*"financeiro"/);
    }
  });

  it("funções que gravam pedem modo escrita", () => {
    const writes: Array<[string, string]> = [
      ["payroll.ts", "approvePayrollRun"],
      ["payroll.ts", "calculatePayrollRun"],
      ["payments.ts", "authorizePayrollPaymentBatch"],
      ["payments.ts", "confirmPayrollPaymentItem"],
      ["absences.ts", "reviewHrAbsence"],
    ];
    for (const [file, fn] of writes) {
      const source = read(file);
      const start = source.indexOf(`export const ${fn} `);
      const next = source.indexOf("export const ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      expect(body, fn).toMatch(/"write"\)/);
    }
  });
});

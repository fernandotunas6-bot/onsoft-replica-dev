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

import { assertModuleNotBlocked, grantElevates } from "@/integrations/supabase/sga-admin";

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
    grantError = { code: "PGRST205", message: "Could not find the table in the schema cache" };
    await expect(assertModuleNotBlocked("s", "u", "gestao")).resolves.toBeUndefined();
  });

  it("outro erro de leitura falha fechado em vez de ignorar o bloqueio", async () => {
    grantError = { code: "57014", message: "canceling statement due to statement timeout" };
    await expect(assertModuleNotBlocked("s", "u", "financeiro")).rejects.toThrow(
      /confirmar as permissões/,
    );
    grantError = { code: "42703", message: 'column "level" does not exist' };
    await expect(assertModuleNotBlocked("s", "u", "financeiro")).rejects.toThrow(
      /confirmar as permissões/,
    );
  });
});

describe("permissão por módulo dá acesso a quem não tem o cargo", () => {
  const secFin = ["Administrador", "Tesouraria"] as const;

  it("'Escrita' ou 'Total' abre leitura e escrita a pessoal", () => {
    for (const level of ["Escrita", "Total"]) {
      expect(grantElevates("Professor", [...secFin], level, "write")).toBe(true);
      expect(grantElevates("Secretaria", [...secFin], level, "read")).toBe(true);
    }
  });

  it("'Leitura' só abre consultas", () => {
    expect(grantElevates("Professor", [...secFin], "Leitura", "read")).toBe(true);
    expect(grantElevates("Professor", [...secFin], "Leitura", "write")).toBe(false);
  });

  it("sem permissão, ou com 'Nenhum', não abre nada", () => {
    expect(grantElevates("Professor", [...secFin], null, "read")).toBe(false);
    expect(grantElevates("Professor", [...secFin], "Nenhum", "read")).toBe(false);
  });

  it("alunos, encarregados e contas sem cargo nunca são elevados", () => {
    for (const role of ["Aluno", "Encarregado", "Utilizador"] as const) {
      expect(grantElevates(role, [...secFin], "Total", "write")).toBe(false);
    }
  });

  it("funções só do Administrador nunca são abertas por permissão", () => {
    expect(grantElevates("Secretaria", ["Administrador"], "Total", "write")).toBe(false);
  });
});

describe("dar permissões só a pessoal da escola", () => {
  it("setStaffModuleGrant confirma a escola e recusa alunos e encarregados", () => {
    const source = readFileSync(join(process.cwd(), "src/features/access/grants.ts"), "utf8");
    expect(source).toMatch(/target\.schoolId !== membership\.schoolId/);
    expect(source).toMatch(/target\.appRole === "Aluno" \|\| target\.appRole === "Encarregado"/);
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

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

  it("nenhuma chama requireSgaWriter directamente (usa requireSgaWriterFor)", () => {
    const offenders = MODULE_DIRS.flatMap((dir) => files(join(process.cwd(), "src/features", dir)))
      .filter((file) => /\brequireSgaWriter\(/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd() + "/", ""));
    expect(offenders).toEqual([]);
  });
});

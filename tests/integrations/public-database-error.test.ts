import { describe, expect, it, vi } from "vitest";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

describe("mensagens de erro da base para o utilizador", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});

  it("diz o que corrigir quando a restrição é conhecida", () => {
    expect(
      publicDatabaseError(
        {
          code: "23505",
          message: 'duplicate key value violates unique constraint "people_school_email_uidx"',
        },
        "x",
      ).message,
    ).toBe("Já existe uma pessoa com este e-mail nesta escola.");
    expect(
      publicDatabaseError(
        {
          code: "23514",
          message: 'new row for relation "people" violates check constraint "people_phone_check"',
        },
        "x",
      ).message,
    ).toMatch(/^Telefone inválido/);
  });

  it("mantém a mensagem genérica para restrições desconhecidas e não revela nomes", () => {
    const error = publicDatabaseError(
      { code: "23505", message: 'violates unique constraint "segredo_interno_idx"' },
      "x",
    );
    expect(error.message).toBe("Já existe um registo com estes dados.");
    expect(error.message).not.toContain("segredo");
  });
});

describe("regras da base escritas para o utilizador", () => {
  it("a lotação da turma e a mudança de ano chegam ao ecrã como estão", () => {
    expect(
      publicDatabaseError(
        { code: "23514", message: "A turma atingiu a capacidade configurada." },
        "x",
      ).message,
    ).toBe("A turma atingiu a capacidade configurada.");
    expect(
      publicDatabaseError(
        {
          code: "22023",
          message: "A turma nova tem de ser da mesma escola e do mesmo ano lectivo da matrícula.",
        },
        "x",
      ).message,
    ).toMatch(/mesmo ano lectivo/);
  });

  it("outras mensagens da base continuam escondidas", () => {
    expect(
      publicDatabaseError({ code: "22023", message: "relation segredo violates x" }, "Falhou.")
        .message,
    ).toBe("Falhou.");
  });
});

describe("mudar de turma", () => {
  it("«Alterar turma» recusa outro ano lectivo antes de gravar", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/features/students/server.ts", "utf8");
    const start = source.indexOf("export const updateEnrollment ");
    const body = source.slice(start, source.indexOf("export const", start + 1));
    expect(body.indexOf("Esta turma é de outro ano lectivo")).toBeGreaterThan(0);
    expect(body.indexOf("Esta turma é de outro ano lectivo")).toBeLessThan(
      body.indexOf(".update(patch)"),
    );
  });
});

describe("telefone gravado", () => {
  it("normaliza angolanos e aceita internacionais com indicativo", async () => {
    const { normalizeStoredPhone } = await import("@/lib/angola-phone");
    expect(normalizeStoredPhone("923 456 789")).toBe("+244923456789");
    expect(normalizeStoredPhone("(+244) 923-456-789")).toBe("+244923456789");
    expect(normalizeStoredPhone("+351 912 345 678")).toBe("+351912345678");
    expect(normalizeStoredPhone("923.45")).toBeNull();
    expect(normalizeStoredPhone("telefone")).toBeNull();
  });
});

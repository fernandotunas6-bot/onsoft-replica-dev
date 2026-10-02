import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/sga-admin", () => ({}));
vi.mock("@/features/auth/server", () => ({}));

const { virtualCardScope, withoutApiKey } = await import("@/features/catracas/server");

const linked = {
  person_id: "p-own",
  student_id: "s-own",
  linked_students: [{ student_id: "s-child" }],
};

describe("cartão virtual: de quem cada conta pode ver o cartão", () => {
  it("secretaria e administração escolhem qualquer aluno da escola", () => {
    expect(virtualCardScope("Secretaria", { studentId: "s-x" }, linked)).toEqual({
      personId: "p-own",
      studentId: "s-x",
    });
  });

  it("o aluno só vê o seu", () => {
    expect(virtualCardScope("Aluno", {}, linked)).toEqual({
      personId: "p-own",
      studentId: "s-own",
    });
    expect(() => virtualCardScope("Aluno", { studentId: "s-x" }, linked)).toThrow();
    expect(() => virtualCardScope("Professor", { personId: "p-x" }, linked)).toThrow();
  });

  it("o encarregado só vê os educandos, e não escolhe a pessoa", () => {
    expect(virtualCardScope("Encarregado", {}, linked)).toEqual({
      personId: null,
      studentId: "s-child",
    });
    expect(() => virtualCardScope("Encarregado", { studentId: "s-x" }, linked)).toThrow();
    expect(() =>
      virtualCardScope("Encarregado", { studentId: "s-child", personId: "p-x" }, linked),
    ).toThrow();
  });
});

describe("catracas: funções da escola inteira só para secretaria e administração", () => {
  const source = readFileSync(join(process.cwd(), "src/features/catracas/server.ts"), "utf8");
  const body = (name: string) => {
    const start = source.indexOf(`export const ${name} `);
    const next = source.indexOf("export const ", start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  };

  for (const name of [
    "validateGatePassToken",
    "listTurnstileDevices",
    "revealTurnstileDeviceApiKey",
    "listAccessCards",
    "listAccessLogs",
    "exportGatePassOfflineList",
    "getCampusVsClassroomReconciliation",
  ]) {
    it(name, () => {
      expect(body(name)).toMatch(
        /requireSgaWriterFor(Write)?\(\s*"gestao",[^;]*\[\s*"Administrador",\s*"Secretaria",?\s*\]/,
      );
    });
  }

  it("a chave completa só sai pela função própria, e com escrita", () => {
    expect(body("revealTurnstileDeviceApiKey")).toMatch(/requireSgaWriterForWrite\(\s*"gestao"/);
    for (const name of [
      "listTurnstileDevices",
      "registerTurnstileDevice",
      "updateTurnstileDevice",
    ]) {
      expect(body(name)).not.toMatch(/\.select\("\*"\)/);
      expect(body(name)).toMatch(/withoutApiKey/);
    }
  });

  it("chaves novas de dispositivo têm 128 bits, não 32", () => {
    expect(source).not.toMatch(/randomUUID\(\)\.slice\(0, 8\)/);
  });
});

describe("catracas: a listagem não leva a chave do dispositivo", () => {
  it("tira a chave e deixa só os últimos 4 caracteres", () => {
    const row = withoutApiKey({ id: "d1", name: "Portão", api_key: "KEY-ABCDEF0123459F3A" });
    expect(row).toEqual({ id: "d1", name: "Portão", has_api_key: true, api_key_hint: "9F3A" });
    expect(JSON.stringify(row)).not.toContain("ABCDEF");
  });

  it("dispositivo sem chave", () => {
    expect(withoutApiKey({ id: "d2", api_key: null })).toEqual({
      id: "d2",
      has_api_key: false,
      api_key_hint: null,
    });
  });
});

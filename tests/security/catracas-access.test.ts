import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/sga-admin", () => ({}));
vi.mock("@/features/auth/server", () => ({}));

const { virtualCardScope } = await import("@/features/catracas/server");

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

  it("chaves novas de dispositivo têm 128 bits, não 32", () => {
    expect(source).not.toMatch(/randomUUID\(\)\.slice\(0, 8\)/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/people/server.ts", "utf8");
// A fusão: a função do servidor e, até a migração 20261010110000 ser aplicada, os
// passos soltos (mergePeopleInSteps). A transacção está em tests/sql/merge-people.mjs.
const merge = source.slice(
  source.indexOf("export const mergePeople"),
  source.indexOf("export const listStaffDirectory"),
);
const duplicates = source.slice(
  source.indexOf("export const findPersonDuplicates"),
  source.indexOf("export const getPerson"),
);

describe("fusão de fichas de pessoas", () => {
  it("corre numa transacção quando a base tem a função, e só então nos passos soltos", () => {
    expect(merge).toContain('"siga_merge_people" as never');
    expect(merge).toContain("p_actor: context.userId");
    expect(merge).toMatch(/if \(rpcError && !isMissingFunction\(rpcError\)\)/);
  });

  it("exige 2FA e recusa duas contas de acesso diferentes", () => {
    expect(merge).toContain('requireAal2(context.claims, "Fundir fichas de pessoas")');
    expect(merge).toContain("survivor.user_id !== duplicate.user_id");
  });

  it("os educandos do duplicado passam para a ficha que fica", () => {
    expect(merge).toContain('.from("student_guardians")');
    expect(merge).toContain(".update({ guardian_person_id: input.survivorId })");
  });

  it("documentos, cartões, RH e papéis acompanham a fusão", () => {
    for (const table of [
      "person_documents",
      "siga_access_cards",
      "hr_employments",
      "person_roles",
    ]) {
      expect(merge).toContain(`.from("${table}")`);
    }
  });

  it("a conta de acesso sai do duplicado antes de entrar na ficha que fica", () => {
    expect(merge).toContain('if (moveLogin) duplicateClear["user_id"] = null;');
    expect(merge).toContain('survivorPatch["user_id"] = duplicate.user_id');
  });

  it("fica registada na auditoria com o motivo", () => {
    expect(merge).toContain('action: "people.merged"');
    expect(merge).toContain("reason: input.reason");
    expect(merge).toContain("p_reason: data.reason");
  });
});

describe("detecção de duplicados", () => {
  it("procura por critério em toda a escola, não numa amostra de 250", () => {
    expect(duplicates).not.toContain(".limit(250)");
    expect(duplicates).toContain('.ilike("full_name"');
    expect(duplicates).toContain('.ilike("national_id"');
  });
});

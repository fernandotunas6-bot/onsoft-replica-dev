import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canSeeRow } from "@/features/arquivos/server";
import { canReadFileArea, canWriteFileArea } from "@/features/arquivos/kinds";
import { fileAreaOptions, fileVisibilityOptions } from "@/features/arquivos/schemas";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";

const migration = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260924072000_siga_files_rls_visibility.sql"),
  "utf8",
);

/** Só as linhas de SQL que correm — os comentários explicam decisões, não são código. */
function semComentarios(trecho: string) {
  return trecho
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** O corpo da função que resolve o papel — onde a escolha de facto se faz. */
const corpoSgaFileRole = semComentarios(
  migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION private.sga_file_role"),
    migration.indexOf("REVOKE ALL ON FUNCTION private.sga_file_role"),
  ),
);

const DONO = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";
const PAPEIS = ["Administrador", "Secretaria", "Tesouraria", "Professor", "Aluno", "Utilizador"];

function ficheiro(over: Partial<SchoolFileRecord>): SchoolFileRecord {
  return {
    area: "escola",
    visibility: "school",
    ownerUserId: DONO,
    ...over,
  } as SchoolFileRecord;
}

describe("siga_files — a regra de visibilidade", () => {
  // Estas asserções fixam a semântica antes de alguém lhe tocar: a política SQL
  // foi escrita a partir delas.
  it("a área pessoal é só do dono, seja qual for o papel", () => {
    for (const role of PAPEIS) {
      expect(canSeeRow(ficheiro({ area: "pessoal", ownerUserId: OUTRO }), DONO, role)).toBe(false);
    }
    expect(canSeeRow(ficheiro({ area: "pessoal" }), DONO, "Professor")).toBe(true);
  });

  it("a área da secretaria é só de quem lá trabalha", () => {
    const f = ficheiro({ area: "secretaria" });
    expect(canSeeRow(f, DONO, "Administrador")).toBe(true);
    expect(canSeeRow(f, DONO, "Secretaria")).toBe(true);
    expect(canSeeRow(f, OUTRO, "Tesouraria")).toBe(false);
    expect(canSeeRow(f, OUTRO, "Professor")).toBe(false);
  });

  it("um ficheiro privado de outra pessoa só se abre à administração", () => {
    const privado = ficheiro({ visibility: "private", ownerUserId: OUTRO, area: "escola" });
    expect(canSeeRow(privado, DONO, "Administrador")).toBe(true);
    expect(canSeeRow(privado, DONO, "Secretaria")).toBe(false);
    expect(canSeeRow(privado, DONO, "Tesouraria")).toBe(false);
    expect(canSeeRow(privado, DONO, "Professor")).toBe(false);

    // Excepção: a secretaria vê o privado dentro da própria área.
    const privadoSecretaria = ficheiro({
      visibility: "private",
      ownerUserId: OUTRO,
      area: "secretaria",
    });
    expect(canSeeRow(privadoSecretaria, DONO, "Secretaria")).toBe(true);
  });

  it("alunos, encarregados e utilizadores sem papel não vêem nada", () => {
    for (const area of fileAreaOptions) {
      for (const visibility of fileVisibilityOptions) {
        const f = ficheiro({ area, visibility, ownerUserId: DONO });
        expect(canSeeRow(f, DONO, "Aluno")).toBe(false);
        expect(canSeeRow(f, DONO, "Utilizador")).toBe(false);
      }
    }
  });
});

describe("siga_files — a política SQL diz o mesmo que o código", () => {
  it("a política de leitura usa as três colunas que faltavam", () => {
    // O defeito era exactamente este: nenhuma delas entrava na RLS.
    const leitura = migration.slice(
      migration.indexOf("CREATE POLICY siga_files_select_scoped"),
      migration.indexOf("CREATE OR REPLACE FUNCTION private.sga_file_can_write_area"),
    );
    expect(leitura).toContain("area");
    expect(leitura).toContain("visibility <> 'private'");
    expect(leitura).toContain("owner_user_id = (SELECT auth.uid())");
  });

  it("substitui as duas políticas antigas em vez de se juntar a elas", () => {
    // Políticas permissivas combinam-se com OR: deixar a antiga anularia esta.
    expect(migration).toContain('DROP POLICY IF EXISTS "Read school files"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Write school files"');
  });

  it("não deixa nenhuma política `FOR ALL`", () => {
    // A antiga era `ALL`, o que dava apagamento a quem só devia editar.
    const politicas = migration.match(/CREATE POLICY[\s\S]*?FOR (\w+)/g) ?? [];
    expect(politicas.length).toBeGreaterThan(0);
    for (const p of politicas) expect(p).not.toMatch(/FOR ALL/);
  });

  it("o mapa de papéis cobre todos os códigos RBAC que a aplicação mapeia", () => {
    // `mapAppRoleToSgaCodes` em src/integrations/supabase/sga.ts:33-50.
    const codigos = [
      ["owner", "Administrador"], ["admin", "Administrador"], ["administrador", "Administrador"],
      ["secretary", "Secretaria"], ["secretaria", "Secretaria"],
      ["treasury", "Tesouraria"], ["tesouraria", "Tesouraria"], ["finance", "Tesouraria"],
      ["teacher", "Professor"], ["professor", "Professor"],
      ["guardian", "Encarregado"], ["encarregado", "Encarregado"], ["parent", "Encarregado"],
      ["student", "Aluno"], ["aluno", "Aluno"],
    ];
    for (const [code, papel] of codigos) {
      expect(migration).toMatch(new RegExp(`WHEN '${code}'\\s+THEN '${papel}'`));
    }
  });

  it("a escrita por área repete `canWriteFileArea` sem a mudar", () => {
    const helper = migration.slice(
      migration.indexOf("FUNCTION private.sga_file_can_write_area"),
      migration.indexOf("REVOKE ALL ON FUNCTION private.sga_file_can_write_area"),
    );
    // pessoal → os quatro papéis de pessoal; as outras três → só administração.
    for (const papel of ["Administrador", "Secretaria", "Tesouraria", "Professor"]) {
      expect(canWriteFileArea(papel, "pessoal")).toBe(true);
      expect(helper).toContain(papel);
    }
    expect(canWriteFileArea("Tesouraria", "escola")).toBe(false);
    expect(canWriteFileArea("Professor", "secretaria")).toBe(false);
    expect(helper).toContain("WHEN p_area IN ('secretaria', 'escola', 'publico')");
  });

  it("não constrói sobre `current_profile_role`, que ignora a escola", () => {
    // Essa função escolhe a inscrição mais antiga de todas as escolas do
    // utilizador — devolve o papel errado a quem pertence a duas.
    expect(corpoSgaFileRole).not.toContain("current_profile_role()");
    expect(corpoSgaFileRole).not.toContain("current_school_role_is");
    // A escola entra na consulta: é isso que as funções do esquema `public` não fazem.
    expect(corpoSgaFileRole).toContain("AND sm.school_id = p_school_id");
  });

  it("a área da secretaria continua a ser a excepção na leitura", () => {
    expect(canReadFileArea("Tesouraria", "secretaria")).toBe(false);
    expect(canReadFileArea("Tesouraria", "escola")).toBe(true);
    expect(migration).toContain("WHEN area = 'secretaria'");
  });
});

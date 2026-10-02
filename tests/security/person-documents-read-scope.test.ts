/**
 * Achado (docs/auditoria/07-auditoria.md, 7.5): `person_documents` guarda números de BI e
 * passaporte. A escrita já tinha sido fechada (20260924140000); a leitura ficava larga --
 * "Read school person documents" com `USING (is_school_member(school_id))`, sem olhar ao
 * papel -- qualquer membro activo da escola, incluindo Aluno ou Encarregado, lia o
 * documento de identidade de qualquer pessoa.
 *
 * Decisão de produto: leitura restrita a Administrador/Secretaria
 * (`can_manage_students()`, hoje `is_school_office(school_id)` -- o mesmo conjunto por
 * escola, sem "diretor geral" nem "coordenação pedagógica"), não `can_read_students()` (que também inclui Professor) --
 * BI e passaporte são dados de matrícula, não pedagógicos. Migração
 * 20260924160000, testada contra produção em transacção revertida (administrador
 * continua a ver, professor deixa de ver) antes de aplicar.
 *
 * Este teste garante que só existe UMA política de SELECT e que exige
 * can_manage_students() -- se alguém reabrir a leitura larga ao lado desta (o mesmo erro
 * que a área 5 já mostrou: políticas permissivas combinam-se por OR e a larga vence),
 * falha aqui.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const snap = JSON.parse(
  readFileSync(resolve(process.cwd(), "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as {
  politicas: Array<{
    tabela: string;
    politica: string;
    cmd: string;
    usando: string;
    verificando: string;
  }>;
};

describe("leitura de person_documents restrita a quem gere matrículas", () => {
  it("existe exactamente uma política de SELECT em person_documents", () => {
    const selects = snap.politicas.filter(
      (p) => p.tabela === "person_documents" && p.cmd === "SELECT",
    );
    expect(
      selects.map((p) => p.politica),
      "mais de uma política de SELECT combina-se por OR -- a mais larga vence, tal como aconteceu na área 5",
    ).toHaveLength(1);
  });

  it("a política de SELECT exige um papel de gestão, não apenas is_school_member()", () => {
    const select = snap.politicas.find(
      (p) => p.tabela === "person_documents" && p.cmd === "SELECT",
    );
    expect(select).toBeDefined();
    // `is_school_office(school_id)` (owner/admin/administrador/secretary/secretaria, por escola)
    // é o guarda em produção desde a 28/09; `can_manage_students()` era o da migração original.
    expect(select?.usando).toMatch(/can_manage_students\(\)|is_school_office\(school_id\)/);
  });

  it("nenhuma política de person_documents usa is_school_member() sozinho", () => {
    const largas = snap.politicas.filter(
      (p) =>
        p.tabela === "person_documents" &&
        /is_school_member\(school_id\)$/.test((p.usando || p.verificando || "").trim()),
    );
    expect(
      largas.map((p) => p.politica),
      "política com is_school_member() como única condição -- qualquer membro da escola passa",
    ).toEqual([]);
  });
});

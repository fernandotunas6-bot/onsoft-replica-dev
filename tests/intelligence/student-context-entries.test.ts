import { describe, expect, it } from "vitest";
import { applicationRoles } from "@/features/auth/access-policy";
import {
  contextEntryLink,
  findActiveContextEntry,
  getContextEntries,
  type ContextNavEntry,
} from "@/features/intelligence/context-registry";
import { STUDENT_CONTEXT_ENTRIES } from "@/features/intelligence/student-context-entries";
import type { ContextFrame, ResolvedContext } from "@/features/intelligence/types";
import { moduleIcons } from "@/lib/app-icons";

const ANA = "22222222-2222-4222-8222-222222222222";
const studentFrame: ContextFrame = { type: "student", id: ANA, label: "Ana Silva" };
const classFrame: ContextFrame = {
  type: "class",
  id: "11111111-1111-4111-8111-111111111111",
  label: "Turma A",
};

function context(role: string, trail: ContextFrame[], grants = {}): ResolvedContext {
  return {
    userId: "u",
    role,
    grants,
    pathname: `/alunos/${ANA}`,
    focusedEntity: null,
    schoolId: "school-a",
    academicYearId: null,
    trail,
    activeView: null,
    key: "k",
  };
}

const ids = (entries: ContextNavEntry[]) => entries.map((entry) => entry.id);

describe("entradas do contexto Aluno", () => {
  it("a Secretaria vê a ficha completa e as cinco secções, pela ordem", () => {
    expect(
      ids(getContextEntries(context("Secretaria", [studentFrame]), STUDENT_CONTEXT_ENTRIES)),
    ).toEqual([
      "student.overview",
      "student.identificacao",
      "student.academico",
      "student.financeiro",
      "student.documentos",
      "student.historico",
    ]);
  });

  it("com a turma da matrícula, a secretaria passa à turma, aos trabalhos e ao horário dela", () => {
    const TURMA = "11111111-1111-4111-8111-111111111111";
    const withClass: ContextFrame = { ...studentFrame, relations: { class: TURMA } };
    const ctx = context("Secretaria", [withClass]);
    const entries = getContextEntries(ctx, STUDENT_CONTEXT_ENTRIES);
    const links = entries
      .filter((entry) => entry.group === "Turma do aluno")
      .map((entry) => contextEntryLink(entry, ctx));
    expect(links).toEqual([
      { to: `/pedagogica/turmas/${TURMA}`, search: {} },
      { to: "/pedagogica/trabalhos", search: { turma: TURMA } },
      { to: "/pedagogica", search: { tab: "horarios", turma: TURMA } },
    ]);
    // Sem turma na matrícula, nada; e só a secretaria e a direcção.
    expect(
      ids(getContextEntries(context("Secretaria", [studentFrame]), STUDENT_CONTEXT_ENTRIES)),
    ).not.toContain("student.class");
    for (const role of ["Professor", "Encarregado", "Aluno", "Tesouraria"]) {
      expect(
        ids(getContextEntries(context(role, [withClass]), STUDENT_CONTEXT_ENTRIES)),
      ).not.toContain("student.class");
    }
  });

  it("o encarregado não vê o financeiro nem os documentos", () => {
    expect(
      ids(getContextEntries(context("Encarregado", [studentFrame]), STUDENT_CONTEXT_ENTRIES)),
    ).toEqual(["student.overview", "student.identificacao", "student.academico"]);
  });

  it("nenhuma entrada aparece a quem não pode abrir a ficha", () => {
    for (const role of applicationRoles) {
      const entries = getContextEntries(context(role, [studentFrame]), STUDENT_CONTEXT_ENTRIES);
      if (!["Administrador", "Secretaria", "Encarregado"].includes(role)) {
        expect(entries, role).toEqual([]);
      }
    }
  });

  it("não aparecem noutro contexto", () => {
    expect(getContextEntries(context("Secretaria", [classFrame]), STUDENT_CONTEXT_ENTRIES)).toEqual(
      [],
    );
  });

  it("cada secção leva à ficha do próprio aluno, com a secção na URL", () => {
    const ctx = context("Secretaria", [studentFrame]);
    const links = getContextEntries(ctx, STUDENT_CONTEXT_ENTRIES).map((entry) =>
      contextEntryLink(entry, ctx),
    );
    expect(links).toEqual([
      { to: `/alunos/${ANA}`, search: {} },
      { to: `/alunos/${ANA}`, search: { secao: "identificacao" } },
      { to: `/alunos/${ANA}`, search: { secao: "academico" } },
      { to: `/alunos/${ANA}`, search: { secao: "financeiro" } },
      { to: `/alunos/${ANA}`, search: { secao: "documentos" } },
      { to: `/alunos/${ANA}`, search: { secao: "historico" } },
    ]);
  });

  it("marca a secção aberta, e a ficha completa quando não há secção", () => {
    const ctx = context("Secretaria", [studentFrame]);
    const entries = getContextEntries(ctx, STUDENT_CONTEXT_ENTRIES);
    const path = `/alunos/${ANA}`;
    expect(findActiveContextEntry(entries, ctx, path, {})).toBe("student.overview");
    expect(findActiveContextEntry(entries, ctx, path, { secao: "financeiro" })).toBe(
      "student.financeiro",
    );
    expect(findActiveContextEntry(entries, ctx, "/alunos/outro", {})).toBeNull();
  });

  it("uma secção recusada deixa activa a ficha completa, que é o que a página mostra", () => {
    const ctx = context("Encarregado", [studentFrame]);
    const entries = getContextEntries(ctx, STUDENT_CONTEXT_ENTRIES);
    expect(findActiveContextEntry(entries, ctx, `/alunos/${ANA}`, { secao: "financeiro" })).toBe(
      "student.overview",
    );
  });
});

describe("allow no registo", () => {
  const entry: ContextNavEntry = {
    id: "x",
    label: "X",
    icon: moduleIcons.finance,
    group: "G",
    contexts: ["student"],
    to: "/alunos/$studentId",
    module: "pessoas",
    order: 0,
  };

  it("estreita a entrada", () => {
    const ctx = context("Secretaria", [studentFrame]);
    expect(getContextEntries(ctx, [{ ...entry, allow: () => false }])).toEqual([]);
  });

  it("nunca a alarga: a rota continua a decidir", () => {
    const ctx = context("Tesouraria", [studentFrame]);
    expect(getContextEntries(ctx, [{ ...entry, allow: () => true }])).toEqual([]);
  });
});

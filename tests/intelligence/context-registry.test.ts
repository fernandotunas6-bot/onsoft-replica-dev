import { describe, expect, it } from "vitest";
import { applicationRoles } from "@/features/auth/access-policy";
import {
  ACADEMIC_CONTEXT_ENTRIES,
  academicIdsFromTrail,
} from "@/features/intelligence/academic-context-entries";
import {
  contextBreadcrumb,
  contextEntryLink,
  findActiveContextEntry,
  getContextEntries,
  withActiveView,
} from "@/features/intelligence/context-registry";
import { subjectOfferingId } from "@/features/intelligence/context-resolver";
import type { ContextFrame, ResolvedContext } from "@/features/intelligence/types";

const TURMA_A = "11111111-1111-4111-8111-111111111111";
const MATEMATICA = "33333333-3333-4333-8333-333333333333";

const classFrame: ContextFrame = { type: "class", id: TURMA_A, label: "Turma A" };
const subjectFrame: ContextFrame = {
  type: "subject-offering",
  id: subjectOfferingId(TURMA_A, MATEMATICA),
  label: "Matemática",
};

function context(role: string, trail: ContextFrame[], grants = {}): ResolvedContext {
  return {
    userId: "u",
    role,
    grants,
    pathname: "/pedagogica",
    focusedEntity: null,
    schoolId: "school-a",
    academicYearId: null,
    trail,
    activeView: null,
    key: "k",
  };
}

describe("getContextEntries", () => {
  it("mostra ao professor as entradas da disciplina, pela ordem declarada", () => {
    const entries = getContextEntries(
      context("Professor", [classFrame, subjectFrame]),
      ACADEMIC_CONTEXT_ENTRIES,
    );
    expect(entries.map((e) => e.id)).toEqual([
      "subject.grades",
      "academic.attendance",
      "academic.lesson-plans",
    ]);
  });

  it("separa as entradas da turma das da disciplina", () => {
    const entries = getContextEntries(context("Professor", [classFrame]), ACADEMIC_CONTEXT_ENTRIES);
    expect(entries.map((e) => e.id)).toEqual([
      "class.grades",
      "academic.attendance",
      "academic.lesson-plans",
    ]);
  });

  it("não mostra nada sem contexto de entidade", () => {
    expect(getContextEntries(context("Administrador", []), ACADEMIC_CONTEXT_ENTRIES)).toEqual([]);
  });

  it("só mostra entradas cuja rota o papel já pode abrir", () => {
    for (const role of applicationRoles) {
      const ctx = context(role, [classFrame, subjectFrame]);
      for (const entry of getContextEntries(ctx, ACADEMIC_CONTEXT_ENTRIES)) {
        expect(entry.module).toBe("pedagogica");
      }
    }
    expect(
      getContextEntries(
        context("Tesouraria", [classFrame, subjectFrame]),
        ACADEMIC_CONTEXT_ENTRIES,
      ),
    ).toEqual([]);
  });
});

describe("links e entrada activa", () => {
  const ctx = context("Professor", [classFrame, subjectFrame]);

  it("leva turma e disciplina do caminho para os parâmetros da rota existente", () => {
    const grades = ACADEMIC_CONTEXT_ENTRIES.find((e) => e.id === "subject.grades")!;
    expect(contextEntryLink(grades, ctx)).toEqual({
      to: "/pedagogica",
      search: { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" },
    });
    const plans = ACADEMIC_CONTEXT_ENTRIES.find((e) => e.id === "academic.lesson-plans")!;
    expect(contextEntryLink(plans, ctx)).toEqual({
      to: "/planos-aula",
      search: { turma: TURMA_A, disciplina: MATEMATICA },
    });
  });

  it("activa só a entrada da localização actual", () => {
    const entries = getContextEntries(ctx, ACADEMIC_CONTEXT_ENTRIES);
    expect(
      findActiveContextEntry(entries, ctx, "/pedagogica", {
        tab: "presencas",
        turma: TURMA_A,
        disciplina: MATEMATICA,
      }),
    ).toBe("academic.attendance");
    expect(findActiveContextEntry(entries, ctx, "/pedagogica", { tab: "horarios" })).toBeNull();
    expect(
      withActiveView(ctx, entries, "/planos-aula", { turma: TURMA_A, disciplina: MATEMATICA })
        .activeView,
    ).toBe("academic.lesson-plans");
  });

  it("devolve o mesmo objecto quando a entrada activa não muda", () => {
    expect(withActiveView(ctx, [], "/pedagogica", {})).toBe(ctx);
  });

  it("monta o breadcrumb a partir do caminho validado", () => {
    expect(contextBreadcrumb(ctx, "Pedagógica")).toEqual(["Pedagógica", "Turma A", "Matemática"]);
    expect(contextBreadcrumb(ctx)).toEqual(["Turma A", "Matemática"]);
  });
});

describe("academicIdsFromTrail", () => {
  it("uma turma posterior limpa a disciplina anterior", () => {
    expect(academicIdsFromTrail([subjectFrame, { ...classFrame, id: "outra" }])).toEqual({
      turma: "outra",
      disciplina: undefined,
    });
  });
});

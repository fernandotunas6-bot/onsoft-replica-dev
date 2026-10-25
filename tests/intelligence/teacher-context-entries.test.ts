import { describe, expect, it } from "vitest";
import { applicationRoles } from "@/features/auth/access-policy";
import {
  contextEntryLink,
  findActiveContextEntry,
  getContextEntries,
} from "@/features/intelligence/context-registry";
import { teacherContextLookup } from "@/features/intelligence/teacher-context-lookup";
import { TEACHER_CONTEXT_ENTRIES } from "@/features/intelligence/teacher-context-entries";
import type { ContextFrame, ResolvedContext } from "@/features/intelligence/types";

const PROF = "66666666-6666-4666-8666-666666666666";
const frame: ContextFrame = { type: "teacher", id: PROF, label: "João Mendes" };

function context(role: string, grants = {}, trail: ContextFrame[] = [frame]): ResolvedContext {
  return {
    userId: "u",
    role,
    grants,
    pathname: `/professores/${PROF}`,
    focusedEntity: null,
    schoolId: "school-a",
    academicYearId: null,
    trail,
    activeView: null,
    key: "k",
  };
}

const ids = (role: string, grants = {}) =>
  getContextEntries(context(role, grants), TEACHER_CONTEXT_ENTRIES).map((entry) => entry.id);

describe("entradas do contexto Professor", () => {
  it("a quem gere o Pedagógico: perfil, horário, planos e presenças", () => {
    const all = [
      "teacher.overview",
      "teacher.timetable",
      "teacher.lesson-plans",
      "teacher.attendance",
    ];
    expect(ids("Administrador")).toEqual(all);
    expect(ids("Secretaria")).toEqual(all);
  });

  it("horário, planos e presenças por professor só com escrita no Pedagógico", () => {
    // O professor vê o seu horário no perfil; a vista da escola não tem a lista.
    expect(ids("Professor")).toEqual(["teacher.overview"]);
    expect(ids("Secretaria", { pedagogica: "Leitura" })).toEqual(["teacher.overview"]);
  });

  it("nunca a aluno, encarregado ou tesouraria", () => {
    for (const role of applicationRoles) {
      if (["Administrador", "Secretaria", "Professor"].includes(role)) continue;
      expect(ids(role)).toEqual([]);
    }
  });

  it("não aparece noutros contextos", () => {
    const turma: ContextFrame = { type: "class", id: "c", label: "10.ª A" };
    expect(
      getContextEntries(context("Administrador", {}, [turma]), TEACHER_CONTEXT_ENTRIES),
    ).toEqual([]);
  });

  it("ligações com o professor do caminho e entrada activa", () => {
    const ctx = context("Secretaria");
    const [overview, timetable, plans, attendance] = getContextEntries(
      ctx,
      TEACHER_CONTEXT_ENTRIES,
    );
    expect(contextEntryLink(overview!, ctx)).toEqual({ to: `/professores/${PROF}`, search: {} });
    expect(contextEntryLink(timetable!, ctx)).toEqual({
      to: "/pedagogica",
      search: { tab: "horarios", professor: PROF },
    });
    expect(contextEntryLink(attendance!, ctx)).toEqual({
      to: "/pedagogica",
      search: { tab: "presencas", professor: PROF },
    });
    expect(contextEntryLink(plans!, ctx)).toEqual({
      to: "/planos-aula",
      search: { professor: PROF },
    });
    const entries = getContextEntries(ctx, TEACHER_CONTEXT_ENTRIES);
    expect(findActiveContextEntry(entries, ctx, `/professores/${PROF}`, {})).toBe(
      "teacher.overview",
    );
    expect(
      findActiveContextEntry(entries, ctx, "/pedagogica", { tab: "horarios", professor: PROF }),
    ).toBe("teacher.timetable");
    expect(findActiveContextEntry(entries, ctx, "/planos-aula", { professor: PROF })).toBe(
      "teacher.lesson-plans",
    );
    expect(findActiveContextEntry(entries, ctx, "/pedagogica", { tab: "horarios" })).toBeNull();
  });
});

describe("teacherContextLookup", () => {
  const lookup = teacherContextLookup([{ id: PROF, full_name: "João Mendes" }], "school-a");

  it("confirma só o professor que a escola devolveu, com o nome do servidor", () => {
    expect(lookup({ type: "teacher", id: PROF })).toEqual({
      type: "teacher",
      id: PROF,
      label: "João Mendes",
      schoolId: "school-a",
    });
    expect(lookup({ type: "teacher", id: "77777777-7777-4777-8777-777777777777" })).toBeNull();
    expect(lookup({ type: "student", id: PROF })).toBeNull();
  });

  it("sem escola activa, nada se confirma", () => {
    expect(
      teacherContextLookup([{ id: PROF, full_name: "João" }], null)({ type: "teacher", id: PROF }),
    ).toBeNull();
  });
});

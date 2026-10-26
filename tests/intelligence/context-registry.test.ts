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
      "class.profile",
      "class.students",
      "subject.grades",
      "academic.attendance",
      "class.timetable",
      "academic.lesson-plans",
      "academic.tasks",
      "academic.files",
    ]);
  });

  it("separa as entradas da turma das da disciplina", () => {
    const entries = getContextEntries(context("Professor", [classFrame]), ACADEMIC_CONTEXT_ENTRIES);
    // Só com a turma, as presenças são as aulas do dia dessa turma; na disciplina
    // abrem a chamada dessa aula.
    expect(entries.map((e) => e.id)).toEqual([
      "class.profile",
      "class.students",
      "class.grades",
      "class.attendance",
      "class.timetable",
      "academic.lesson-plans",
      "academic.tasks",
      "academic.files",
    ]);
  });

  it("«Professor responsável» só aparece quando a disciplina tem professor devolvido", () => {
    const PROF = "66666666-6666-4666-8666-666666666666";
    const withTeacher: ContextFrame = { ...subjectFrame, relations: { teacher: PROF } };
    const ctx = context("Secretaria", [classFrame, withTeacher]);
    const entries = getContextEntries(ctx, ACADEMIC_CONTEXT_ENTRIES);
    const teacher = entries.find((e) => e.id === "subject.teacher");
    expect(teacher && contextEntryLink(teacher, ctx)).toEqual({
      to: `/professores/${PROF}`,
      search: {},
    });
    expect(findActiveContextEntry(entries, ctx, `/professores/${PROF}`, {})).toBe(
      "subject.teacher",
    );
    // Sem a relação (disciplina sem professor, ou o professor da conta), não aparece.
    expect(
      getContextEntries(
        context("Secretaria", [classFrame, subjectFrame]),
        ACADEMIC_CONTEXT_ENTRIES,
      ).map((e) => e.id),
    ).not.toContain("subject.teacher");
    // Nem «Nenhum» em Pessoas: o perfil do professor é dessa área.
    expect(
      getContextEntries(
        context("Secretaria", [classFrame, withTeacher], { pessoas: "Nenhum" }),
        ACADEMIC_CONTEXT_ENTRIES,
      ).map((e) => e.id),
    ).not.toContain("subject.teacher");
  });

  it("«Nenhum» em Arquivos tira os materiais, e só eles", () => {
    const entries = getContextEntries(
      context("Professor", [classFrame, subjectFrame], { arquivos: "Nenhum" }),
      ACADEMIC_CONTEXT_ENTRIES,
    );
    expect(entries.map((e) => e.id)).toEqual([
      "class.profile",
      "class.students",
      "subject.grades",
      "academic.attendance",
      "class.timetable",
      "academic.lesson-plans",
      "academic.tasks",
    ]);
  });

  it("não mostra nada sem contexto de entidade", () => {
    expect(getContextEntries(context("Administrador", []), ACADEMIC_CONTEXT_ENTRIES)).toEqual([]);
  });

  it("só mostra entradas cuja rota o papel já pode abrir", () => {
    for (const role of applicationRoles) {
      const ctx = context(role, [classFrame, subjectFrame]);
      for (const entry of getContextEntries(ctx, ACADEMIC_CONTEXT_ENTRIES)) {
        expect(["pedagogica", "arquivos"]).toContain(entry.module);
      }
    }
    expect(
      getContextEntries(
        context("Tesouraria", [classFrame, subjectFrame]),
        ACADEMIC_CONTEXT_ENTRIES,
      ),
    ).toEqual([]);
  });

  it("deixa o menu da turma só a Administrador, Secretaria e Professor", () => {
    // As regras de rota deixam aluno e encarregado abrir /pedagogica e
    // /planos-aula para o que é seu; a pauta e os planos da turma não são deles.
    const comMenu = applicationRoles.filter(
      (role) =>
        getContextEntries(context(role, [classFrame, subjectFrame]), ACADEMIC_CONTEXT_ENTRIES)
          .length > 0,
    );
    expect(comMenu).toEqual(["Administrador", "Secretaria", "Professor"]);
    expect(
      getContextEntries(context("Encarregado", [classFrame]), ACADEMIC_CONTEXT_ENTRIES),
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
    // Os ficheiros estão por turma: da disciplina abre-se a pasta da turma.
    const files = ACADEMIC_CONTEXT_ENTRIES.find((e) => e.id === "academic.files")!;
    expect(contextEntryLink(files, ctx)).toEqual({ to: "/arquivos", search: { turma: TURMA_A } });
    // A ficha da turma tem página própria; os alunos são uma secção dela.
    const profile = ACADEMIC_CONTEXT_ENTRIES.find((e) => e.id === "class.profile")!;
    expect(contextEntryLink(profile, ctx)).toEqual({
      to: `/pedagogica/turmas/${TURMA_A}`,
      search: {},
    });
    const students = ACADEMIC_CONTEXT_ENTRIES.find((e) => e.id === "class.students")!;
    expect(contextEntryLink(students, ctx)).toEqual({
      to: `/pedagogica/turmas/${TURMA_A}`,
      search: { secao: "alunos" },
    });
    // Os trabalhos juntam-se por turma ou por disciplina.
    const tasks = ACADEMIC_CONTEXT_ENTRIES.find((e) => e.id === "academic.tasks")!;
    expect(contextEntryLink(tasks, ctx)).toEqual({
      to: "/pedagogica/trabalhos",
      search: { turma: TURMA_A, disciplina: MATEMATICA },
    });
    expect(contextEntryLink(tasks, context("Professor", [classFrame]))).toEqual({
      to: "/pedagogica/trabalhos",
      search: { turma: TURMA_A },
    });
    // O horário também é da turma.
    const timetable = ACADEMIC_CONTEXT_ENTRIES.find((e) => e.id === "class.timetable")!;
    expect(contextEntryLink(timetable, ctx)).toEqual({
      to: "/pedagogica",
      search: { tab: "horarios", turma: TURMA_A },
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
      findActiveContextEntry(entries, ctx, "/pedagogica", { tab: "horarios", turma: TURMA_A }),
    ).toBe("class.timetable");
    expect(findActiveContextEntry(entries, ctx, `/pedagogica/turmas/${TURMA_A}`, {})).toBe(
      "class.profile",
    );
    expect(
      findActiveContextEntry(entries, ctx, `/pedagogica/turmas/${TURMA_A}`, { secao: "alunos" }),
    ).toBe("class.students");
    expect(
      findActiveContextEntry(entries, ctx, "/pedagogica/trabalhos", {
        turma: TURMA_A,
        disciplina: MATEMATICA,
      }),
    ).toBe("academic.tasks");
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

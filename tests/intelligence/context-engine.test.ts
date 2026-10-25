import { describe, expect, it } from "vitest";
import { buildAppContext } from "@/features/intelligence/context-engine";
import { isSameContext, resolveContextFrame } from "@/features/intelligence/context-frame";
import {
  buildContextNavigation,
  CONTEXT_DESTINATIONS,
  pendingContextDestinations,
  type ContextDestination,
} from "@/features/intelligence/context-registry";
import type { EntityFocus } from "@/features/intelligence/types";

const SCHOOL_A = "11111111-1111-4111-8111-111111111111";
const SCHOOL_B = "22222222-2222-4222-8222-222222222222";
const TURMA_A = "33333333-3333-4333-8333-333333333333";
const TURMA_B = "44444444-4444-4444-8444-444444444444";
const MATEMATICA = "55555555-5555-4555-8555-555555555555";
const STUDENT = "66666666-6666-4666-8666-666666666666";

const focus = (overrides: Partial<EntityFocus> = {}): EntityFocus => ({
  type: "student",
  id: STUDENT,
  label: "Aluno",
  schoolId: SCHOOL_A,
  data: {},
  ...overrides,
});

const frameFor = (
  role: string,
  pathname: string,
  search: Record<string, unknown> = {},
  schoolId: string | null = SCHOOL_A,
) => resolveContextFrame({ pathname, search, schoolId, role, academicYearId: "ano-1" });

const ids = (groups: ReturnType<typeof buildContextNavigation>) =>
  groups.flatMap((group) => group.items.map((item) => item.id));

describe("resolveContextFrame — ordem de resolução", () => {
  it("a rota tipada define a disciplina da turma", () => {
    const frame = frameFor("Professor", "/pedagogica", {
      tab: "notas",
      turma: TURMA_A,
      disciplina: MATEMATICA,
    });
    expect(frame.entity).toEqual({ type: "subject", classGroupId: TURMA_A, subjectId: MATEMATICA });
    expect(frame.source).toBe("route");
    expect(frame.activeView).toEqual({ pathname: "/pedagogica", tab: "notas" });
  });

  it("só turma resolve o contexto de turma", () => {
    expect(frameFor("Professor", "/planos-aula", { turma: TURMA_A }).entity).toEqual({
      type: "class",
      classGroupId: TURMA_A,
    });
  });

  it("IDs mal formados na URL não criam contexto", () => {
    expect(frameFor("Professor", "/pedagogica", { turma: "1 OR 1=1" }).entity).toBeNull();
    expect(frameFor("Secretaria", "/alunos/abc").entity).toBeNull();
    expect(frameFor("Secretaria", "/alunos-x/" + STUDENT).entity).toBeNull();
  });

  it("detalhe de aluno e professor vêm do parâmetro de rota", () => {
    expect(frameFor("Secretaria", `/alunos/${STUDENT}`).entity).toEqual({
      type: "student",
      studentId: STUDENT,
    });
    expect(frameFor("Administrador", `/professores/${STUDENT}`).entity?.type).toBe("teacher");
  });

  it("a rota prevalece sobre a entidade declarada", () => {
    const frame = resolveContextFrame({
      pathname: "/pedagogica",
      search: { turma: TURMA_B },
      schoolId: SCHOOL_A,
      role: "Professor",
      focusedEntity: focus(),
    });
    expect(frame.entity).toEqual({ type: "class", classGroupId: TURMA_B });
  });

  it("usa a entidade declarada só da mesma escola", () => {
    const same = resolveContextFrame({
      pathname: "/portal",
      schoolId: SCHOOL_A,
      role: "Secretaria",
      focusedEntity: focus(),
    });
    expect(same.source).toBe("focus");
    const other = resolveContextFrame({
      pathname: "/portal",
      schoolId: SCHOOL_B,
      role: "Secretaria",
      focusedEntity: focus(),
    });
    expect(other.entity).toBeNull();
    expect(other.source).toBe("none");
  });

  it("a chave muda com escola, papel, ano e entidade (invalidação de estado)", () => {
    const base = frameFor("Professor", "/pedagogica", { turma: TURMA_A });
    expect(isSameContext(base, frameFor("Professor", "/planos-aula", { turma: TURMA_A }))).toBe(
      true,
    );
    expect(
      isSameContext(base, frameFor("Professor", "/pedagogica", { turma: TURMA_A }, SCHOOL_B)),
    ).toBe(false);
    expect(isSameContext(base, frameFor("Secretaria", "/pedagogica", { turma: TURMA_A }))).toBe(
      false,
    );
    expect(isSameContext(base, frameFor("Professor", "/pedagogica", { turma: TURMA_B }))).toBe(
      false,
    );
    const otherYear = resolveContextFrame({
      pathname: "/pedagogica",
      search: { turma: TURMA_A },
      schoolId: SCHOOL_A,
      role: "Professor",
      academicYearId: "ano-2",
    });
    expect(isSameContext(base, otherYear)).toBe(false);
  });
});

describe("buildContextNavigation — menu da entidade", () => {
  it("disciplina do professor: destinos reais, todos com a mesma turma e disciplina", () => {
    const groups = buildContextNavigation({
      frame: frameFor("Professor", "/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      grants: {},
    });
    expect(ids(groups)).toEqual([
      "subject.lesson-plans",
      "subject.materials",
      "subject.grades",
      "subject.attendance",
    ]);
    for (const item of groups.flatMap((group) => group.items)) {
      expect(item.search?.turma).toBe(TURMA_A);
      if (item.to !== "/arquivos") expect(item.search?.disciplina).toBe(MATEMATICA);
    }
    // Nenhum destino da Turma B aparece sem mudança explícita de turma.
    expect(JSON.stringify(groups)).not.toContain(TURMA_B);
  });

  it("a ordem dos grupos segue o contrato", () => {
    const groups = buildContextNavigation({
      frame: frameFor("Professor", "/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      grants: {},
    });
    expect(groups.map((group) => group.title)).toEqual(["Ensino", "Avaliação", "Acompanhamento"]);
  });

  it("aluno não recebe destinos de gestão da turma", () => {
    const groups = buildContextNavigation({
      frame: frameFor("Aluno", "/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      grants: {},
    });
    expect(ids(groups)).toEqual([]);
  });

  it("Secretaria não abre a chamada do professor nem os arquivos sem permissão", () => {
    const groups = buildContextNavigation({
      frame: frameFor("Secretaria", "/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      grants: { arquivos: "Nenhum" },
    });
    expect(ids(groups)).toEqual(["subject.lesson-plans", "subject.grades"]);
  });

  it("uma permissão «Nenhum» retira o módulo mesmo ao administrador", () => {
    const groups = buildContextNavigation({
      frame: frameFor("Administrador", "/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      grants: { pedagogica: "Nenhum" },
    });
    expect(ids(groups)).not.toContain("subject.grades");
    expect(ids(groups)).not.toContain("subject.lesson-plans");
  });

  it("sem escola ou sem entidade não há menu contextual", () => {
    expect(
      buildContextNavigation({
        frame: frameFor("Professor", "/pedagogica", { turma: TURMA_A }, null),
        grants: {},
      }),
    ).toEqual([]);
    expect(buildContextNavigation({ frame: frameFor("Professor", "/portal"), grants: {} })).toEqual(
      [],
    );
  });

  it("aluno seleccionado abre a ficha para a secretaria e nada ao professor", () => {
    const frame = (role: string) => frameFor(role, `/alunos/${STUDENT}`);
    expect(ids(buildContextNavigation({ frame: frame("Secretaria"), grants: {} }))).toEqual([
      "student.profile",
    ]);
    expect(ids(buildContextNavigation({ frame: frame("Professor"), grants: {} }))).toEqual([]);
  });

  it("funções sem ecrã ficam registadas mas fora do menu", () => {
    expect(pendingContextDestinations()).toContain("subject.tasks");
    const groups = buildContextNavigation({
      frame: frameFor("Administrador", "/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      grants: {},
    });
    expect(ids(groups)).not.toContain("subject.tasks");
  });

  it("um módulo pode estender o registo sem alterar o motor", () => {
    const extra: ContextDestination = {
      id: "subject.calendar",
      label: "Calendário",
      icon: "Calendar",
      group: "acompanhamento",
      contexts: ["subject"],
      status: "implemented",
      priority: 5,
      link: () => ({ to: "/calendario" }),
      emptyLabel: "Sem eventos.",
    };
    const groups = buildContextNavigation({
      frame: frameFor("Professor", "/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      grants: {},
      registry: [...CONTEXT_DESTINATIONS, extra],
    });
    const acompanhamento = groups.find((group) => group.id === "acompanhamento");
    expect(acompanhamento?.items.map((item) => item.id)).toEqual([
      "subject.calendar",
      "subject.attendance",
    ]);
  });

  it("cada destino implementado usa uma rota existente", async () => {
    const { readdirSync } = await import("node:fs");
    const routes = readdirSync("src/routes", { recursive: true }).map(String);
    const exists = (to: string) => {
      const file = to
        .replace(/^\//, "")
        .replace(/\/[0-9a-f-]{36}$/, "/$id")
        .replace(/\//g, ".");
      return routes.some(
        (route) =>
          route
            .replace(/\.tsx$/, "")
            .replace(/_/g, "")
            .replace(/\//g, ".") === file ||
          route
            .replace(/\.tsx$/, "")
            .replace(/\//g, ".")
            .replace(/\$\w+/, "$id") === file,
      );
    };
    const entity = { type: "subject", classGroupId: TURMA_A, subjectId: MATEMATICA } as const;
    const student = { type: "student", studentId: STUDENT } as const;
    const teacher = { type: "teacher", teacherId: STUDENT } as const;
    for (const entry of CONTEXT_DESTINATIONS.filter((item) => item.status === "implemented")) {
      const link = entry.link(entity) ?? entry.link(student) ?? entry.link(teacher);
      expect(link, entry.id).not.toBeNull();
      expect(exists(link!.to), `${entry.id} → ${link!.to}`).toBe(true);
    }
  });
});

describe("buildAppContext — isolamento por escola", () => {
  const base = { userId: "u", role: "Secretaria", grants: {}, pathname: "/alunos/x" };
  it("descarta a entidade declarada por outra escola", () => {
    expect(
      buildAppContext({ ...base, focusedEntity: focus(), schoolId: SCHOOL_B }).focusedEntity,
    ).toBeNull();
  });
  it("mantém a entidade da escola activa", () => {
    expect(
      buildAppContext({ ...base, focusedEntity: focus(), schoolId: SCHOOL_A }).focusedEntity?.id,
    ).toBe(STUDENT);
  });
});

import { describe, expect, it } from "vitest";
import { crumbsAfterTitle } from "@/features/intelligence/active-context";
import { contextCrumbs } from "@/features/intelligence/context-breadcrumb";
import { subjectOfferingId } from "@/features/intelligence/context-resolver";
import type { ContextFrame } from "@/features/intelligence/types";

const TURMA_A = "11111111-1111-4111-8111-111111111111";
const MATEMATICA = "33333333-3333-4333-8333-333333333333";

const turma: ContextFrame = { type: "class", id: TURMA_A, label: "10.ª A" };
const disciplina: ContextFrame = {
  type: "subject-offering",
  id: subjectOfferingId(TURMA_A, MATEMATICA),
  label: "Matemática",
};

describe("contextCrumbs", () => {
  it("cada passo leva à mesma página nesse nível e guarda os filtros da página", () => {
    const crumbs = contextCrumbs([turma, disciplina], "/pedagogica", {
      tab: "notas",
      turma: TURMA_A,
      disciplina: MATEMATICA,
      pauta: "1",
      trimestre: "2",
      pagina: 3,
    });
    // O título leva ao separador sem turma; a pauta não fica sem a sua turma.
    expect(crumbs.page).toEqual({
      to: "/pedagogica",
      search: { tab: "notas", trimestre: "2" },
    });
    expect(crumbs.frames).toEqual([
      {
        label: "10.ª A",
        to: "/pedagogica",
        search: { tab: "notas", trimestre: "2", turma: TURMA_A, pauta: "1" },
      },
      {
        label: "Matemática",
        to: "/pedagogica",
        search: {
          tab: "notas",
          trimestre: "2",
          turma: TURMA_A,
          disciplina: MATEMATICA,
          pauta: "1",
        },
      },
    ]);
  });

  it("nos planos de aula, subir para a turma tira só a disciplina", () => {
    const crumbs = contextCrumbs([turma, disciplina], "/planos-aula", {
      turma: TURMA_A,
      disciplina: MATEMATICA,
    });
    expect(crumbs.frames.map((crumb) => crumb.search)).toEqual([
      { turma: TURMA_A },
      { turma: TURMA_A, disciplina: MATEMATICA },
    ]);
    expect(crumbs.page).toEqual({ to: "/planos-aula", search: {} });
  });

  it("nos arquivos, a turma segue o título, que leva à biblioteca toda", () => {
    const crumbs = contextCrumbs([turma], "/arquivos", { turma: TURMA_A });
    expect(crumbs.page).toEqual({ to: "/arquivos", search: {} });
    expect(crumbs.frames).toEqual([
      { label: "10.ª A", to: "/arquivos", search: { turma: TURMA_A } },
    ]);
  });

  it("nos trabalhos, a turma e a disciplina seguem o título", () => {
    const crumbs = contextCrumbs([turma, disciplina], "/pedagogica/trabalhos", {
      turma: TURMA_A,
      disciplina: MATEMATICA,
    });
    expect(crumbs.frames).toEqual([
      { label: "10.ª A", to: "/pedagogica/trabalhos", search: { turma: TURMA_A } },
      {
        label: "Matemática",
        to: "/pedagogica/trabalhos",
        search: { turma: TURMA_A, disciplina: MATEMATICA },
      },
    ]);
  });

  it("no horário de um professor, o professor segue o título, que leva ao horário da escola", () => {
    const PROF = "66666666-6666-4666-8666-666666666666";
    const professor: ContextFrame = { type: "teacher", id: PROF, label: "João Mendes" };
    const crumbs = contextCrumbs([professor], "/pedagogica", { tab: "horarios", professor: PROF });
    expect(crumbs.page).toEqual({ to: "/pedagogica", search: { tab: "horarios" } });
    expect(crumbs.frames).toEqual([
      {
        label: "João Mendes",
        to: "/pedagogica",
        search: { tab: "horarios", professor: PROF },
      },
    ]);
  });

  it("sem caminho confirmado, sem passos", () => {
    const vazio = { page: null, frames: [] };
    expect(contextCrumbs([], "/pedagogica", { tab: "turmas" })).toEqual(vazio);
    expect(contextCrumbs(null, "/pedagogica", {})).toEqual(vazio);
  });

  it("na página da própria entidade, o passo que repete o título sai", () => {
    const professora: ContextFrame = { type: "teacher", id: "t", label: "Maria Domingos" };
    const crumbs = contextCrumbs(
      [professora],
      "/professores/22222222-2222-4222-8222-222222222222",
      {},
    );
    expect(crumbs).toEqual({ page: null, frames: [{ label: "Maria Domingos" }] });
    expect(crumbsAfterTitle(crumbs, " maria domingos ")).toEqual([]);
    expect(crumbsAfterTitle(crumbs, "Professores")).toEqual([{ label: "Maria Domingos" }]);
  });
});

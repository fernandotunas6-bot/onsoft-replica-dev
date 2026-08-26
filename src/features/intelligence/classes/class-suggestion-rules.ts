import type { SuggestionRule } from "../types";
import type { ClassRelationsSnapshot } from "./class-relations-adapter";

export function buildClassSuggestionRules(
  _classGroupId: string,
): SuggestionRule<ClassRelationsSnapshot>[] {
  return [
    {
      id: "disciplina-sem-professor",
      evaluate: (snapshot) =>
        snapshot.disciplinas.semProfessorCount > 0
          ? {
              id: "disciplina-sem-professor",
              priority: 90,
              category: "academico",
              module: "pedagogica",
              requiresWrite: true,
              title: "Atribuir professor à disciplina",
              description: `${snapshot.disciplinas.semProfessorCount} disciplina(s) sem professor atribuído.`,
              route: "/pedagogica",
              reason: "Existem disciplinas desta turma sem professor.",
            }
          : null,
    },
    {
      id: "sem-horario",
      evaluate: (snapshot) =>
        snapshot.horario.count === 0
          ? {
              id: "sem-horario",
              priority: 70,
              category: "academico",
              module: "pedagogica",
              title: "Definir horário da turma",
              route: "/pedagogica",
              reason: "Esta turma ainda não tem slots no horário.",
            }
          : null,
    },
    {
      id: "turma-lotada",
      evaluate: (snapshot) =>
        snapshot.enrollment.capacity &&
        snapshot.enrollment.count / snapshot.enrollment.capacity >= 0.9
          ? {
              id: "turma-lotada",
              priority: 55,
              category: "matricula",
              module: "pedagogica",
              title: "Rever capacidade da turma",
              description: `${snapshot.enrollment.count} de ${snapshot.enrollment.capacity} vagas ocupadas.`,
              route: "/pedagogica",
              reason: "Turma próxima da capacidade máxima.",
            }
          : null,
    },
    {
      id: "sem-avaliacoes",
      evaluate: (snapshot) =>
        snapshot.enrollment.count > 0 && snapshot.avaliacoes.count === 0
          ? {
              id: "sem-avaliacoes",
              priority: 50,
              category: "academico",
              module: "pedagogica",
              title: "Lançar as primeiras notas",
              route: "/pedagogica",
              reason: "Turma com alunos matriculados mas ainda sem notas lançadas.",
            }
          : null,
    },
    {
      id: "aplicar-curriculo",
      evaluate: () => ({
        id: "aplicar-curriculo",
        priority: 10,
        category: "geral",
        module: "pedagogica",
        title: "Aplicar currículo do curso",
        route: "/pedagogica",
        reason: "Ação frequente para esta turma.",
      }),
    },
  ];
}

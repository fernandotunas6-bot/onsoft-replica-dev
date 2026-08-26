import type { RelationMap } from "../types";
import type { ClassRelationsSnapshot } from "./class-relations-adapter";

export function buildClassRelationMap(classGroupId: string): RelationMap<ClassRelationsSnapshot> {
  return [
    {
      key: "alunos",
      label: "Alunos",
      module: "pedagogica",
      resolve: (snapshot) => ({
        status: snapshot.enrollment.count === 0 ? "empty" : "ok",
        summary:
          snapshot.enrollment.count === 0
            ? "Sem alunos matriculados"
            : `${snapshot.enrollment.count}${snapshot.enrollment.capacity ? `/${snapshot.enrollment.capacity}` : ""} aluno(s)`,
        route: "/pedagogica",
      }),
    },
    {
      key: "disciplinas",
      label: "Disciplinas",
      module: "pedagogica",
      resolve: (snapshot) => ({
        status:
          snapshot.disciplinas.count === 0
            ? "empty"
            : snapshot.disciplinas.semProfessorCount > 0
              ? "attention"
              : "ok",
        summary:
          snapshot.disciplinas.count === 0
            ? "Sem disciplinas associadas"
            : snapshot.disciplinas.semProfessorCount > 0
              ? `${snapshot.disciplinas.semProfessorCount} sem professor`
              : `${snapshot.disciplinas.count} disciplina(s)`,
        route: "/pedagogica",
      }),
    },
    {
      key: "horario",
      label: "Horário",
      module: "pedagogica",
      resolve: (snapshot) => ({
        status: snapshot.horario.count === 0 ? "empty" : "ok",
        summary:
          snapshot.horario.count === 0
            ? "Sem horário definido"
            : `${snapshot.horario.count} slot(s)`,
        route: "/pedagogica",
      }),
    },
    {
      key: "avaliacoes",
      label: "Avaliações",
      module: "pedagogica",
      resolve: (snapshot) => ({
        status: snapshot.avaliacoes.count === 0 ? "empty" : "ok",
        summary:
          snapshot.avaliacoes.count === 0
            ? "Ainda sem notas lançadas"
            : `${snapshot.avaliacoes.count} nota(s) lançada(s)`,
        route: "/pedagogica",
      }),
    },
    {
      key: "desempenho",
      label: "Desempenho",
      module: "pedagogica",
      resolve: (snapshot) => {
        const average = snapshot.academic.averageScore;
        if (average === null)
          return { status: "empty", summary: "Sem média geral", route: "/pedagogica" };
        if (average < 10)
          return {
            status: "attention",
            summary: `Média geral ${average.toFixed(1)}`,
            route: "/pedagogica",
          };
        return { status: "ok", summary: `Média geral ${average.toFixed(1)}`, route: "/pedagogica" };
      },
    },
  ];
}

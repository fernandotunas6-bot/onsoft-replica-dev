import type { RelationMap } from "../types";
import type { StudentRelationsSnapshot } from "./student-relations-adapter";

export function buildStudentRelationMap(studentId: string): RelationMap<StudentRelationsSnapshot> {
  return [
    {
      key: "matricula",
      label: "Matrícula",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.enrollment.id ? "ok" : "empty",
        summary: snapshot.enrollment.id ? "Matrícula activa" : "Sem matrícula activa",
        route: `/alunos/${studentId}`,
      }),
    },
    {
      key: "turma",
      label: "Turma",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.enrollment.className ? "ok" : "empty",
        summary: snapshot.enrollment.className ?? "Sem turma atribuída",
        route: `/alunos/${studentId}`,
      }),
    },
    {
      key: "notas",
      label: "Notas / Pauta",
      module: "pedagogica",
      resolve: (snapshot) => {
        const average = snapshot.academic.finalAverage;
        if (average === null)
          return { status: "empty", summary: "Sem média registada", route: "/pedagogica" };
        if (average < 8)
          return {
            status: "critical",
            summary: `Média final ${average} valores`,
            route: "/pedagogica",
          };
        if (average < 10)
          return {
            status: "attention",
            summary: `Média final ${average} valores`,
            route: "/pedagogica",
          };
        return { status: "ok", summary: `Média final ${average} valores`, route: "/pedagogica" };
      },
    },
    {
      key: "financeiro",
      label: "Financeiro",
      module: "financeiro",
      resolve: (snapshot) => {
        if (!snapshot.finance.hasData) {
          return {
            status: "empty",
            summary: "Situação financeira indisponível",
            route: "/faturas",
          };
        }
        if (snapshot.finance.overdueCount > 0) {
          return {
            status: "critical",
            summary: `${snapshot.finance.overdueCount} fatura(s) em atraso`,
            route: "/faturas",
          };
        }
        return { status: "ok", summary: "Sem faturas em atraso", route: "/faturas" };
      },
    },
    {
      key: "documentos",
      label: "Documentos",
      module: "pessoas",
      resolve: (snapshot) => {
        if (!snapshot.documents.hasData) {
          return { status: "empty", summary: "Documentos indisponíveis", route: "/documentos" };
        }
        if (snapshot.documents.pendingCount > 0) {
          return {
            status: "attention",
            summary: `${snapshot.documents.pendingCount} pedido(s) pendente(s)`,
            route: "/documentos",
          };
        }
        return { status: "ok", summary: "Sem pedidos pendentes", route: "/documentos" };
      },
    },
    {
      key: "encarregado",
      label: "Encarregado",
      module: "pessoas",
      resolve: (snapshot) => ({
        status: snapshot.guardians.count === 0 ? "critical" : "ok",
        summary:
          snapshot.guardians.count === 0
            ? "Sem encarregado de educação"
            : `${snapshot.guardians.count} encarregado(s) associado(s)`,
        route: `/alunos/${studentId}`,
      }),
    },
    {
      key: "historico",
      label: "Histórico académico",
      module: "pedagogica",
      resolve: (snapshot) => ({
        status: snapshot.academic.hasHistory ? "ok" : "empty",
        summary: snapshot.academic.hasHistory
          ? "Histórico disponível"
          : "Sem anos lectivos anteriores",
        route: `/alunos/${studentId}`,
      }),
    },
  ];
}

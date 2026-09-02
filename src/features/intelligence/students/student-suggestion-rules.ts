import type { SuggestionRule } from "../types";
import type { StudentRelationsSnapshot } from "./student-relations-adapter";

export function buildStudentSuggestionRules(
  studentId: string,
): SuggestionRule<StudentRelationsSnapshot>[] {
  return [
    {
      id: "matricula-em-falta",
      evaluate: (snapshot) =>
        snapshot.enrollment.id
          ? null
          : {
              id: "matricula-em-falta",
              priority: 95,
              category: "matricula",
              module: "pessoas",
              requiresWrite: true,
              title: "Matricular aluno numa turma",
              description: "Este aluno ainda não tem matrícula activa.",
              route: `/alunos/${studentId}`,
              reason: "Sem matrícula activa no ano lectivo actual.",
            },
    },
    {
      id: "financeiro-em-atraso",
      evaluate: (snapshot) =>
        snapshot.finance.overdueCount > 0
          ? {
              id: "financeiro-em-atraso",
              priority: 90,
              category: "financeiro",
              module: "financeiro",
              title: "Regularizar faturas em atraso",
              description: `${snapshot.finance.overdueCount} fatura(s) em atraso.`,
              route: "/faturas",
              reason: "Existem faturas vencidas por liquidar.",
            }
          : null,
    },
    {
      id: "encarregado-em-falta",
      evaluate: (snapshot) =>
        snapshot.guardians.count === 0
          ? {
              id: "encarregado-em-falta",
              priority: 80,
              category: "encarregado",
              module: "pessoas",
              requiresWrite: true,
              title: "Associar encarregado de educação",
              route: `/alunos/${studentId}`,
              reason: "Aluno sem encarregado de educação registado.",
            }
          : null,
    },
    {
      id: "documento-pendente",
      evaluate: (snapshot) =>
        snapshot.documents.hasData && snapshot.documents.pendingCount > 0
          ? {
              id: "documento-pendente",
              priority: 60,
              category: "documentos",
              module: "pessoas",
              title: "Acompanhar pedido de documento",
              description: `${snapshot.documents.pendingCount} pedido(s) por concluir.`,
              route: "/documentos",
              reason: "Existem pedidos de documentos deste aluno por concluir.",
            }
          : null,
    },
    {
      id: "nota-critica",
      evaluate: (snapshot) =>
        snapshot.academic.finalAverage !== null && snapshot.academic.finalAverage < 10
          ? {
              id: "nota-critica",
              priority: 55,
              category: "academico",
              module: "pedagogica",
              title: "Rever desempenho académico",
              description: `Média actual: ${snapshot.academic.finalAverage} valores.`,
              route: "/pedagogica",
              reason: "Média abaixo da nota de aprovação.",
            }
          : null,
    },
    {
      id: "enviar-relatorio-narrativo",
      evaluate: (snapshot) =>
        snapshot.guardians.count > 0
          ? {
              id: "enviar-relatorio-narrativo",
              priority: 70,
              category: "academico",
              module: "comunicacoes",
              requiresWrite: true,
              title: "Partilhar Relatório de Inteligência",
              description: "O Motor de ML gerou um resumo orgânico em texto para o Encarregado.",
              route: `/alunos/${studentId}`,
              reason: "Manter o encarregado informado sobre o panorama global do aluno.",
            }
          : null,
    },
    {
      id: "declaracao-escolar",
      evaluate: () => ({
        id: "declaracao-escolar",
        priority: 10,
        category: "geral",
        module: "pessoas",
        title: "Emitir declaração escolar",
        route: "/documentos",
        reason: "Ação frequente para a situação actual deste aluno.",
      }),
    },
  ];
}

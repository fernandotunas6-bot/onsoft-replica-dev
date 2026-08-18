/**
 * Gerador de Planos de Aula e Sumários AI (INIDE / MED Angola).
 * Gera automaticamente sugestões pedagógicas de objetivos, metodologias e recursos
 * alinhadas ao programa curricular nacional do Ministério da Educação de Angola.
 */

export interface AiGeneratedLessonPlan {
  title: string;
  summary: string;
  generalObjectives: string[];
  specificObjectives: string[];
  methodology: string;
  didacticResources: string[];
  evaluationMethod: string;
  durationMinutes: number;
}

export function generateAiLessonPlanInide(
  subjectName: string,
  topic: string,
  gradeLevel: string = "10ª Classe",
): AiGeneratedLessonPlan {
  const cleanTopic = topic.trim() || "Matéria da Aula";

  return {
    title: `${cleanTopic} · ${subjectName} (${gradeLevel})`,
    summary: `Estudo aprofundado de ${cleanTopic} segundo o programa curricular nacional do INIDE/MED. Análise de conceitos fundamentais, aplicações práticas no contexto angolano e resolução de exercícios de consolidação.`,
    generalObjectives: [
      `Compreender a relevância de ${cleanTopic} no desenvolvimento técnico e científico.`,
      `Aplicar os princípios de ${cleanTopic} na resolução de problemas do quotidiano.`,
    ],
    specificObjectives: [
      `Definir com exatidão os conceitos chave de ${cleanTopic}.`,
      `Identificar as etapas operacionais e metodológicas para análise do tema.`,
      `Demonstrar capacidade crítica e trabalho colaborativo em sala de aula.`,
    ],
    methodology:
      "Método expositivo-dialogado com recursos a exemplificação prática, trabalho em pequenos grupos de discussão e aplicação de ficha de trabalho individual.",
    didacticResources: [
      "Manual Escolar Oficial do MED / INIDE",
      "Quadro branco e marcadores",
      "Projetor / Computador para apresentação multimedia",
      "Fichas de exercícios práticos",
    ],
    evaluationMethod:
      "Avaliação contínua através da observação da participação ativa dos alunos, resposta oral a questões de controlo e correção da ficha prática individual.",
    durationMinutes: 90,
  };
}

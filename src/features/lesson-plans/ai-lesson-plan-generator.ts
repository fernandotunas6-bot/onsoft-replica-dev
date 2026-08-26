/**
 * Gerador de estrutura inicial para planos de aula e sumários.
 * Produz um modelo genérico (objectivos, metodologia, recursos) a partir do nome da
 * disciplina e do tema — texto de rascunho para o professor rever e adaptar, não
 * conteúdo verificado ou alinhado automaticamente ao currículo do INIDE/MED.
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
    summary: `Estudo de ${cleanTopic}: conceitos fundamentais, aplicações práticas no contexto angolano e resolução de exercícios de consolidação. Reveja e ajuste ao programa curricular da disciplina.`,
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

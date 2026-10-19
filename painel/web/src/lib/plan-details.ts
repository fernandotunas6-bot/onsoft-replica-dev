/**
 * O que cada pacote inclui, para «Ver mais» no site e no SIGA.
 *
 * Só promessas verdadeiras: todos os planos têm os mesmos módulos escolares;
 * o que muda são os limites (alunos, equipa, arquivos) e o que o SIGA liga por
 * plano no servidor (domínio próprio e e-mail profissional no Business e no
 * Enterprise; identidade visual avançada no Enterprise — ver plan-features).
 *
 * Ficheiro sem dependências, copiado tal e qual para painel/web/src/lib
 * (o teste tests/saas/plan-details.test.ts garante que as cópias são iguais).
 */

export type PlanDetailCode = "start" | "professional" | "business" | "enterprise";

export type PlanDetail = {
  /** Frase curta, sempre visível no cartão. */
  pitch: string;
  /** Para quem é. */
  idealFor: string;
  /** Destaques que diferenciam o plano dos anteriores. */
  highlights: string[];
};

export const PLAN_DETAILS: Record<PlanDetailCode, PlanDetail> = {
  start: {
    pitch: "Tudo o que uma escola pequena precisa para deixar o papel e as folhas de cálculo.",
    idealFor: "Escolas primárias, explicações e colégios até 250 alunos.",
    highlights: [
      "Todos os módulos escolares, sem extras por módulo",
      "Endereço próprio na plataforma (escola.portal-siga.com)",
      "Suporte por e-mail e WhatsApp",
    ],
  },
  professional: {
    pitch: "Para colégios em crescimento, com várias turmas, cursos e equipa administrativa.",
    idealFor: "Colégios e complexos até 750 alunos e 75 pessoas na equipa.",
    highlights: [
      "Tudo o que o Start inclui",
      "Três vezes mais alunos e equipa",
      "20 GB para documentos, fotografias e arquivo",
    ],
  },
  business: {
    pitch: "Para grandes instituições que querem a sua marca no endereço e no e-mail.",
    idealFor: "Escolas técnico-profissionais, liceus e institutos até 2000 alunos.",
    highlights: [
      "Tudo o que o Professional inclui",
      "Domínio próprio (ex.: www.minhaescola.ao)",
      "E-mail profissional com o domínio da escola",
    ],
  },
  enterprise: {
    pitch: "Para redes escolares e grandes complexos, com marca própria em todo o sistema.",
    idealFor: "Redes de escolas, universidades e institutos até 10 000 alunos.",
    highlights: [
      "Tudo o que o Business inclui",
      "Identidade visual avançada (logótipo e cores da escola)",
      "200 GB de arquivo e até 1000 pessoas na equipa",
    ],
  },
};

/** Módulos incluídos em todos os planos (o que o SIGA faz hoje). */
export const PLAN_MODULES: Array<{ title: string; items: string[] }> = [
  {
    title: "Secretaria",
    items: [
      "Matrículas e inscrições online",
      "Processo do aluno e encarregados",
      "Declarações, certificados e documentos",
    ],
  },
  {
    title: "Pedagógica",
    items: [
      "Ano lectivo, trimestres, classes, cursos e turmas",
      "Pautas, avaliações e médias",
      "Horários e frequência",
    ],
  },
  {
    title: "Financeiro",
    items: [
      "Propinas, matrículas e emolumentos",
      "Recibos e controlo de dívidas",
      "Exportação SAF-T para a AGT",
    ],
  },
  {
    title: "Pessoas e comunicação",
    items: [
      "Equipa com permissões por função",
      "Área do professor",
      "Comunicados à comunidade escolar",
    ],
  },
];

export function planDetail(code: string | null | undefined): PlanDetail | null {
  return code && code in PLAN_DETAILS ? PLAN_DETAILS[code as PlanDetailCode] : null;
}

/**
 * Configuração inicial de uma escola nova («primeiro acesso»).
 *
 * Como nos sistemas SaaS de gestão: a escola acabada de criar não abre num
 * painel cheio de cartões vazios, abre num assistente em ecrã próprio que a
 * leva, por ordem, pelo que é preciso para começar a trabalhar. Os ecrãs
 * agrupam os passos do guia de arranque (setup-guide.ts) — o estado vem
 * sempre da base, por isso sair a meio e voltar retoma onde ficou.
 *
 * Lógica pura (tests/school/first-run.test.ts).
 */
import type { SetupGuide, SetupStepId } from "./setup-guide";

export type FirstRunScreenId =
  | "boas-vindas"
  | "escola"
  | "calendario"
  | "estrutura"
  | "avaliacao-propinas"
  | "equipa"
  | "pronto";

export type FirstRunScreen = {
  id: FirstRunScreenId;
  title: string;
  lead: string;
  steps: SetupStepId[];
};

export const FIRST_RUN_SCREENS: FirstRunScreen[] = [
  {
    id: "boas-vindas",
    title: "Bem-vindo à sua escola",
    lead: "A escola foi criada vazia, só com o essencial. Em poucos passos fica pronta a matricular alunos.",
    steps: [],
  },
  {
    id: "escola",
    title: "Dados da escola",
    lead: "NIF, director(a) e contactos saem nos recibos, declarações e na exportação SAF-T.",
    steps: ["escola"],
  },
  {
    id: "calendario",
    title: "Ano lectivo e trimestres",
    lead: "Sugerimos as datas do calendário escolar do MED. Confirme com um clique ou ajuste.",
    steps: ["ano", "trimestres"],
  },
  {
    id: "estrutura",
    title: "Classes, cursos e turmas",
    lead: "Escolha o que a escola lecciona e o SIGA cria as classes numeradas, disciplinas, turmas e salas.",
    steps: ["estrutura", "disciplinas", "turmas"],
  },
  {
    id: "avaliacao-propinas",
    title: "Avaliação e propinas",
    lead: "Os pesos das notas fazem as pautas; os valores da propina geram as facturas de cada aluno.",
    steps: ["avaliacao", "propinas"],
  },
  {
    id: "equipa",
    title: "Equipa",
    lead: "Convide a secretaria, a tesouraria e os professores. Cada um vê só o que a função permite.",
    steps: ["equipa"],
  },
  {
    id: "pronto",
    title: "Tudo pronto",
    lead: "A escola está preparada. Pode matricular os primeiros alunos ou abrir a matrícula online.",
    steps: [],
  },
];

export function screenDone(screen: FirstRunScreen, guide: SetupGuide): boolean {
  if (!screen.steps.length) return false;
  return screen.steps.every((id) => guide.steps.find((s) => s.id === id)?.done ?? true);
}

/** Primeiro ecrã por fazer (para retomar); «boas-vindas» numa escola nova. */
export function resumeScreen(guide: SetupGuide): FirstRunScreenId {
  const working = FIRST_RUN_SCREENS.filter((s) => s.steps.length);
  if (working.every((s) => !screenDone(s, guide)) || guide.completed === 0) return "boas-vindas";
  return working.find((s) => !screenDone(s, guide))?.id ?? "pronto";
}

export type FirstRunPreference = "open" | "skipped" | "finished";

/**
 * Abrir o assistente automaticamente? Só ao Administrador, só numa escola
 * ainda «crua» (sem ano lectivo nem estrutura) e só se não o dispensou.
 */
export function shouldAutoOpenFirstRun(
  guide: SetupGuide | null | undefined,
  preference: FirstRunPreference,
  isAdmin: boolean,
): boolean {
  if (!guide || !isAdmin || guide.ready || preference !== "open") return false;
  const done = (id: SetupStepId) => guide.steps.find((s) => s.id === id)?.done ?? false;
  return !done("ano") && !done("estrutura");
}

export function firstRunStorageKey(schoolName: string) {
  return `siga:first-run:${schoolName}`;
}

export function readFirstRunPreference(key: string): FirstRunPreference {
  try {
    const value = localStorage.getItem(key);
    return value === "skipped" || value === "finished" ? value : "open";
  } catch {
    return "open";
  }
}

export function writeFirstRunPreference(key: string, value: FirstRunPreference) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

import type { NavMemoryItem } from "@/lib/navigation-memory";
import {
  CLASS_SEARCH_ROUTES,
  routeContextCandidates,
  type ContextCandidate,
} from "./context-resolver";

/**
 * SIGA Context Engine — memória de contexto (§9 do Prompt Master): ao voltar à
 * área académica sem turma, oferecer a turma ou disciplina onde o utilizador
 * estava. Só os ids saem dos recentes; o nome e a autorização vêm do servidor
 * (o mesmo lookup do menu), e nada de pessoal fica guardado.
 */

export type ResumeTarget = {
  path: string;
  search: Record<string, string>;
  candidates: ContextCandidate[];
};

/** Páginas que abrem uma turma ou disciplina pela URL. */
function opensAcademicContext(path: string): boolean {
  return CLASS_SEARCH_ROUTES.has(path) || path.startsWith("/pedagogica/turmas/");
}

/**
 * O destino recente mais novo que abria uma turma ou disciplina, diferente da
 * página actual. Os recentes vêm do mais novo para o mais antigo.
 */
export function pickResumeTarget(
  recents: readonly NavMemoryItem[],
  current: { path: string; search: Record<string, unknown> },
): ResumeTarget | null {
  const currentKey = routeContextCandidates(current.path, current.search)
    .map((c) => `${c.type}:${c.id}`)
    .join("|");
  for (const item of recents) {
    if (!opensAcademicContext(item.path)) continue;
    const search = Object.fromEntries(new URLSearchParams(item.search ?? ""));
    const candidates = routeContextCandidates(item.path, search).filter(
      (c) => c.type === "class" || c.type === "subject-offering",
    );
    if (candidates.length === 0) continue;
    // Já está nessa turma ou disciplina: nada a retomar.
    if (candidates.map((c) => `${c.type}:${c.id}`).join("|") === currentKey) return null;
    return { path: item.path, search, candidates };
  }
  return null;
}

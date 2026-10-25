import { academicIdsFromTrail } from "./academic-context-entries";
import type { ContextSearch } from "./context-registry";
import { CLASS_SEARCH_ROUTES } from "./context-resolver";
import type { ContextFrame } from "./types";

/**
 * SIGA Context Engine — breadcrumb a partir do contexto resolvido.
 *
 * O cabeçalho mostra, depois do título da página, as entidades validadas da
 * URL: «Área Pedagógica / 10.ª A / Matemática». Cada passo leva à mesma página
 * nesse nível (sem a disciplina, depois sem a turma), por isso o breadcrumb
 * nunca leva a uma página que o utilizador não abriu.
 */

export type ContextCrumb = { label: string; to?: string; search?: ContextSearch };

export type ContextCrumbs = {
  /** A página sem contexto, para o título deixar de ser o passo final. */
  page: { to: string; search: ContextSearch } | null;
  /** Um passo por entidade do caminho, do mais geral para o mais específico. */
  frames: ContextCrumb[];
};

export const NO_CONTEXT_CRUMBS: ContextCrumbs = { page: null, frames: [] };

/**
 * Passos do breadcrumb para o caminho resolvido da URL (o mesmo do menu da
 * entidade). Uma turma em foco num modal não chega aqui: não está na URL, e uma
 * ligação partilhada não a restauraria.
 */
export function contextCrumbs(
  trail: readonly ContextFrame[] | null | undefined,
  pathname: string,
  search: Record<string, unknown>,
): ContextCrumbs {
  if (!trail || trail.length === 0) return NO_CONTEXT_CRUMBS;
  // Páginas cujo contexto vem de `turma` (e `disciplina`) na URL, como no resolvedor.
  if (!CLASS_SEARCH_ROUTES.has(pathname)) {
    // A entidade está no caminho (/alunos/$id): sem nível acima na mesma página.
    return { page: null, frames: trail.map((frame) => ({ label: frame.label })) };
  }

  const kept: ContextSearch = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") kept[key] = value;
  }
  const at = (depth: number) => {
    const { turma, disciplina } = academicIdsFromTrail(trail.slice(0, depth));
    return {
      to: pathname,
      // Os filtros da página ficam; só mudam turma e disciplina. A pauta abre-se
      // sobre uma turma, por isso sai com ela.
      search: { ...kept, turma, disciplina, pauta: turma ? kept.pauta : undefined },
    };
  };
  return {
    page: at(0),
    frames: trail.map((frame, index) => ({ label: frame.label, ...at(index + 1) })),
  };
}

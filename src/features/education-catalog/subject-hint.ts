/**
 * Ajuda ao criar uma disciplina à mão: sugestões do catálogo e aviso de
 * duplicado antes de gravar. Não bloqueia — a escola pode ter razões para
 * ter «Matemática» e «Matemática A» —, mas diz o que já existe.
 */
import { GLOBAL_SUBJECTS, subjectDisplayName } from "./data/subjects";
import { resolveSubject } from "./normalize";

export type SubjectCreationHint = {
  /** Disciplina da escola que o catálogo considera a mesma. */
  duplicateOf: { name: string; code: string } | null;
  /** Nome no catálogo, quando o escrito difere (grafia, sinónimo, sigla). */
  catalogName: string | null;
  /** Código do catálogo, se o campo está vazio e o código está livre. */
  suggestedCode: string | null;
};

/** Nomes do catálogo, com o nome do país, para a lista de sugestões. */
export function subjectSuggestions(country: string) {
  return [...new Set(GLOBAL_SUBJECTS.map((s) => subjectDisplayName(s, country)))].sort((a, b) =>
    a.localeCompare(b, "pt"),
  );
}

export function subjectCreationHint(
  name: string,
  code: string,
  existing: ReadonlyArray<{ name: string; code?: string | null }>,
  country: string,
): SubjectCreationHint | null {
  const match = name.trim() ? resolveSubject(name) : null;
  if (!match) return null;
  const canonical = subjectDisplayName(match.subject, country);
  const duplicate = existing.find(
    (e) => resolveSubject(e.name)?.subject.code === match.subject.code,
  );
  const usedCodes = new Set(existing.map((e) => String(e.code ?? "").toUpperCase()));
  return {
    duplicateOf: duplicate ? { name: duplicate.name, code: String(duplicate.code ?? "") } : null,
    catalogName: name.trim() === canonical ? null : canonical,
    suggestedCode: !code.trim() && !usedCodes.has(match.subject.code) ? match.subject.code : null,
  };
}

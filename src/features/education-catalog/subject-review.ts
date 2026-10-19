/**
 * Revisão das disciplinas de uma escola contra o catálogo: duplicados e nomes
 * fora do padrão. Só sugere — quem decide é a escola, no diálogo.
 *
 * Conservador de propósito:
 *   - correcção de nome só para grafia (acentos, maiúsculas, espaços, uma letra
 *     trocada) ou para uma sigla usada como nome («MAT» → «Matemática»);
 *     sinónimos legítimos («Inglês» vs «Língua Inglesa») ficam como a escola
 *     os escreveu;
 *   - duplicados são mostrados, não juntos: juntar mexe em notas, presenças,
 *     planos de aula e inscrições, e precisa de uma operação transaccional
 *     própria na base.
 */
import { globalSubject, subjectDisplayName } from "./data/subjects";
import { resolveSubject, subjectCatalogKey } from "./normalize";
import { normalizeText } from "./search";

export type SchoolSubject = {
  id: string;
  code: string;
  name: string;
  /** `subjects.catalog_subject_code` (migração 20261012120000); null = por ligar. */
  catalogCode?: string | null;
};

export type ReviewedSubject = SchoolSubject & {
  /** Turmas, currículos e professores ligados. */
  usage: number;
  /** O nome é só uma sigla: a correspondência pode estar errada («EM»). */
  ambiguous: boolean;
};

export type DuplicateGroup = {
  catalogCode: string;
  canonicalName: string;
  members: ReviewedSubject[];
  /** A mais usada (empate: a que já tem o nome canónico, depois o código). */
  keepId: string;
};

export type RenameSuggestion = {
  id: string;
  code: string;
  from: string;
  to: string;
  reason: "grafia" | "sigla" | "letra trocada";
  /** Marcada por omissão no diálogo. As siglas não: podem querer dizer outra coisa. */
  preselected: boolean;
};

export type LinkSuggestion = {
  id: string;
  code: string;
  name: string;
  catalogCode: string;
  catalogName: string;
};

export type SubjectReview = {
  country: string;
  total: number;
  matched: number;
  duplicates: DuplicateGroup[];
  renames: RenameSuggestion[];
  /** Sem correspondência no catálogo nem ligação (próprias da escola, ou por catalogar). */
  unmatched: SchoolSubject[];
  /** A base já tem `subjects.catalog_subject_code` (migração aplicada). */
  linkAvailable: boolean;
  /** Já ligadas ao catálogo. */
  linked: number;
  /**
   * Por ligar, reconhecidas pelo nome exacto (nome, nome local ou sinónimo).
   * Siglas soltas e letras trocadas não: primeiro corrige-se o nome.
   */
  toLink: LinkSuggestion[];
};

/** País do sistema de ensino a partir da moeda da escola (o esquema não tem país). */
export function countryFromCurrency(currency: string | null | undefined) {
  switch ((currency ?? "").toUpperCase()) {
    case "MZN":
      return "MZ";
    case "EUR":
      return "PT";
    default:
      return "AO";
  }
}

const isAbbreviation = (name: string) => /^[A-ZÀ-Ý0-9.]{2,6}$/.test(name.trim());

function renameFor(subject: SchoolSubject, canonical: string, via: "exact" | "typo") {
  const name = subject.name.trim();
  if (name === canonical) return null;
  if (via === "typo") return "letra trocada" as const;
  if (normalizeText(name) === normalizeText(canonical)) return "grafia" as const;
  if (isAbbreviation(name)) return "sigla" as const;
  return null;
}

export function reviewSubjects(
  subjects: readonly SchoolSubject[],
  usage: Readonly<Record<string, number>>,
  country: string,
  linkAvailable = false,
): SubjectReview {
  const byCatalog = new Map<string, ReviewedSubject[]>();
  const renames: RenameSuggestion[] = [];
  const unmatched: SchoolSubject[] = [];
  const toLink: LinkSuggestion[] = [];
  let matched = 0;
  let linked = 0;

  for (const s of subjects) {
    const linkedTo = s.catalogCode ? globalSubject(s.catalogCode) : null;
    if (linkedTo) linked += 1;
    else {
      const key = subjectCatalogKey(s.name);
      if (key) {
        toLink.push({
          id: s.id,
          code: s.code,
          name: s.name,
          catalogCode: key,
          catalogName: subjectDisplayName(globalSubject(key)!, country),
        });
      }
    }
    // Duplicados e nomes só pelo nome: uma ligação feita à mão («Matemática A»
    // → MAT) diz de que disciplina se trata, não que é a mesma que «Matemática».
    const match = resolveSubject(s.name);
    if (!match) {
      if (!linkedTo) unmatched.push(s);
      continue;
    }
    matched += 1;
    const reviewed = { ...s, usage: usage[s.id] ?? 0, ambiguous: isAbbreviation(s.name) };
    const list = byCatalog.get(match.subject.code) ?? [];
    list.push(reviewed);
    byCatalog.set(match.subject.code, list);
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [code, members] of byCatalog) {
    const canonical = subjectDisplayName(globalSubject(code)!, country);
    if (members.length > 1) {
      const keep = [...members].sort(
        (a, b) =>
          b.usage - a.usage ||
          Number(b.name.trim() === canonical) - Number(a.name.trim() === canonical) ||
          a.code.localeCompare(b.code),
      )[0]!;
      duplicates.push({ catalogCode: code, canonicalName: canonical, members, keepId: keep.id });
      continue;
    }
    // Num grupo de duplicados não se renomeia: dois com o mesmo nome confundem mais.
    const only = members[0]!;
    const via = resolveSubject(only.name)!.via;
    const reason = renameFor(only, canonical, via);
    if (reason) {
      renames.push({
        id: only.id,
        code: only.code,
        from: only.name,
        to: canonical,
        reason,
        preselected: reason !== "sigla",
      });
    }
  }

  duplicates.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "pt"));
  renames.sort((a, b) => a.to.localeCompare(b.to, "pt"));
  unmatched.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  toLink.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return {
    country,
    total: subjects.length,
    matched,
    duplicates,
    renames,
    unmatched,
    linkAvailable,
    linked,
    toLink,
  };
}

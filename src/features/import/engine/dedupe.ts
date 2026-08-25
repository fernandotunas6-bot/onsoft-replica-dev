import { foldForCompare, normalizePhoneDigits } from "./normalize";

export type DuplicateMatch<T> = {
  record: T;
  score: number;
  reasons: string[];
};

/**
 * Pontuação de duplicado de pessoa — mesmos pesos e limiar (0.45) que
 * `findPersonDuplicates` em people/server.ts, para que a importação nunca
 * decida "é duplicado" com um critério diferente do resto do SIGA.
 */
export function scorePersonDuplicate(
  candidate: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    national_id?: string | null;
    date_of_birth?: string | null;
  },
  existing: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    national_id?: string | null;
    date_of_birth?: string | null;
  },
): { score: number; reasons: string[] } {
  const name = foldForCompare(candidate.full_name);
  const email = foldForCompare(candidate.email);
  const phone = normalizePhoneDigits(candidate.phone);
  const nif = foldForCompare(candidate.national_id);
  const birth = candidate.date_of_birth ?? "";

  let score = 0;
  const reasons: string[] = [];
  const existingName = foldForCompare(existing.full_name);
  if (name && existingName === name) {
    score += 0.7;
    reasons.push("nome exacto");
  } else if (name && existingName.includes(name)) {
    score += 0.45;
    reasons.push("nome semelhante");
  }
  if (email && foldForCompare(existing.email) === email) {
    score += 0.35;
    reasons.push("email");
  }
  if (phone && normalizePhoneDigits(existing.phone) === phone) {
    score += 0.3;
    reasons.push("telefone");
  }
  if (nif && foldForCompare(existing.national_id) === nif) {
    score += 0.4;
    reasons.push("documento/NIF");
  }
  if (birth && existing.date_of_birth === birth) {
    score += 0.2;
    reasons.push("data de nascimento");
  }
  return { score: Math.min(score, 1), reasons };
}

export const PERSON_DUPLICATE_THRESHOLD = 0.45;

/** Encontra o melhor candidato a duplicado entre uma lista de pessoas existentes. */
export function findBestPersonMatch<
  T extends {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    national_id?: string | null;
    date_of_birth?: string | null;
  },
>(
  candidate: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    national_id?: string | null;
    date_of_birth?: string | null;
  },
  existingPeople: T[],
): DuplicateMatch<T> | null {
  let best: DuplicateMatch<T> | null = null;
  for (const existing of existingPeople) {
    const { score, reasons } = scorePersonDuplicate(candidate, existing);
    if (score >= PERSON_DUPLICATE_THRESHOLD && (!best || score > best.score)) {
      best = { record: existing, score, reasons };
    }
  }
  return best;
}

/**
 * Correspondência aproximada de nomes de entidade (turma, disciplina, sala,
 * curso...) — para nunca criar "7A" e "7ª A" como duas turmas diferentes.
 * Compara por forma canónica (sem ordinal, sem espaços, minúsculas).
 */
export function canonicalEntityKey(value: unknown): string {
  return foldForCompare(value)
    .replace(/[ºª°]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function findBestEntityMatch<T>(
  candidateName: string,
  existingEntities: T[],
  nameOf: (entity: T) => string,
): T | null {
  const key = canonicalEntityKey(candidateName);
  if (!key) return null;
  for (const entity of existingEntities) {
    if (canonicalEntityKey(nameOf(entity)) === key) return entity;
  }
  return null;
}

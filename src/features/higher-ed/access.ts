/**
 * Seriação do acesso (Decreto Presidencial 5/19): candidatos a um curso
 * ordenados pela nota do exame de acesso; os primeiros N ficam dentro das
 * vagas. Os já aceites ocupam vaga primeiro. Sem nota não entram na seriação.
 * Empate: quem se candidatou primeiro.
 */
export type AccessCandidate = {
  id: string;
  status: string;
  score: number | null;
  createdAt: string;
};

export type AccessPlacement = "aceite" | "dentro_das_vagas" | "suplente" | "sem_nota" | "excluido";

export type RankedCandidate<C extends AccessCandidate> = C & {
  position: number | null;
  placement: AccessPlacement;
};

export function rankAccessCandidates<C extends AccessCandidate>(
  candidates: C[],
  seats: number,
  minimumScore = 10,
): RankedCandidate<C>[] {
  const accepted = candidates.filter((c) => c.status === "accepted");
  const pending = candidates.filter((c) => c.status === "pending");
  const scored = pending
    .filter((c) => c.score !== null)
    .sort((a, b) => b.score! - a.score! || a.createdAt.localeCompare(b.createdAt));
  let free = seats > 0 ? Math.max(0, seats - accepted.length) : Number.POSITIVE_INFINITY;
  const ranked: RankedCandidate<C>[] = accepted.map((c) => ({
    ...c,
    position: null,
    placement: "aceite" as const,
  }));
  scored.forEach((candidate, index) => {
    let placement: AccessPlacement;
    if (candidate.score! < minimumScore) placement = "excluido";
    else if (free > 0) {
      placement = "dentro_das_vagas";
      free -= 1;
    } else placement = "suplente";
    ranked.push({ ...candidate, position: index + 1, placement });
  });
  for (const candidate of pending.filter((c) => c.score === null)) {
    ranked.push({ ...candidate, position: null, placement: "sem_nota" });
  }
  return ranked;
}

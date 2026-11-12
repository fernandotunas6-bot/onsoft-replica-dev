/**
 * Lista de espera por turma: regras puras (testadas em tests/enrollment/waitlist.test.ts).
 * A fila é por ordem de chegada; a vaga é capacidade − matrículas activas ou pendentes,
 * igual a `private.enroll_student`.
 */

export type WaitlistEntry = {
  id: string;
  classGroupId: string;
  studentId: string;
  createdAt: string;
};

/** Código e mensagem com que `enroll_student` recusa uma turma cheia. */
export function isClassFullError(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error && (error.code === "23514" || /atingiu a capacidade/i.test(error.message ?? "")),
  );
}

export function freeSeats(capacity: number | null | undefined, occupied: number) {
  if (!capacity || capacity <= 0) return 0;
  return Math.max(capacity - occupied, 0);
}

/** Posição (1, 2, …) de cada entrada na fila da sua turma, por ordem de chegada. */
export function queuePositions(entries: readonly WaitlistEntry[]) {
  const byClass = new Map<string, WaitlistEntry[]>();
  for (const entry of entries) {
    const list = byClass.get(entry.classGroupId) ?? [];
    list.push(entry);
    byClass.set(entry.classGroupId, list);
  }
  const positions = new Map<string, number>();
  for (const list of byClass.values()) {
    list
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .forEach((entry, index) => positions.set(entry.id, index + 1));
  }
  return positions;
}

/**
 * Pode colocar-se esta entrada? Só a primeira da fila, e só com vaga. Assim a ordem de
 * chegada respeita-se: com uma vaga, só o primeiro entra.
 */
export function canPlace(position: number, seats: number) {
  return seats > 0 && position <= seats;
}

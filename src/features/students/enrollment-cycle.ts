/**
 * Ciclos de matrícula (pedido do dono, 2026-10-10).
 *
 * Uma matrícula nova só se faz no ciclo próprio de matrículas e nunca durante um
 * período de aulas (os `terms` do ano lectivo). A Administração pode matricular
 * fora do ciclo, com motivo, que fica registado.
 *
 * - Com ciclos definidos (Definições › Matrícula): aberto se hoje cabe num ciclo
 *   e não está dentro de um período de aulas.
 * - Sem ciclos definidos: aberto fora dos períodos de aulas.
 *
 * Mudar de turma dentro do ano e confirmar uma matrícula pendente não são
 * matrículas novas: não passam por aqui. Funções puras, partilhadas pelo
 * servidor e pelo ecrã.
 */

export type EnrollmentCycle = { label: string; opens_on: string; closes_on: string };
export type TeachingPeriod = { name: string; starts_on: string; ends_on: string };

export type EnrollmentWindow =
  | { open: true; cycle: EnrollmentCycle | null; message: string }
  | { open: false; message: string; next: EnrollmentCycle | null };

/** Motivo mínimo para matricular fora do ciclo. */
export const OUTSIDE_CYCLE_REASON_MIN = 5;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const formatDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function formatCycle(cycle: EnrollmentCycle) {
  return `${cycle.label} (${formatDate(cycle.opens_on)} a ${formatDate(cycle.closes_on)})`;
}

/** Lê os ciclos guardados, descartando os inválidos; ordenados pela abertura. */
export function parseEnrollmentCycles(value: unknown): EnrollmentCycle[] {
  const raw =
    value && typeof value === "object" && Array.isArray((value as { cycles?: unknown }).cycles)
      ? ((value as { cycles: unknown[] }).cycles ?? [])
      : [];
  return raw
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return {
        label: typeof row["label"] === "string" ? row["label"].trim().slice(0, 80) : "",
        opens_on: typeof row["opens_on"] === "string" ? row["opens_on"] : "",
        closes_on: typeof row["closes_on"] === "string" ? row["closes_on"] : "",
      };
    })
    .filter(
      (cycle) =>
        ISO_DATE.test(cycle.opens_on) &&
        ISO_DATE.test(cycle.closes_on) &&
        cycle.opens_on <= cycle.closes_on,
    )
    .map((cycle) => ({ ...cycle, label: cycle.label || "Matrículas" }))
    .sort((a, b) => a.opens_on.localeCompare(b.opens_on));
}

/** Erros de um conjunto de ciclos a gravar (vazio se está bom). */
export function validateEnrollmentCycles(
  cycles: EnrollmentCycle[],
  periods: TeachingPeriod[],
): string[] {
  const errors: string[] = [];
  const sorted = [...cycles].sort((a, b) => a.opens_on.localeCompare(b.opens_on));
  sorted.forEach((cycle, index) => {
    if (!ISO_DATE.test(cycle.opens_on) || !ISO_DATE.test(cycle.closes_on)) {
      errors.push(`${cycle.label || "Ciclo"}: datas inválidas.`);
      return;
    }
    if (cycle.opens_on > cycle.closes_on) {
      errors.push(`${cycle.label}: o fecho tem de ser depois da abertura.`);
    }
    const previous = sorted[index - 1];
    if (previous && cycle.opens_on <= previous.closes_on) {
      errors.push(`${cycle.label} sobrepõe-se a ${previous.label}.`);
    }
    for (const period of periods) {
      if (cycle.opens_on <= period.ends_on && cycle.closes_on >= period.starts_on) {
        errors.push(
          `${cycle.label} coincide com o ${period.name} (${formatDate(period.starts_on)} a ${formatDate(period.ends_on)}): as matrículas não decorrem em período de aulas.`,
        );
      }
    }
  });
  return errors;
}

/** Estado das matrículas num dia. */
export function enrollmentWindow(input: {
  today: string;
  cycles: EnrollmentCycle[];
  periods: TeachingPeriod[];
}): EnrollmentWindow {
  const next = input.cycles.find((cycle) => cycle.opens_on > input.today) ?? null;
  const nextText = next
    ? ` Próximo ciclo: ${formatCycle(next)}.`
    : input.cycles.length
      ? " Não há outro ciclo marcado."
      : "";
  const period = input.periods.find(
    (item) => item.starts_on <= input.today && input.today <= item.ends_on,
  );
  if (period) {
    return {
      open: false,
      next,
      message: `Matrículas fechadas: decorre o ${period.name} (${formatDate(period.starts_on)} a ${formatDate(period.ends_on)}).${nextText}`,
    };
  }
  if (!input.cycles.length) {
    return { open: true, cycle: null, message: "Matrículas abertas (fora do período de aulas)." };
  }
  const cycle = input.cycles.find(
    (item) => item.opens_on <= input.today && input.today <= item.closes_on,
  );
  if (cycle) {
    return {
      open: true,
      cycle,
      message: `Matrículas abertas: ${formatCycle(cycle)}.`,
    };
  }
  return { open: false, next, message: `Fora do período de matrículas.${nextText}` };
}

/**
 * Decide uma matrícula nova: aberto, ou Administração com motivo. Devolve null se
 * pode avançar, ou a mensagem de recusa.
 */
export function outsideCycleRefusal(input: {
  window: EnrollmentWindow;
  canOverride: boolean;
  reason?: string | null | undefined;
}): string | null {
  if (input.window.open) return null;
  if (!input.canOverride) {
    return `${input.window.message} Só a Administração pode matricular fora do ciclo.`;
  }
  if ((input.reason?.trim().length ?? 0) < OUTSIDE_CYCLE_REASON_MIN) {
    return `${input.window.message} Para matricular fora do ciclo, indique o motivo.`;
  }
  return null;
}

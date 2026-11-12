import { assertValidScheduleTime, scheduleTimeSeconds } from "./validation";
import type { LessonWindow } from "./autoSchedule";
export type ProposalShift = {
  id: string;
  name: string;
  code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  active_days: number[];
  slots: Array<{
    starts_at: string;
    ends_at: string;
    is_break: boolean;
    deleted_at?: string | null;
  }>;
};

/** Só os blocos configurados e activos. Não inventar tempos ou pausas. */
export function proposalGrid(shift: ProposalShift | undefined): {
  windows: LessonWindow[];
  weekdays: number[];
  error: string | null;
} {
  const fail = (error: string) => ({ windows: [], weekdays: [], error });
  if (!shift || shift.status !== "active")
    return fail("Seleccione um turno activo com tempos configurados.");
  try {
    assertValidScheduleTime(1, shift.starts_at, shift.ends_at);
  } catch {
    return fail("Reveja o início e o fim do turno.");
  }
  const weekdays = [...new Set(shift.active_days)].sort((a, b) => a - b);
  if (!weekdays.length || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7))
    return fail("Configure os dias lectivos do turno.");
  const blocks = shift.slots.filter((s) => !s.deleted_at);
  // Validar antes de ordenar/converter: dados inválidos devem produzir estado de erro.
  for (const block of blocks) {
    try {
      assertValidScheduleTime(1, block.starts_at, block.ends_at);
    } catch {
      return fail("Há um tempo inválido no turno. Reveja a configuração.");
    }
  }
  blocks.sort((a, b) => scheduleTimeSeconds(a.starts_at) - scheduleTimeSeconds(b.starts_at));
  for (const [i, block] of blocks.entries()) {
    if (
      scheduleTimeSeconds(block.starts_at) < scheduleTimeSeconds(shift.starts_at) ||
      scheduleTimeSeconds(block.ends_at) > scheduleTimeSeconds(shift.ends_at) ||
      (i > 0 && scheduleTimeSeconds(block.starts_at) < scheduleTimeSeconds(blocks[i - 1]!.ends_at))
    )
      return fail("Os tempos do turno sobrepõem-se ou estão fora do turno.");
  }
  const windows = blocks
    .filter((b) => !b.is_break)
    .map((b) => ({ startsAt: b.starts_at, endsAt: b.ends_at }));
  return windows.length
    ? { windows, weekdays, error: null }
    : fail("Configure os tempos de aula e os intervalos deste turno antes de gerar.");
}

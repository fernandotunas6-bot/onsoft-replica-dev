import type { AgendaEvent } from "./agenda";
import { agendaRangeSchema, type AgendaRange } from "./agenda-schemas";

/** FullCalendar Standard's function event source; authentication stays in SIGA. */
export function fullCalendarAcademicSource(
  load: (range: AgendaRange) => Promise<AgendaEvent[]>,
  filters: Omit<AgendaRange, "start" | "end"> = {},
) {
  return async (info: { startStr: string; endStr: string; timeZone: string }) => {
    // FullCalendar requests dates in the configured calendar zone. Reject browser
    // local/UTC zones instead of silently shifting Angola's civil dates.
    if (info.timeZone !== "Africa/Luanda")
      throw new Error("Configure o calendário com o fuso Africa/Luanda.");
    const range = agendaRangeSchema.parse({
      ...filters,
      start: info.startStr.slice(0, 10),
      end: info.endStr.slice(0, 10),
    });
    return load(range);
  };
}

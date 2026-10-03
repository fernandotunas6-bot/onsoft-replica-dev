/** Calendar-day calculation; never hardcode 22 working days into payroll. */
export type WorkCalendar = {
  year: number;
  month: number; // Gregorian month, 1..12
  weekdays: number[]; // JS UTC weekday, Sunday=0
  holidays: string[]; // YYYY-MM-DD, institution-approved dates
  exceptionalWorkingDays?: string[];
  exceptionalDaysOff?: string[];
  referenceWorkingDays?: number; // e.g. 22, display only
};
export type WorkCalendarSummary = {
  workingDates: string[];
  workingDays: number;
  referenceWorkingDays: number | null;
  differenceFromReference: number | null;
};
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  if (!dateOnly.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function calculateWorkCalendar(input: WorkCalendar): WorkCalendarSummary {
  if (
    !Number.isInteger(input.year) ||
    input.year < 1900 ||
    input.year > 2200 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  ) {
    throw new Error("Mês ou ano inválido.");
  }
  if (
    !input.weekdays.length ||
    input.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(input.weekdays).size !== input.weekdays.length
  ) {
    throw new Error("Dias da semana inválidos.");
  }
  if (
    input.referenceWorkingDays !== undefined &&
    (!Number.isInteger(input.referenceWorkingDays) ||
      input.referenceWorkingDays < 0 ||
      input.referenceWorkingDays > 31)
  ) {
    throw new Error("Referência mensal inválida.");
  }
  const monthPrefix =
    String(input.year).padStart(4, "0") + "-" + String(input.month).padStart(2, "0") + "-";
  const allExceptions = [
    ...input.holidays,
    ...(input.exceptionalWorkingDays ?? []),
    ...(input.exceptionalDaysOff ?? []),
  ];
  if (allExceptions.some((day) => !validDate(day) || !day.startsWith(monthPrefix))) {
    throw new Error("Exceção de calendário inválida ou fora do mês.");
  }
  const holiday = new Set(input.holidays);
  const working = new Set(input.exceptionalWorkingDays ?? []);
  const off = new Set(input.exceptionalDaysOff ?? []);
  if ([...working].some((day) => holiday.has(day) || off.has(day))) {
    throw new Error("Um dia não pode ser simultaneamente útil e não útil.");
  }
  const dates: string[] = [];
  const last = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
  for (let day = 1; day <= last; day += 1) {
    const value = monthPrefix + String(day).padStart(2, "0");
    const weekday = new Date(value + "T00:00:00Z").getUTCDay();
    if (
      !holiday.has(value) &&
      !off.has(value) &&
      (working.has(value) || input.weekdays.includes(weekday))
    ) {
      dates.push(value);
    }
  }
  return {
    workingDates: dates,
    workingDays: dates.length,
    referenceWorkingDays: input.referenceWorkingDays ?? null,
    differenceFromReference:
      input.referenceWorkingDays == null ? null : dates.length - input.referenceWorkingDays,
  };
}

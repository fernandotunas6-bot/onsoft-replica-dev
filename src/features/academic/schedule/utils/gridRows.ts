import type { ScheduleSlot } from "../types";

const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;

function timeValue(value: string) {
  const [hours = "00", minutes = "00", seconds = "00"] = value.split(":");
  return `${hours}:${minutes}:${seconds}`;
}

export function gridRows(slots: ScheduleSlot[]) {
  // Preserve every lesson when multiple groups share a time range.
  // A single .find() silently hid concurrent lessons in teacher/room views.
  const ranges = Array.from(
    new Set(slots.map((slot) => `${timeValue(slot.starts_at)} – ${timeValue(slot.ends_at)}`)),
  ).sort();

  return ranges.flatMap((range) => {
    const [start, end] = range.split(" – ");
    const matching = weekdays.map((_, index) =>
      slots
        .filter(
          (slot) =>
            slot.weekday === index + 1 &&
            timeValue(slot.starts_at) === start &&
            timeValue(slot.ends_at) === end,
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    const rowCount = Math.max(0, ...matching.map((day) => day.length));
    return Array.from({ length: rowCount }, (_, occurrence) => ({
      key: `${range}:${occurrence}`,
      range: occurrence === 0 ? range : `${range} · ${occurrence + 1}`,
      cells: matching.map((day) => day[occurrence]),
    }));
  });
}


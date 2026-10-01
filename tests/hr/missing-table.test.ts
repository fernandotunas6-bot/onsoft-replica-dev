import { describe, expect, it } from "vitest";
import { isMissingHrTable } from "@/features/hr/missing-table";

describe("missing HR table fallback", () => {
  it.each(["42P01", "PGRST205"])("recognizes missing table code %s", (code) => {
    expect(isMissingHrTable({ code })).toBe(true);
  });

  it.each([
    { code: "42501", message: "permission denied for table hr_employments" },
    { code: "42501", message: "permission denied for table hr_contract_remuneration_policies" },
    { code: "57014", message: "hr_payroll_runs statement timeout" },
    { code: "XX000", message: "hr_payment_destinations query failed" },
    { code: "PGRST202", message: "Could not find the function in the schema cache" },
    { code: "42703", message: "column hr_teacher_lesson_occurrences.bad does not exist" },
    { message: "hr_absence_events network unavailable" },
    null,
  ])("does not turn another failure into empty data: %j", (error) => {
    expect(isMissingHrTable(error)).toBe(false);
  });
});

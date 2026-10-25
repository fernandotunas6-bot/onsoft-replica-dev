import { describe, expect, it } from "vitest";
import { pickCurrentEnrollment } from "@/features/students/current-enrollment";

const TODAY = "2027-08-20";

describe("matrícula mostrada na ficha e na lista", () => {
  it("com a do ano em curso e a antecipada, mostra a do ano em curso", () => {
    const rows = [
      { id: "2027", status: "active", enrolled_on: "2027-09-01" },
      { id: "2026", status: "active", enrolled_on: "2026-09-10" },
    ];
    expect(pickCurrentEnrollment(rows, TODAY)?.id).toBe("2026");
    expect(pickCurrentEnrollment([...rows].reverse(), TODAY)?.id).toBe("2026");
  });

  it("só com a antecipada, mostra-a", () => {
    const rows = [
      { id: "anulada", status: "cancelled", enrolled_on: "2026-09-10" },
      { id: "2027", status: "active", enrolled_on: "2027-09-01" },
    ];
    expect(pickCurrentEnrollment(rows, TODAY)?.id).toBe("2027");
  });

  it("activa antes de pendente; sem correntes, a mais recente", () => {
    expect(
      pickCurrentEnrollment(
        [
          { id: "p", status: "pending", enrolled_on: "2026-10-01" },
          { id: "a", status: "active", enrolled_on: "2026-09-10" },
        ],
        TODAY,
      )?.id,
    ).toBe("a");
    expect(
      pickCurrentEnrollment(
        [
          { id: "velha", status: "completed", enrolled_on: "2025-09-10" },
          { id: "nova", status: "cancelled", enrolled_on: "2026-09-10" },
        ],
        TODAY,
      )?.id,
    ).toBe("nova");
    expect(pickCurrentEnrollment([], TODAY)).toBeNull();
  });
});

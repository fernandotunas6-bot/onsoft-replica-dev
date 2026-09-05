import { describe, expect, it } from "vitest";

import {
  buildPayflowBankAccount,
  derivePayflowPaymentPin,
  kzToMinorUnits,
  mapEnrollmentStatusToPayflow,
  mapInvoiceStatusToPayflow,
  toPayflowSchoolCode,
  toPayflowStudentCode,
} from "@/features/finance/payflow-education-sync";

describe("payflow-education-sync", () => {
  it("normalizes student codes to 7 digits", () => {
    expect(toPayflowStudentCode("2024001", "any")).toBe("2024001");
    expect(toPayflowStudentCode("AB-12", "any")).toBe("0000012");
    expect(toPayflowStudentCode("123456789", "any")).toBe("3456789");
    expect(toPayflowStudentCode(null, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toMatch(/^\d{7}$/);
  });

  it("derives a stable 6-digit payment pin", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(derivePayflowPaymentPin(id)).toBe(derivePayflowPaymentPin(id));
    expect(derivePayflowPaymentPin(id)).toMatch(/^\d{6}$/);
  });

  it("maps enrollment and invoice statuses", () => {
    expect(mapEnrollmentStatusToPayflow("applicant", null)).toBe("pending");
    expect(mapEnrollmentStatusToPayflow("active", "active")).toBe("active");
    expect(mapEnrollmentStatusToPayflow("graduated", null)).toBe("completed");
    expect(mapInvoiceStatusToPayflow("paid", "2020-01-01")).toBe("paid");
    expect(mapInvoiceStatusToPayflow("issued", "2020-01-01", "2026-01-01")).toBe("overdue");
    expect(mapInvoiceStatusToPayflow("open", "2099-01-01", "2026-01-01")).toBe("open");
  });

  it("converts Kz to minor units and builds bank accounts", () => {
    expect(kzToMinorUnits(1500.5)).toBe(150050);
    expect(kzToMinorUnits(0)).toBe(0);
    expect(
      buildPayflowBankAccount({
        schoolId: "school-1",
        accountHolder: "Escola Demo",
        bankName: "BAI",
        iban: "AO06 0040 0000 0725 9770 1015 2",
      }),
    ).toMatchObject({
      bank_name: "BAI",
      is_primary: true,
      currency: "AOA",
    });
    expect(
      buildPayflowBankAccount({
        schoolId: "school-1",
        accountHolder: "",
        bankName: "BAI",
        iban: "AO06",
      }),
    ).toBeNull();
  });

  it("builds school public codes", () => {
    expect(toPayflowSchoolCode("id", "Colégio Dom Afonso")).toBe("COLEGIODOMAF");
    expect(toPayflowSchoolCode("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "")).toMatch(/^SCH/);
  });
});

import { describe, expect, it } from "vitest";
import { importModuleOptions } from "@/features/import/schemas";
import { IMPORTER_TARGET_TABLES } from "@/features/import/engine/governance";
import { FIELD_CATALOG } from "@/features/import/engine/field-catalog";

describe("Import governance contract", () => {
  it("declares governed targets for every official import module", () => {
    expect(Object.keys(IMPORTER_TARGET_TABLES).sort()).toEqual([...importModuleOptions].sort());
    for (const module of importModuleOptions) {
      expect(IMPORTER_TARGET_TABLES[module].length).toBeGreaterThan(0);
    }
  });

  it("never grants the funcionarios importer access to institutional auth roles", () => {
    expect(IMPORTER_TARGET_TABLES.funcionarios).not.toContain("person_roles");
    expect(IMPORTER_TARGET_TABLES.funcionarios).toEqual(
      expect.arrayContaining(["people", "hr_positions", "hr_employments"]),
    );
  });

  it("keeps finance and security boundaries explicit", () => {
    expect(IMPORTER_TARGET_TABLES.pagamentos).toEqual(
      expect.arrayContaining(["finance_invoices", "finance_receipts"]),
    );
    expect(IMPORTER_TARGET_TABLES.dividas).toEqual(
      expect.arrayContaining(["finance_contracts", "finance_invoices"]),
    );

    const forbidden = [
      "school_integration_secrets",
      "calendar_feed_tokens",
      "verification_otps",
      "audit_logs",
      "saas_audit_logs",
      "import_audits",
      "person_roles",
    ];

    for (const targets of Object.values(IMPORTER_TARGET_TABLES)) {
      for (const forbiddenTable of forbidden) {
        expect(targets).not.toContain(forbiddenTable);
      }
    }
  });

  it("requires HR hire date in the human template contract", () => {
    const hireDate = FIELD_CATALOG.funcionarios.fields.find((field) => field.key === "hire_date");
    expect(hireDate).toBeDefined();
    expect(hireDate?.required).toBe(true);
  });
});

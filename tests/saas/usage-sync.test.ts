import { describe, expect, it } from "vitest";
import { buildTenantUsageRows } from "@/features/saas/usage-sync";

describe("buildTenantUsageRows", () => {
  it("filtra escolas sem tenant_id e mapeia contagens correctamente", () => {
    const schools = [
      { id: "s1", tenant_id: "t1" },
      { id: "s2", tenant_id: null },
      { id: "s3", tenant_id: "t2" },
    ];

    const students = new Map([
      ["s1", 150],
      ["s3", 50],
    ]);
    const staff = new Map([
      ["s1", 15],
      ["s2", 5],
      // s3 não está no mapa, deve retornar 0
    ]);

    const rows = buildTenantUsageRows(schools, students, staff);

    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      { tenant_id: "t1", school_id: "s1", active_students_count: 150, active_staff_count: 15 },
      { tenant_id: "t2", school_id: "s3", active_students_count: 50, active_staff_count: 0 },
    ]);
  });
});

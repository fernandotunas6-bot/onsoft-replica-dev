import { describe, expect, it } from "vitest";
import {
  assignGuardianInputSchema,
  mapSgaGuardianRelationship,
  changeStudentStatusInputSchema,
  enrollNewStudentInputSchema,
  removeGuardianInputSchema,
  searchStudentsInputSchema,
  studentStatusOptions,
  updateEnrollmentAttendanceInputSchema,
  updateStudentProfileInputSchema,
  averagePercent,
} from "@/features/students/schemas";

const uuid = "11111111-1111-1111-1111-111111111111";

describe("searchStudentsInputSchema", () => {
  it("defaults limit and offset when omitted", () => {
    const result = searchStudentsInputSchema.parse({});
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(0);
  });

  it("rejects a negative offset", () => {
    expect(searchStudentsInputSchema.safeParse({ offset: -1 }).success).toBe(false);
  });
});

describe("enrollNewStudentInputSchema", () => {
  it("validates both the person and the registration number together", () => {
    const result = enrollNewStudentInputSchema.safeParse({
      person: { full_name: "Ana Domingos" },
      registrationNumber: "2026-0001",
    });
    expect(result.success).toBe(true);
  });

  it("fails when the nested person is invalid, even if the registration number is fine", () => {
    const result = enrollNewStudentInputSchema.safeParse({
      person: { full_name: "A" },
      registrationNumber: "2026-0001",
    });
    expect(result.success).toBe(false);
  });
});

describe("changeStudentStatusInputSchema", () => {
  it("only accepts the documented status values", () => {
    for (const status of studentStatusOptions) {
      expect(
        changeStudentStatusInputSchema.safeParse({ studentId: uuid, newStatus: status }).success,
      ).toBe(true);
    }
    expect(
      changeStudentStatusInputSchema.safeParse({ studentId: uuid, newStatus: "expelled" }).success,
    ).toBe(false);
  });
});

describe("updateStudentProfileInputSchema", () => {
  it("requires a positive expectedVersion for optimistic concurrency", () => {
    expect(
      updateStudentProfileInputSchema.safeParse({
        personId: uuid,
        expectedVersion: 0,
        fullName: "Ana Domingos",
      }).success,
    ).toBe(false);
    expect(
      updateStudentProfileInputSchema.safeParse({
        personId: uuid,
        expectedVersion: 3,
        fullName: "Ana Domingos",
      }).success,
    ).toBe(true);
  });

  it("accepts geography when updating the student person profile", () => {
    const parsed = updateStudentProfileInputSchema.parse({
      personId: uuid,
      expectedVersion: 3,
      fullName: "Ana Domingos",
      province: "Huíla",
      municipality: "Lubango",
      commune: "Arimba",
      address: "Bairro Comercial",
    });
    expect(parsed.province).toBe("Huíla");
    expect(parsed.municipality).toBe("Lubango");
  });
});

describe("assignGuardianInputSchema", () => {
  const guardianId = "22222222-2222-2222-2222-222222222222";

  it("requires student, person and relationship", () => {
    expect(assignGuardianInputSchema.safeParse({}).success).toBe(false);
    expect(
      assignGuardianInputSchema.parse({
        studentId: uuid,
        guardianPersonId: guardianId,
        relationship: "encarregado",
      }).isPrimary,
    ).toBe(false);
  });
});

describe("mapSgaGuardianRelationship", () => {
  it("maps SIGA labels onto the SGA check constraint", () => {
    expect(mapSgaGuardianRelationship("encarregado")).toBe("guardian");
    expect(mapSgaGuardianRelationship("pai")).toBe("father");
    expect(mapSgaGuardianRelationship("mae")).toBe("mother");
    expect(mapSgaGuardianRelationship("irmao")).toBe("sibling");
    expect(mapSgaGuardianRelationship("father")).toBe("father");
    expect(mapSgaGuardianRelationship("desconhecido")).toBe("other");
  });
});

describe("removeGuardianInputSchema", () => {
  it("rejects non-UUID ids", () => {
    expect(
      removeGuardianInputSchema.safeParse({
        studentId: "x",
        guardianPersonId: "22222222-2222-2222-2222-222222222222",
      }).success,
    ).toBe(false);
  });
});

describe("presença na matrícula", () => {
  it("aceita percentagens de 0 a 100", () => {
    expect(
      updateEnrollmentAttendanceInputSchema.safeParse({
        enrollmentId: uuid,
        attendanceRate: 96,
      }).success,
    ).toBe(true);
    expect(
      updateEnrollmentAttendanceInputSchema.safeParse({
        enrollmentId: uuid,
        attendanceRate: 101,
      }).success,
    ).toBe(false);
  });

  it("calcula a média ignorando valores vazios", () => {
    expect(averagePercent([90, null, 80, undefined])).toBe(85);
    expect(averagePercent([null, undefined])).toBeNull();
  });
});

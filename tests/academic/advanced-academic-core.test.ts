import { describe, it, expect } from "vitest";
import {
  createSubjectTypeInputSchema,
  createCurriculumAreaInputSchema,
  createRoomInputSchema,
  createSchoolShiftInputSchema,
  saveCurriculumMatrixInputSchema,
  publishAcademicScheduleInputSchema,
  saveTeacherAvailabilityInputSchema,
} from "@/features/academic/schemas";
import { detectScheduleConflicts } from "@/features/academic/schedule/utils/conflicts";
import type { ScheduleSlot } from "@/features/academic/schedule/types";

describe("Advanced Academic Core Schemas & Validation", () => {
  it("validates subject types schema", () => {
    const valid = createSubjectTypeInputSchema.parse({
      code: "TEC",
      name: "Técnica / Tecnológica",
      color: "#3B82F6",
      isMandatory: true,
      appearsInPauta: true,
      countsForGpa: true,
    });
    expect(valid.code).toBe("TEC");
    expect(valid.isMandatory).toBe(true);
    expect(valid.appearsInPauta).toBe(true);

    expect(() =>
      createSubjectTypeInputSchema.parse({
        code: "",
        name: "A",
      }),
    ).toThrow();
  });

  it("validates curriculum area schema", () => {
    const valid = createCurriculumAreaInputSchema.parse({
      code: "EXATAS",
      name: "Ciências Exatas e Engenharia",
      displayOrder: 1,
    });
    expect(valid.code).toBe("EXATAS");
    expect(valid.displayOrder).toBe(1);
  });

  it("validates room schema with capacity and equipment", () => {
    const valid = createRoomInputSchema.parse({
      code: "LAB-01",
      name: "Laboratório de Informática 1",
      capacity: 35,
      roomType: "computer_lab",
      building: "Bloco B",
      floor: "1º Andar",
      accessibility: true,
      resources: ["Projetor", "35 Computadores", "Ar Condicionado"],
    });
    expect(valid.capacity).toBe(35);
    expect(valid.roomType).toBe("computer_lab");
    expect(valid.resources).toHaveLength(3);
  });

  it("validates school shift schema", () => {
    const valid = createSchoolShiftInputSchema.parse({
      code: "MANHA",
      name: "Turno da Manhã",
      startsAt: "07:30",
      endsAt: "12:30",
      defaultLessonDuration: 50,
      defaultBreakDuration: 15,
      activeDays: [1, 2, 3, 4, 5],
    });
    expect(valid.startsAt).toBe("07:30");
    expect(valid.endsAt).toBe("12:30");
    expect(valid.activeDays).toHaveLength(5);
  });

  it("validates curriculum matrix schema", () => {
    const valid = saveCurriculumMatrixInputSchema.parse({
      name: "Matriz Curricular Ensino Médio Técnico 2026",
      academicYearId: "e6f497a7-5ffc-4c60-ba3e-90ff7d2b2700",
      courseId: "c7f497a7-5ffc-4c60-ba3e-90ff7d2b2701",
      gradeLevelId: "b7f497a7-5ffc-4c60-ba3e-90ff7d2b2702",
      subjects: [
        {
          subjectId: "a7f497a7-5ffc-4c60-ba3e-90ff7d2b2703",
          weeklyPeriods: 4,
          periodDurationMinutes: 50,
          isMandatory: true,
          displayOrder: 1,
        },
      ],
    });
    expect(valid.subjects).toHaveLength(1);
    expect(valid.subjects[0].weeklyPeriods).toBe(4);
  });

  it("validates teacher availability schema", () => {
    const valid = saveTeacherAvailabilityInputSchema.parse({
      teacherId: "a7f497a7-5ffc-4c60-ba3e-90ff7d2b2704",
      maxWeeklyHours: 24,
      slots: [
        {
          weekday: 1,
          startsAt: "08:00",
          endsAt: "12:00",
          isAvailable: true,
        },
        {
          weekday: 2,
          startsAt: "14:00",
          endsAt: "18:00",
          isAvailable: false,
          notes: "Compromisso de pós-graduação",
        },
      ],
    });
    expect(valid.slots).toHaveLength(2);
    expect(valid.maxWeeklyHours).toBe(24);
  });

  it("validates schedule publish schema", () => {
    const valid = publishAcademicScheduleInputSchema.parse({
      classGroupId: "c7f497a7-5ffc-4c60-ba3e-90ff7d2b2705",
      academicYearId: "a7f497a7-5ffc-4c60-ba3e-90ff7d2b2706",
      syncToCalendar: true,
      validFrom: "2026-09-15",
      validTo: "2026-12-15",
    });
    expect(valid.syncToCalendar).toBe(true);
    expect(valid.validFrom).toBe("2026-09-15");
  });
});

describe("Schedule Conflict Detection Engine with Rooms & Capacity", () => {
  it("detects simultaneous room conflicts", () => {
    const slots: ScheduleSlot[] = [
      {
        id: "slot-1",
        class_group_id: "turma-a",
        class_group_name: "10ª A",
        subject_id: "sub-mat",
        subject_name: "Matemática",
        teacher_id: "prof-joao",
        teacher_name: "Prof. João",
        room_id: "sala-101",
        room_name: "Sala 101",
        weekday: 1,
        starts_at: "08:00",
        ends_at: "09:00",
        label: null,
        display_label: "Matemática (10ª A)",
      },
      {
        id: "slot-2",
        class_group_id: "turma-b",
        class_group_name: "11ª B",
        subject_id: "sub-qui",
        subject_name: "Química",
        teacher_id: "prof-maria",
        teacher_name: "Prof.ª Maria",
        room_id: "sala-101", // CONFLICT: Same room, different teacher and class
        room_name: "Sala 101",
        weekday: 1,
        starts_at: "08:30",
        ends_at: "09:30",
        label: null,
        display_label: "Química (11ª B)",
      },
    ];

    const conflicts = detectScheduleConflicts(slots);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("sala");
    expect(conflicts[0].slotIds).toEqual(["slot-1", "slot-2"]);
    expect(conflicts[0].message).toContain("Sala 101");
  });

  it("detects simultaneous teacher conflicts", () => {
    const slots: ScheduleSlot[] = [
      {
        id: "slot-1",
        class_group_id: "turma-a",
        class_group_name: "10ª A",
        subject_id: "sub-mat",
        subject_name: "Matemática",
        teacher_id: "prof-joao",
        teacher_name: "Prof. João",
        room_id: "sala-101",
        weekday: 2,
        starts_at: "10:00",
        ends_at: "11:00",
        label: null,
        display_label: "Matemática (10ª A)",
      },
      {
        id: "slot-2",
        class_group_id: "turma-b",
        class_group_name: "11ª B",
        subject_id: "sub-fis",
        subject_name: "Física",
        teacher_id: "prof-joao", // CONFLICT: Same teacher, different room & class
        teacher_name: "Prof. João",
        room_id: "sala-102",
        weekday: 2,
        starts_at: "10:30",
        ends_at: "11:30",
        label: null,
        display_label: "Física (11ª B)",
      },
    ];

    const conflicts = detectScheduleConflicts(slots);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("docente");
    expect(conflicts[0].slotIds).toEqual(["slot-1", "slot-2"]);
  });

  it("detects simultaneous class group conflicts", () => {
    const slots: ScheduleSlot[] = [
      {
        id: "slot-1",
        class_group_id: "turma-a",
        class_group_name: "10ª A",
        subject_id: "sub-mat",
        subject_name: "Matemática",
        teacher_id: "prof-joao",
        weekday: 3,
        starts_at: "07:30",
        ends_at: "08:30",
        label: null,
        display_label: "Matemática (10ª A)",
      },
      {
        id: "slot-2",
        class_group_id: "turma-a", // CONFLICT: Same class group scheduled twice
        class_group_name: "10ª A",
        subject_id: "sub-art",
        subject_name: "Artes",
        teacher_id: "prof-carlos",
        weekday: 3,
        starts_at: "08:00",
        ends_at: "09:00",
        label: null,
        display_label: "Artes (10ª A)",
      },
    ];

    const conflicts = detectScheduleConflicts(slots);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("turma");
    expect(conflicts[0].slotIds).toEqual(["slot-1", "slot-2"]);
  });

  it("returns no conflicts when events are sequential on the same room/teacher", () => {
    const slots: ScheduleSlot[] = [
      {
        id: "slot-1",
        class_group_id: "turma-a",
        class_group_name: "10ª A",
        subject_id: "sub-mat",
        subject_name: "Matemática",
        teacher_id: "prof-joao",
        room_id: "sala-101",
        weekday: 1,
        starts_at: "08:00",
        ends_at: "08:50",
        label: null,
        display_label: "Matemática (10ª A)",
      },
      {
        id: "slot-2",
        class_group_id: "turma-b",
        class_group_name: "11ª B",
        subject_id: "sub-qui",
        subject_name: "Química",
        teacher_id: "prof-joao",
        room_id: "sala-101",
        weekday: 1,
        starts_at: "08:50", // Exactly adjacent, no overlap
        ends_at: "09:40",
        label: null,
        display_label: "Química (11ª B)",
      },
    ];

    const conflicts = detectScheduleConflicts(slots);
    expect(conflicts).toHaveLength(0);
  });
});

describe("Teacher Assignment Schemas & Logic", () => {
  it("validates assignClassSubjectTeacher input", async () => {
    const { assignClassSubjectTeacherInputSchema } = await import("@/features/academic/schemas");
    const valid = assignClassSubjectTeacherInputSchema.parse({
      classGroupId: "11111111-1111-4111-8111-111111111111",
      subjectId: "22222222-2222-4222-8222-222222222222",
      teacherId: "33333333-3333-4333-8333-333333333333",
    });
    expect(valid.classGroupId).toBe("11111111-1111-4111-8111-111111111111");
    expect(valid.subjectId).toBe("22222222-2222-4222-8222-222222222222");
    expect(valid.teacherId).toBe("33333333-3333-4333-8333-333333333333");

    expect(() =>
      assignClassSubjectTeacherInputSchema.parse({
        classGroupId: "not-a-uuid",
        subjectId: "22222222-2222-4222-8222-222222222222",
        teacherId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toThrow();
  });

  it("filters subject IDs for teacher assignment with classSubjectLinks fallback", async () => {
    const { subjectIdsForTeacherAssignment } =
      await import("@/features/pedagogica/teacher-assignment");
    const allSubjects = ["sub-1", "sub-2", "sub-3"];

    // Without links, fallback to all subjects
    expect(
      subjectIdsForTeacherAssignment({
        classGroupId: "cg-1",
        subjectIds: allSubjects,
        classSubjectLinks: [],
      }),
    ).toEqual(allSubjects);

    // With active links for this class, strictly filter
    const links = [
      { class_group_id: "cg-1", subject_id: "sub-1", status: "active" },
      { class_group_id: "cg-1", subject_id: "sub-2", status: "inactive" },
      { class_group_id: "cg-2", subject_id: "sub-3", status: "active" },
    ];
    expect(
      subjectIdsForTeacherAssignment({
        classGroupId: "cg-1",
        subjectIds: allSubjects,
        classSubjectLinks: links,
      }),
    ).toEqual(["sub-1"]);
  });
});

describe("RBAC-v2 Canonical Role Permissions Seeding", () => {
  it("verifies canonical permissions sets for all roles in school-bootstrap", async () => {
    // Read the school-bootstrap file directly to verify canonical sets
    const fs = await import("node:fs");
    const content = fs.readFileSync("src/features/saas/school-bootstrap.ts", "utf8");

    expect(content).toContain("SECRETARY_PERMISSION_CODES");
    expect(content).toContain("TREASURY_PERMISSION_CODES");
    expect(content).toContain("TEACHER_PERMISSION_CODES");
    expect(content).toContain("GUARDIAN_PERMISSION_CODES");
    expect(content).toContain("STUDENT_PERMISSION_CODES");
    expect(content).toContain("USER_PERMISSION_CODES");

    // Check critical operational permissions
    expect(content).toContain("students.records.create");
    expect(content).toContain("finance.payments.create");
    expect(content).toContain("attendance.records.take");
    expect(content).toContain("assessment.grades.manage");
    expect(content).toContain("academic.timetable.manage");
  });
});

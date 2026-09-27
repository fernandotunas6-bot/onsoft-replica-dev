import { z } from "zod";
import { gradingProfileSchema } from "@/features/school/schemas";

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const classShiftOptions = ["morning", "afternoon", "evening"] as const;
export type ClassShift = (typeof classShiftOptions)[number];

export const listPedagogicalWorkspaceInputSchema = z.object({
  academicYearId: z.string().uuid().optional(),
});
export type ListPedagogicalWorkspaceInput = z.infer<typeof listPedagogicalWorkspaceInputSchema>;

export const createClassGroupInputSchema = z.object({
  academicYearId: z.string().uuid(),
  // Curso/Programa liga-se pela classe (grade_levels.program_id), não pela
  // turma directamente — ver comentário em createClassGroup() no server.ts.
  gradeLevelId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  shift: z.enum(classShiftOptions),
  capacity: z.number().int().positive().max(200).optional(),
  whatsappInviteUrl: optionalText,
  whatsappGroupName: optionalText,
});
export type CreateClassGroupInput = z.infer<typeof createClassGroupInputSchema>;

export const updateClassGroupInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  shift: z.enum(classShiftOptions),
  capacity: z.number().int().positive().max(200).optional(),
  roomId: z.string().uuid().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  whatsappInviteUrl: optionalText,
  whatsappGroupName: optionalText,
});
export type UpdateClassGroupInput = z.infer<typeof updateClassGroupInputSchema>;

export const deleteClassGroupInputSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteClassGroupInput = z.infer<typeof deleteClassGroupInputSchema>;

export const ensureAcademicDefaultsInputSchema = z.object({
  yearCode: optionalText,
  yearName: optionalText,
});
export type EnsureAcademicDefaultsInput = z.infer<typeof ensureAcademicDefaultsInputSchema>;

export const createSubjectInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  teacherName: optionalText,
  weeklyHours: z.number().int().min(1).max(20).default(4),
  gradeFrom: z.number().int().min(1).max(99).optional(),
  gradeTo: z.number().int().min(1).max(99).optional(),
  subjectTypeId: z.string().uuid().optional().nullable(),
  curriculumAreaId: z.string().uuid().optional().nullable(),
  shortName: optionalText,
  description: optionalText,
  department: optionalText,
  isMandatory: z.boolean().default(true),
  isPractical: z.boolean().default(false),
  hasAssessment: z.boolean().default(true),
  hasExam: z.boolean().default(false),
  hasAttendance: z.boolean().default(true),
  hasPauta: z.boolean().default(true),
  annualHours: z.number().int().positive().optional().nullable(),
  defaultLessonDuration: z.number().int().min(15).max(180).default(45),
  color: optionalText,
  icon: optionalText,
});
export type CreateSubjectInput = z.infer<typeof createSubjectInputSchema>;

export const updateSubjectInputSchema = z.object({
  subjectId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  weeklyHours: z.number().int().min(1).max(20).optional(),
  gradeFrom: z.number().int().min(1).max(99).optional().nullable(),
  gradeTo: z.number().int().min(1).max(99).optional().nullable(),
  subjectTypeId: z.string().uuid().optional().nullable(),
  curriculumAreaId: z.string().uuid().optional().nullable(),
  shortName: optionalText,
  description: optionalText,
  department: optionalText,
  isMandatory: z.boolean().optional(),
  isPractical: z.boolean().optional(),
  hasAssessment: z.boolean().optional(),
  hasExam: z.boolean().optional(),
  hasAttendance: z.boolean().optional(),
  hasPauta: z.boolean().optional(),
  annualHours: z.number().int().positive().optional().nullable(),
  defaultLessonDuration: z.number().int().min(15).max(180).optional(),
  color: optionalText,
  icon: optionalText,
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectInputSchema>;

export const deactivateSubjectInputSchema = z.object({
  subjectId: z.string().uuid(),
});
export type DeactivateSubjectInput = z.infer<typeof deactivateSubjectInputSchema>;

export const upsertTermGradeInputSchema = z.object({
  enrollmentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  mac: z.number().min(0).max(20),
  npp: z.number().min(0).max(20),
  npt: z.number().min(0).max(20),
});
export type UpsertTermGradeInput = z.infer<typeof upsertTermGradeInputSchema>;

export const upsertTermGradesBatchInputSchema = z.object({
  subjectId: z.string().uuid(),
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  rows: z
    .array(
      z.object({
        enrollmentId: z.string().uuid(),
        mac: z.number().min(0).max(20),
        npp: z.number().min(0).max(20),
        npt: z.number().min(0).max(20),
      }),
    )
    .min(1)
    .max(80),
});
export type UpsertTermGradesBatchInput = z.infer<typeof upsertTermGradesBatchInputSchema>;

export const assessmentKindSchema = z.enum([
  "teste",
  "prova",
  "trabalho",
  "participacao",
  "oral",
  "projecto",
  "continua",
  "recuperacao",
  "exame",
  "exame_recurso",
  "outra",
]);

export const assessmentComponentSchema = z.enum(["MAC", "NPP", "NPT", "recurso", "exame"]);

export const createAssessmentInputSchema = z.object({
  classGroupId: z.string().uuid(),
  subjectId: z.string().uuid(),
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  name: z.string().trim().min(2).max(160),
  kind: assessmentKindSchema.default("teste"),
  component: assessmentComponentSchema.default("NPP"),
  assessedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startsAt: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  purpose: z.enum(["diagnostic", "formative", "summative"]).optional(),
  maxScore: z.number().min(1).max(20).default(20),
  description: optionalText,
  countsTowardPauta: z.boolean().default(true),
  allowRecovery: z.boolean().default(true),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentInputSchema>;

export const updateAssessmentInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  kind: assessmentKindSchema,
  component: assessmentComponentSchema,
  assessedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startsAt: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  purpose: z.enum(["diagnostic", "formative", "summative"]).optional(),
  maxScore: z.number().min(1).max(20).default(20),
  description: optionalText,
  countsTowardPauta: z.boolean().default(true),
  allowRecovery: z.boolean().default(true),
});
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentInputSchema>;

export const deleteAssessmentInputSchema = z.object({
  itemId: z.string().uuid(),
  force: z.boolean().optional().default(false),
});
export type DeleteAssessmentInput = z.infer<typeof deleteAssessmentInputSchema>;

export const listAssessmentsInputSchema = z.object({
  classGroupId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
export type ListAssessmentsInput = z.infer<typeof listAssessmentsInputSchema>;

export const upsertAssessmentScoresInputSchema = z.object({
  itemId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        enrollmentId: z.string().uuid(),
        score: z.number().min(0).max(20).nullable(),
      }),
    )
    .min(1)
    .max(80),
});
export type UpsertAssessmentScoresInput = z.infer<typeof upsertAssessmentScoresInputSchema>;

export const listTermGradesInputSchema = z.object({
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});
export type ListTermGradesInput = z.infer<typeof listTermGradesInputSchema>;

export const createScheduleSlotInputSchema = z
  .object({
    classGroupId: z.string().uuid(),
    weekday: z.number().int().min(1).max(7),
    startsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/),
    endsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/),
    subjectId: z.string().uuid(),
    teacherId: z.string().uuid().optional().nullable(),
    roomId: z.string().uuid().optional().nullable(),
    shiftId: z.string().uuid().optional().nullable(),
    scheduleId: z.string().uuid().optional().nullable(),
    dayPeriodNumber: z.number().int().positive().optional().nullable(),
    label: optionalText,
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.endsAt.slice(0, 5) <= value.startsAt.slice(0, 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "A hora de fim deve ser posterior ao início.",
      });
    }
  });
export type CreateScheduleSlotInput = z.infer<typeof createScheduleSlotInputSchema>;

export const deleteScheduleSlotInputSchema = z.object({
  slotId: z.string().uuid(),
});
export type DeleteScheduleSlotInput = z.infer<typeof deleteScheduleSlotInputSchema>;

export const updateScheduleSlotInputSchema = z
  .object({
    slotId: z.string().uuid(),
    weekday: z.number().int().min(1).max(7),
    startsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/),
    endsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/),
    subjectId: z.string().uuid().optional(),
    teacherId: z.string().uuid().optional().nullable(),
    roomId: z.string().uuid().optional().nullable(),
    shiftId: z.string().uuid().optional().nullable(),
    scheduleId: z.string().uuid().optional().nullable(),
    dayPeriodNumber: z.number().int().positive().optional().nullable(),
    label: optionalText,
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.endsAt.slice(0, 5) <= value.startsAt.slice(0, 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "A hora de fim deve ser posterior ao início.",
      });
    }
  });
export type UpdateScheduleSlotInput = z.infer<typeof updateScheduleSlotInputSchema>;

export const getTeacherWorkspaceInputSchema = z.object({
  teacherId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});
export type GetTeacherWorkspaceInput = z.infer<typeof getTeacherWorkspaceInputSchema>;

export const assignClassSubjectTeacherInputSchema = z.object({
  classGroupId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
});
export type AssignClassSubjectTeacherInput = z.infer<typeof assignClassSubjectTeacherInputSchema>;

export const unassignClassSubjectTeacherInputSchema = z.object({
  classGroupId: z.string().uuid(),
  subjectId: z.string().uuid(),
});
export type UnassignClassSubjectTeacherInput = z.infer<
  typeof unassignClassSubjectTeacherInputSchema
>;

export const getStudentAcademicHistoryInputSchema = z.object({
  studentId: z.string().uuid(),
});
export type GetStudentAcademicHistoryInput = z.infer<typeof getStudentAcademicHistoryInputSchema>;

// Currículo do Curso (Ensino Superior) — program_subjects, ver
// supabase/migrations/20260811151500_program_subjects_curriculum.sql
export const listProgramCurriculumInputSchema = z.object({
  programId: z.string().uuid(),
});
export type ListProgramCurriculumInput = z.infer<typeof listProgramCurriculumInputSchema>;

export const addProgramSubjectInputSchema = z.object({
  programId: z.string().uuid(),
  subjectId: z.string().uuid(),
  semester: z.number().int().min(1).max(12),
  credits: z.number().positive().max(60).default(6),
});
export type AddProgramSubjectInput = z.infer<typeof addProgramSubjectInputSchema>;

export const removeProgramSubjectInputSchema = z.object({
  id: z.string().uuid(),
});
export type RemoveProgramSubjectInput = z.infer<typeof removeProgramSubjectInputSchema>;

export const updateProgramGradingProfileInputSchema = z.object({
  programId: z.string().uuid(),
  gradingProfile: gradingProfileSchema.nullable(),
});
export type UpdateProgramGradingProfileInput = z.infer<
  typeof updateProgramGradingProfileInputSchema
>;

export const applyCurriculumToClassGroupInputSchema = z.object({
  classGroupId: z.string().uuid(),
  programId: z.string().uuid(),
});
export type ApplyCurriculumToClassGroupInput = z.infer<
  typeof applyCurriculumToClassGroupInputSchema
>;

// ---------------------------------------------------------------------------
// Configuração Académica Avançada — Schemas
// ---------------------------------------------------------------------------

export const createSubjectTypeInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(100),
  description: optionalText,
  countsForGpa: z.boolean().default(true),
  appearsInPauta: z.boolean().default(true),
  hasExam: z.boolean().default(false),
  canFail: z.boolean().default(true),
  isMandatory: z.boolean().default(true),
  defaultWeight: z.number().min(0.1).max(10).default(1),
  requiresSpecialRoom: z.boolean().default(false),
  allowsSimultaneousClasses: z.boolean().default(false),
  requiresSpecializedTeacher: z.boolean().default(false),
  color: optionalText,
});
export type CreateSubjectTypeInput = z.infer<typeof createSubjectTypeInputSchema>;

export const updateSubjectTypeInputSchema = createSubjectTypeInputSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["active", "inactive"]).optional(),
});
export type UpdateSubjectTypeInput = z.infer<typeof updateSubjectTypeInputSchema>;

export const createCurriculumAreaInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(100),
  description: optionalText,
  color: optionalText,
  displayOrder: z.number().int().default(0),
});
export type CreateCurriculumAreaInput = z.infer<typeof createCurriculumAreaInputSchema>;

export const updateCurriculumAreaInputSchema = createCurriculumAreaInputSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["active", "inactive"]).optional(),
});
export type UpdateCurriculumAreaInput = z.infer<typeof updateCurriculumAreaInputSchema>;

export const roomTypeSchema = z.enum([
  "standard",
  "computer_lab",
  "physics_lab",
  "chemistry_lab",
  "biology_lab",
  "multimedia",
  "library",
  "auditorium",
  "workshop",
  "gym",
  "court",
  "meeting_room",
]);
export type RoomType = z.infer<typeof roomTypeSchema>;

export const createRoomInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  capacity: z.number().int().positive().max(500).default(35),
  roomType: roomTypeSchema.default("standard"),
  building: optionalText,
  block: optionalText,
  floor: optionalText,
  resources: z.array(z.string()).default([]),
  accessibility: z.boolean().default(true),
  notes: optionalText,
});
export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;

export const updateRoomInputSchema = createRoomInputSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["active", "inactive"]).optional(),
});
export type UpdateRoomInput = z.infer<typeof updateRoomInputSchema>;

export const createSchoolShiftInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(100),
  startsAt: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endsAt: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/),
  defaultLessonDuration: z.number().int().min(15).max(180).default(45),
  defaultBreakDuration: z.number().int().min(0).max(120).default(15),
  activeDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
  color: optionalText,
});
export type CreateSchoolShiftInput = z.infer<typeof createSchoolShiftInputSchema>;

export const saveCurriculumMatrixInputSchema = z.object({
  academicYearId: z.string().uuid(),
  courseId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: optionalText,
  subjects: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        subjectTypeId: z.string().uuid().optional().nullable(),
        weeklyPeriods: z.number().int().min(1).max(25).default(4),
        periodDurationMinutes: z.number().int().min(15).max(180).default(45),
        isMandatory: z.boolean().default(true),
        displayOrder: z.number().int().default(0),
      }),
    )
    .min(1),
});
export type SaveCurriculumMatrixInput = z.infer<typeof saveCurriculumMatrixInputSchema>;

export const saveTeacherAvailabilityInputSchema = z.object({
  teacherId: z.string().uuid(),
  academicYearId: z.string().uuid().optional(),
  slots: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      startsAt: z
        .string()
        .trim()
        .regex(/^\d{2}:\d{2}(:\d{2})?$/),
      endsAt: z
        .string()
        .trim()
        .regex(/^\d{2}:\d{2}(:\d{2})?$/),
      isAvailable: z.boolean().default(true),
      notes: optionalText,
    }),
  ),
  maxWeeklyHours: z.number().int().min(1).max(60).default(24),
});
export type SaveTeacherAvailabilityInput = z.infer<typeof saveTeacherAvailabilityInputSchema>;

export const publishAcademicScheduleInputSchema = z.object({
  classGroupId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: optionalText,
  validFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  validTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  syncToCalendar: z.boolean().default(true),
});
export type PublishAcademicScheduleInput = z.infer<typeof publishAcademicScheduleInputSchema>;

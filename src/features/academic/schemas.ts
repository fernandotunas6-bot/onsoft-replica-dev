import { z } from "zod";

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
  courseId: z.string().uuid(),
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
});
export type CreateSubjectInput = z.infer<typeof createSubjectInputSchema>;

export const updateSubjectInputSchema = z.object({
  subjectId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
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
  assessedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maxScore: z.number().min(1).max(20).default(20),
  description: optionalText,
  countsTowardPauta: z.boolean().default(true),
  allowRecovery: z.boolean().default(true),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentInputSchema>;

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
    weekday: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    startsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    endsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    subjectId: z.string().uuid(),
    label: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.endsAt <= value.startsAt) {
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
    weekday: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    startsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    endsAt: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    label: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.endsAt <= value.startsAt) {
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
export type AssignClassSubjectTeacherInput = z.infer<
  typeof assignClassSubjectTeacherInputSchema
>;

export const unassignClassSubjectTeacherInputSchema = z.object({
  classGroupId: z.string().uuid(),
  subjectId: z.string().uuid(),
});
export type UnassignClassSubjectTeacherInput = z.infer<
  typeof unassignClassSubjectTeacherInputSchema
>;

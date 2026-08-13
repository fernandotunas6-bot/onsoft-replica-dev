import { z } from "zod";

/** modelo angolano: MAC/NPP vêm de "avaliações" (contínuas) e "provas" (NPP/NPT). */
export const lessonPlanComponentKindSchema = z.enum(["avaliacao", "prova"]);
export type LessonPlanComponentKind = z.infer<typeof lessonPlanComponentKindSchema>;

export const lessonPlanComponentInputSchema = z.object({
  kind: lessonPlanComponentKindSchema,
  name: z.string().trim().min(2, "Indique um nome").max(120),
  plannedCount: z.number().int().min(1).max(20).default(1),
});
export type LessonPlanComponentInput = z.infer<typeof lessonPlanComponentInputSchema>;

const termSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const createLessonPlanInputSchema = z.object({
  classGroupId: z.string().uuid(),
  subjectId: z.string().uuid(),
  term: termSchema,
  title: z.string().trim().min(2, "Indique um título").max(180),
  content: z.string().trim().max(20_000).optional(),
  fileId: z.string().uuid().optional(),
  fileName: z.string().trim().max(255).optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  components: z.array(lessonPlanComponentInputSchema).max(20).default([]),
});
export type CreateLessonPlanInput = z.infer<typeof createLessonPlanInputSchema>;

export const updateLessonPlanInputSchema = createLessonPlanInputSchema.extend({
  id: z.string().uuid(),
});
export type UpdateLessonPlanInput = z.infer<typeof updateLessonPlanInputSchema>;

export const listLessonPlansInputSchema = z.object({
  query: z.string().trim().optional(),
  classGroupId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  term: termSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListLessonPlansInput = z.infer<typeof listLessonPlansInputSchema>;

export const getLessonPlanInputSchema = z.object({ id: z.string().uuid() });
export type GetLessonPlanInput = z.infer<typeof getLessonPlanInputSchema>;

export const deleteLessonPlanInputSchema = z.object({ id: z.string().uuid() });
export type DeleteLessonPlanInput = z.infer<typeof deleteLessonPlanInputSchema>;

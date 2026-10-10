import { z } from "zod";

export const mobileRoleSchema = z.enum(["professor", "aluno"]);
export const mobileScopeSchema = z
  .object({
    schoolId: z.string().uuid(),
    role: mobileRoleSchema,
  })
  .strict();
const id = z.string().trim().min(1).max(128);
const text = z.string().trim().min(1).max(10000);
const status = z.enum(["presente", "ausente", "justificada"]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

export const mobileAttendanceScopeSchema = mobileScopeSchema
  .extend({ from: date, to: date })
  .strict()
  .refine(
    ({ from, to }) => {
      const days = (Date.parse(to) - Date.parse(from)) / 86400000;
      return days >= 0 && days <= 30;
    },
    { message: "A consulta aceita no máximo 31 dias." },
  );

export const mobileCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("attendance"),
      lessonId: id,
      entries: z
        .array(z.object({ studentId: id, status }).strict())
        .min(1)
        .max(500)
        .refine(
          (entries) => new Set(entries.map((entry) => entry.studentId)).size === entries.length,
        ),
    })
    .strict(),
  z
    .object({
      type: z.literal("grade"),
      classId: id,
      studentId: id,
      value: z.number().finite().min(0).max(20),
      published: z.boolean(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("plan"),
      lessonId: id,
      objectives: text,
      materials: z.string().trim().max(10000),
    })
    .strict(),
  z
    .object({
      type: z.literal("task"),
      classId: id,
      title: z.string().trim().min(1).max(200),
      instructions: text,
      due: date,
    })
    .strict(),
  z.object({ type: z.literal("submission"), taskId: id, text }).strict(),
  z.object({ type: z.literal("message"), to: id, text }).strict(),
  z
    .object({ type: z.literal("document"), documentType: z.string().trim().min(1).max(100) })
    .strict(),
]);
export const mobileCommandRequestSchema = mobileScopeSchema
  .extend({
    requestId: z.string().uuid(),
    command: mobileCommandSchema,
  })
  .strict();
export type MobileCommandRequest = z.infer<typeof mobileCommandRequestSchema>;

export const mobileChatScopeSchema = mobileScopeSchema
  .extend({
    conversationId: z.string().uuid().optional(),
    before: z.string().datetime().optional(),
    beforeId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.before) === Boolean(v.beforeId) && (!v.before || Boolean(v.conversationId)),
    { message: "Cursor de conversa inválido." },
  );

export const mobileChatAttachmentSchema = mobileScopeSchema
  .extend({ messageId: z.string().uuid() })
  .strict();

export const mobileChatCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), peerId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal("send"),
      conversationId: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
      replyTo: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("delete"),
      conversationId: z.string().uuid(),
      messageId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("read"),
      conversationId: z.string().uuid(),
      messageId: z.string().uuid(),
    })
    .strict(),
]);
export const mobileChatCommandRequestSchema = mobileScopeSchema
  .extend({ requestId: z.string().uuid(), command: mobileChatCommandSchema })
  .strict();

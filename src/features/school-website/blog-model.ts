import { z } from "zod";
import { safePublicUrl } from "./content-model";

export const BLOG_PREFIX = "school_blog.";
export const blogSlugSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífens no endereço.");
export const schoolBlogDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    excerpt: z.string().trim().max(400).default(""),
    body: z.string().trim().max(60000).default(""),
    category: z.string().trim().min(1).max(60).default("Novidades"),
    coverUrl: z
      .string()
      .max(2048)
      .refine(
        (v) => !v || (v.startsWith("https://") && safePublicUrl(v, true)),
        "A capa deve usar uma imagem HTTPS.",
      )
      .default(""),
    coverAlt: z.string().trim().max(250).default(""),
    authorName: z.string().trim().max(120).default(""),
  })
  .strict();
export type SchoolBlogDraft = z.infer<typeof schoolBlogDraftSchema>;
export const schoolBlogStateSchema = z.object({
  slug: blogSlugSchema,
  revision: z.number().int().positive(),
  draft: schoolBlogDraftSchema,
  published: schoolBlogDraftSchema.nullable(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  isPublished: z.boolean(),
  archived: z.boolean(),
});
export type SchoolBlogState = z.infer<typeof schoolBlogStateSchema>;
export const changeSchoolBlogSchema = z
  .object({
    slug: blogSlugSchema,
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum(["save", "publish", "unpublish", "archive", "restore"]),
    draft: schoolBlogDraftSchema.optional(),
  })
  .strict();
export function changeSchoolBlogState(
  current: unknown,
  input: z.infer<typeof changeSchoolBlogSchema>,
  now = new Date(),
): SchoolBlogState {
  const state = current == null ? null : schoolBlogStateSchema.parse(current);
  if ((state?.revision ?? 0) !== input.expectedRevision || (state && state.slug !== input.slug))
    throw new Error(
      "O artigo foi alterado por outra pessoa ou este endereço já existe. Recarregue a lista antes de continuar.",
    );
  const draft = ["save", "publish"].includes(input.action)
    ? schoolBlogDraftSchema.parse(input.draft)
    : state?.draft;
  if (!draft) throw new Error("Artigo não encontrado.");
  if (input.action === "publish" && (!draft.body.trim() || !draft.excerpt.trim()))
    throw new Error("Preencha o resumo e o texto antes de publicar.");
  const published =
    input.action === "publish"
      ? structuredClone(draft)
      : ["unpublish", "archive"].includes(input.action)
        ? null
        : (state?.published ?? null);
  return {
    slug: input.slug,
    revision: (state?.revision ?? 0) + 1,
    draft,
    published,
    publishedAt: published ? (state?.publishedAt ?? now.toISOString()) : null,
    updatedAt: now.toISOString(),
    isPublished: Boolean(published),
    archived:
      input.action === "archive"
        ? true
        : input.action === "restore" || input.action === "publish"
          ? false
          : (state?.archived ?? false),
  };
}
export function publicSchoolBlogPost(value: unknown) {
  const state = schoolBlogStateSchema.parse(value);
  if (!state.isPublished || state.archived || !state.published || !state.publishedAt) return null;
  return { slug: state.slug, ...state.published, publishedAt: state.publishedAt };
}
export type PublicSchoolBlogPost = NonNullable<ReturnType<typeof publicSchoolBlogPost>>;

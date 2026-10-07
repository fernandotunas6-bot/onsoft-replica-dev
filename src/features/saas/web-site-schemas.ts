/**
 * Validação do conteúdo do site público (painel/web) gerido no ADMIN: artigos do blog,
 * perguntas frequentes, mensagens de contacto e vitrine de escolas
 * (migração 20261007100000_web_site_content.sql). Os limites seguem os CHECK da base.
 */
import { z } from "zod";

export const BLOG_STATUSES = ["draft", "published", "archived"] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export const CONTACT_STATUSES = ["new", "answered", "archived"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** «Novo ano lectivo 2026/27» → «novo-ano-lectivo-2026-27». */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

const trimmed = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, message);

export const blogPostInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .max(120)
    .regex(SLUG_RE, "O endereço só pode ter letras minúsculas, números e hífens.")
    .optional(),
  title: trimmed(3, 160, "O título tem de ter entre 3 e 160 caracteres."),
  excerpt: z.string().trim().max(400, "O resumo tem no máximo 400 caracteres.").default(""),
  body: z.string().max(60_000, "O artigo tem no máximo 60 000 caracteres.").default(""),
  category: trimmed(1, 60, "A categoria tem no máximo 60 caracteres.").default("Novidades"),
  coverUrl: z
    .string()
    .trim()
    .url("A imagem de capa tem de ser um endereço https.")
    .startsWith("https://", "A imagem de capa tem de ser um endereço https.")
    .nullish()
    .or(z.literal("").transform(() => null)),
  authorName: z.string().trim().max(120).nullish(),
  status: z.enum(BLOG_STATUSES).default("draft"),
});
export type BlogPostInput = z.infer<typeof blogPostInputSchema>;

export const faqInputSchema = z.object({
  id: z.string().uuid().optional(),
  question: trimmed(3, 300, "A pergunta tem de ter entre 3 e 300 caracteres."),
  answer: trimmed(3, 4000, "A resposta tem de ter entre 3 e 4000 caracteres."),
  category: trimmed(1, 60, "A categoria tem no máximo 60 caracteres.").default("Geral"),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  featured: z.boolean().default(false),
  isPublished: z.boolean().default(true),
});
export type FaqInput = z.infer<typeof faqInputSchema>;

export const contactMessageInputSchema = z.object({
  name: trimmed(2, 120, "Escreva o seu nome."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Introduza um e-mail válido.")
    .max(254, "Introduza um e-mail válido."),
  school: z.string().trim().max(160).optional().default(""),
  subject: trimmed(3, 160, "O assunto tem de ter entre 3 e 160 caracteres."),
  message: trimmed(10, 5000, "A mensagem tem de ter entre 10 e 5000 caracteres."),
  /** Campo escondido: um robô preenche-o, uma pessoa não o vê (o servidor finge aceitar). */
  website: z.string().max(500).optional().default(""),
});
export type ContactMessageInput = z.infer<typeof contactMessageInputSchema>;

export const contactStatusInputSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CONTACT_STATUSES),
});

export const showcaseHiddenInputSchema = z.object({
  schoolId: z.string().uuid(),
  hidden: z.boolean(),
  reason: z.string().trim().max(300).nullish(),
});

export const showcaseOptInInputSchema = z.object({ optedIn: z.boolean() });

/** Data de publicação: mantém a que já existe; ao publicar pela primeira vez, agora. */
export function resolvePublishedAt(
  status: BlogStatus,
  current: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (current) return current;
  return status === "published" ? now.toISOString() : null;
}

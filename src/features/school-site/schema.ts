/**
 * SIGA School Sites v1: conteúdo público explícito, sem HTML nem scripts.
 * A escola só aparece no site depois de publicar o seu snapshot.
 */
import { z } from "zod";

const httpsImage = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !!url.hostname &&
        !url.username &&
        !url.password &&
        !["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())
      );
    } catch {
      return false;
    }
  }, "Indique um endereço HTTPS válido para a imagem.");

export const schoolSiteContentSchema = z.object({
  title: z.string().trim().min(3).max(120),
  tagline: z.string().trim().max(240),
  about: z.string().trim().max(3000),
  heroImageUrl: httpsImage.nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  showContact: z.boolean(),
}).strict();

export const schoolSiteSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  draft: schoolSiteContentSchema,
  published: schoolSiteContentSchema.nullable(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const schoolSiteSaveInputSchema = z.object({
  expectedVersion: z.number().int().min(0),
  draft: schoolSiteContentSchema,
}).strict();

export const schoolSitePublishInputSchema = z.object({
  expectedVersion: z.number().int().min(0),
}).strict();

export type SchoolSiteContent = z.infer<typeof schoolSiteContentSchema>;
export type SchoolSiteSettings = z.infer<typeof schoolSiteSettingsSchema>;

export function defaultSchoolSiteContent(schoolName: string): SchoolSiteContent {
  return {
    title: schoolName.trim().slice(0, 120) || "Escola",
    tagline: "Bem-vindo à nossa instituição de ensino.",
    about: "",
    heroImageUrl: null,
    primaryColor: "#2563eb",
    showContact: false,
  };
}

export function defaultSchoolSiteSettings(schoolName: string): SchoolSiteSettings {
  return {
    schemaVersion: 1,
    draft: schoolSiteContentSchema.parse(defaultSchoolSiteContent(schoolName)),
    published: null,
    publishedAt: null,
  };
}

/** Nenhum dado inválido ou antigo deve transformar-se em conteúdo público. */
export function parseSchoolSiteSettings(raw: unknown): SchoolSiteSettings {
  return schoolSiteSettingsSchema.parse(raw);
}

/** Editar rascunho não altera o snapshot publicado. */
export function withDraft(settings: SchoolSiteSettings, draft: SchoolSiteContent): SchoolSiteSettings {
  return { ...settings, draft: schoolSiteContentSchema.parse(draft) };
}

/** Publicar é uma cópia validada, não uma referência mutável ao editor. */
export function withPublication(settings: SchoolSiteSettings, at: Date = new Date()): SchoolSiteSettings {
  return {
    ...settings,
    published: schoolSiteContentSchema.parse({ ...settings.draft }),
    publishedAt: at.toISOString(),
  };
}

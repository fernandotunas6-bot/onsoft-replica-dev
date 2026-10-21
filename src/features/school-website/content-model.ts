import { z } from "zod";
import manifestJson from "./template.json";

export type WebsiteField = {
  key: string;
  group: string;
  kind: string;
  label: string;
  value: string;
  dataPath?: string[];
};
export const websiteTemplate = manifestJson as { version: string; fields: WebsiteField[] };
const fields = new Map(websiteTemplate.fields.map((field) => [field.key, field]));
export const WEBSITE_DOMAIN = "school_website";

export function safePublicUrl(value: string, image = false): boolean {
  if ([...value].some((char) => char.charCodeAt(0) <= 32 || char === "\\")) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      (url.protocol === "https:" || (!image && ["mailto:", "tel:"].includes(url.protocol)))
    );
  } catch {
    return false;
  }
}
export function websiteOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export const websiteDraftSchema = z
  .object({
    templateVersion: z.string().max(80),
    websiteUrl: z
      .string()
      .max(2048)
      .refine(
        (v) => !v || websiteOrigin(v) !== null,
        "Use o endereço HTTPS da página inicial do site.",
      ),
    values: z.record(z.string().max(120), z.string().max(12000)),
    programBindings: z.record(z.string().max(120), z.string().uuid()).default({}),
    campaignSlug: z
      .string()
      .regex(/^(?:[a-z0-9-]{2,80})?$/)
      .default(""),
    admissionFeeAmount: z.number().int().min(0).max(100_000_000).nullable().optional(),
    bannerStyle: z.enum(["classic", "prism"]).optional(),
  })
  .strict();
export type WebsiteDraft = z.infer<typeof websiteDraftSchema>;
export function validateWebsiteDraft(input: unknown): WebsiteDraft {
  const draft = websiteDraftSchema.parse(input);
  if (draft.templateVersion !== websiteTemplate.version)
    throw new Error("O modelo do site mudou. Recarregue o editor antes de continuar.");
  if (JSON.stringify(draft).length > 1_500_000)
    throw new Error("O conteúdo ultrapassa o limite de publicação.");
  for (const [key, value] of Object.entries(draft.values)) {
    const field = fields.get(key);
    if (!field) throw new Error("Este campo não pertence ao modelo do site.");
    if (["link", "image"].includes(field.kind) && !safePublicUrl(value, field.kind === "image"))
      throw new Error("Use uma ligação segura, um caminho do site, telefone ou e-mail.");
    if (field.kind === "asset" && !/^[a-z0-9-]{1,80}$/.test(value))
      throw new Error(
        "A imagem do catálogo deve indicar um ficheiro dos recursos do site, sem extensão.",
      );
    if (
      field.kind === "number" &&
      (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 100)
    )
      throw new Error("Introduza uma duração válida.");
    if (field.dataPath && /[<>]/.test(value))
      throw new Error("Os campos do catálogo aceitam texto simples.");
  }
  for (const key of Object.keys(draft.programBindings)) {
    const field = fields.get(key);
    if (field?.dataPath?.[0] !== "courses" || field.dataPath.at(-1) !== "name")
      throw new Error("A ligação académica deve indicar o nome de um curso do website.");
  }
  return draft;
}
const stateSchema = z.object({
  revision: z.number().int().nonnegative(),
  draft: websiteDraftSchema,
  published: z
    .object({ revision: z.number().int(), publishedAt: z.string(), content: websiteDraftSchema })
    .nullable(),
});
export type WebsiteState = z.infer<typeof stateSchema>;
export function readWebsiteState(value: unknown): WebsiteState {
  if (value == null)
    return {
      revision: 0,
      draft: {
        templateVersion: websiteTemplate.version,
        websiteUrl: "",
        values: {},
        programBindings: {},
        campaignSlug: "",
      },
      published: null,
    };
  return stateSchema.parse(value);
}
export const changeWebsiteSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum(["save", "publish", "unpublish", "restore"]),
    draft: websiteDraftSchema.optional(),
  })
  .strict();
export function changeWebsiteState(
  current: unknown,
  input: z.infer<typeof changeWebsiteSchema>,
  now = new Date(),
): WebsiteState {
  const state = readWebsiteState(current);
  if (state.revision !== input.expectedRevision)
    throw new Error("Outra pessoa alterou o site. Recarregue o editor para não perder alterações.");
  const revision = state.revision + 1;
  if (input.action === "unpublish") return { ...state, revision, published: null };
  if (input.action === "restore") {
    if (!state.published) throw new Error("Ainda não existe uma versão publicada.");
    return { ...state, revision, draft: validateWebsiteDraft(state.published.content) };
  }
  const draft = validateWebsiteDraft(input.draft);
  if (input.action === "publish" && !draft.websiteUrl)
    throw new Error("Indique o endereço do site antes de publicar.");
  return {
    revision,
    draft,
    published:
      input.action === "publish"
        ? { revision, publishedAt: now.toISOString(), content: structuredClone(draft) }
        : state.published,
  };
}

/** Deliberately omits drafts, school IDs, actor IDs and private settings. */
export function publicWebsiteContent(state: WebsiteState) {
  if (!state.published) return null;
  const content = validateWebsiteDraft(state.published.content);
  return {
    apiVersion: 1,
    templateVersion: content.templateVersion,
    revision: state.published.revision,
    publishedAt: state.published.publishedAt,
    values: content.values,
    admissionFeeAmount: content.admissionFeeAmount ?? null,
    bannerStyle: content.bannerStyle ?? "classic",
  };
}

/** Informational fee for this published campaign; never an invoice or payment authority. */
export function publishedAdmissionFee(value: unknown, campaignSlug: string): number | null {
  const state = readWebsiteState(value);
  if (!state.published || state.published.content.campaignSlug !== campaignSlug) return null;
  return state.published.content.admissionFeeAmount ?? null;
}

import { z } from "zod";
import manifestJson from "./template.json";
import { parseWebsiteDesign, publishDesign } from "../../../painel/escolas/src/design.mjs";
import routes from "../../../painel/escolas/docs/routes.json";
const designSchema = z.unknown().transform((value, context) => {
  try {
    return parseWebsiteDesign(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Tema inválido.",
    });
    return z.NEVER;
  }
});

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

/**
 * Editorial URLs must remain public without bearer credentials. This is a
 * syntactic boundary, not a DNS/redirect or ownership verification service.
 */
export function safePublicUrl(value: string, image = false): boolean {
  if ([...value].some((char) => char.charCodeAt(0) <= 32 || char === "\\")) return false;
  const local = value.startsWith("/") && !value.startsWith("//");
  try {
    const url = new URL(value, local ? "https://website.invalid" : undefined);
    if (url.username || url.password) return false;
    if (!local && !image && ["mailto:", "tel:"].includes(url.protocol)) return true;
    if (url.protocol !== "https:") return false;
    if (!local) {
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      // Public editorial media uses DNS names, never IP literals or intranet names.
      if (
        !host.includes(".") ||
        host.includes(":") ||
        /^[0-9.]+$/.test(host) ||
        /(?:^|\.)(?:localhost|local|internal|lan|home|invalid)$/.test(host)
      )
        return false;
    }
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (/\/storage\/v1\/object\/(?:sign|authenticated)(?:\/|$)/.test(path)) return false;
    if (image && local && path.startsWith("/api/")) return false;
    for (const name of url.searchParams.keys()) {
      if (
        /^(?:token|access_token|refresh_token|authorization|signature|sig|key-pair-id|x-amz-.+|x-goog-.+)$/i.test(
          name,
        )
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
export function websiteOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return safePublicUrl(value) &&
      url.protocol === "https:" &&
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
    programBindings: z.record(z.string().max(120), z.string().guid()).default({}),
    campaignSlug: z
      .string()
      .regex(/^(?:[a-z0-9-]{2,80})?$/)
      .default(""),
    admissionFeeAmount: z.number().int().min(0).max(100_000_000).nullable().optional(),
    bannerStyle: z.enum(["classic", "prism"]).optional(),
    design: designSchema.optional(),
    /**
     * Páginas do modelo que esta escola já adoptou, além das de identidade
     * (ver `site-scope`). Ausente — e não `[]` — significa «sem âmbito
     * declarado: tudo», que é como se comportam os conteúdos gravados antes
     * de o âmbito existir. `[]` é a escolha explícita de publicar só a
     * identidade, e é com isso que uma escola nova nasce.
     */
    adoptedPages: z
      .array(
        z
          .string()
          .regex(/^\/[a-z0-9/-]*\/$/)
          .max(120),
      )
      .max(200)
      .optional(),
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
  for (const path of Object.keys(draft.design?.pages ?? {}))
    if (!routes.some((route) => route.url === path))
      throw new Error("A página visual não pertence ao website.");
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
  const state = stateSchema.parse(value);
  // These additive templates retain every previous field, adding portal controls and page images.
  const upgrade = (content: WebsiteDraft) => {
    if (
      ["2ab6e331ce0e67b8044e", "5fd4cbb7d43915bde5c6", "b7bb3fc0893638fd4fd6"].includes(
        content.templateVersion,
      )
    )
      content.templateVersion = websiteTemplate.version;
  };
  upgrade(state.draft);
  if (state.published) upgrade(state.published.content);
  return state;
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
    design: content.design ? publishDesign(content.design) : null,
  };
}

/** Informational fee for this published campaign; never an invoice or payment authority. */
export function publishedAdmissionFee(value: unknown, campaignSlug: string): number | null {
  const state = readWebsiteState(value);
  if (!state.published || state.published.content.campaignSlug !== campaignSlug) return null;
  return state.published.content.admissionFeeAmount ?? null;
}

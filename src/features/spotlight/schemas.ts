import { z } from "zod";
import type { ApplicationRole, ModuleGrantMap } from "@/features/auth/access-policy";
import { applicationRoles } from "@/features/auth/access-policy";

export const spotlightKinds = ["feature", "note", "function", "promo"] as const;
export type SpotlightKind = (typeof spotlightKinds)[number];

export const spotlightTones = ["primary", "info", "success", "warning"] as const;
export type SpotlightTone = (typeof spotlightTones)[number];

export const spotlightLinkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("internal"),
    to: z.string().min(1),
    fallbackTo: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("external"),
    href: z.string().url(),
  }),
  z.object({
    type: z.literal("settings"),
    panel: z.string().min(1),
  }),
]);
export type SpotlightLink = z.infer<typeof spotlightLinkSchema>;

export function accessPathForLink(link: SpotlightLink) {
  return link.type === "internal" ? link.to : undefined;
}

export function sameSpotlightLink(a: SpotlightLink, b: SpotlightLink) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function normalizeSpotlightHref(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeSpotlightInternalPath(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export const spotlightDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const spotlightAudienceRoles = applicationRoles.filter(
  (role) => role !== "Encarregado" && role !== "Utilizador",
);

export function calendarDateInLuanda(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda" }).format(now);
}

export function isSpotlightScheduledOn(item: SpotlightItem, day: string) {
  if (item.startsOn && item.startsOn > day) return false;
  if (item.endsOn && item.endsOn < day) return false;
  return true;
}

export function spotlightScheduleLabel(item: SpotlightItem, day = calendarDateInLuanda()) {
  if (item.startsOn && item.startsOn > day) return `Começa a ${item.startsOn}`;
  if (item.endsOn && item.endsOn < day) return `Terminou a ${item.endsOn}`;
  if (item.startsOn && item.endsOn) return `${item.startsOn} a ${item.endsOn}`;
  if (item.startsOn) return `Desde ${item.startsOn}`;
  if (item.endsOn) return `Até ${item.endsOn}`;
  return "Sempre visível";
}

export const spotlightItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(spotlightKinds),
    enabled: z.boolean().default(true),
    order: z.number().int(),
    title: z.string().trim().min(3).max(80),
    body: z.string().trim().min(8).max(180),
    cta: z.string().trim().min(2).max(40),
    icon: z.string().min(1),
    tone: z.enum(spotlightTones),
    accessPath: z.string().optional(),
    roles: z.array(z.enum(applicationRoles)).optional(),
    startsOn: spotlightDaySchema.optional(),
    endsOn: spotlightDaySchema.optional(),
    surfaces: z
      .array(z.enum(["drawer", "home"]))
      .min(1)
      .max(2)
      .optional(),
    link: spotlightLinkSchema,
  })
  .superRefine((item, ctx) => {
    if (item.startsOn && item.endsOn && item.startsOn > item.endsOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data de início não pode ser depois do fim.",
        path: ["endsOn"],
      });
    }
  });
export type SpotlightItem = z.infer<typeof spotlightItemSchema>;

export const spotlightSurfaceValues = ["drawer", "home"] as const;
export type SpotlightSurface = (typeof spotlightSurfaceValues)[number];

export function defaultSpotlightSurfaces(kind: SpotlightKind): SpotlightSurface[] {
  return kind === "function" ? ["drawer"] : ["drawer", "home"];
}

export function spotlightSurfacesFor(
  item: Pick<SpotlightItem, "kind" | "surfaces">,
): SpotlightSurface[] {
  return item.surfaces?.length ? item.surfaces : defaultSpotlightSurfaces(item.kind);
}

function sameSurfaceList(a: SpotlightSurface[], b: SpotlightSurface[]) {
  return [...a].sort().join("|") === [...b].sort().join("|");
}

export function visibleSpotlights(
  items: SpotlightItem[],
  input: {
    role: string;
    grants?: ModuleGrantMap;
    canAccess: (path: string, role: string, grants?: ModuleGrantMap) => boolean;
    today?: string;
    surface?: SpotlightSurface;
  },
) {
  const today = input.today ?? calendarDateInLuanda();
  return items
    .filter((item) => item.enabled)
    .filter((item) => isSpotlightScheduledOn(item, today))
    .filter((item) => !input.surface || spotlightSurfacesFor(item).includes(input.surface))
    .filter((item) => !item.roles?.length || item.roles.includes(input.role as ApplicationRole))
    .filter((item) => {
      if (!item.accessPath) return true;
      return input.canAccess(item.accessPath, input.role, input.grants);
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt"));
}

export function resolveSpotlightPath(item: SpotlightItem, canAccess: (path: string) => boolean) {
  if (item.link.type !== "internal") return null;
  if (canAccess(item.link.to)) return item.link.to;
  if (item.link.fallbackTo && canAccess(item.link.fallbackTo)) return item.link.fallbackTo;
  return item.link.fallbackTo ?? item.link.to;
}

export const spotlightItemOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  order: z.number().int().optional(),
  title: z.string().trim().min(3).max(80).optional(),
  body: z.string().trim().min(8).max(180).optional(),
  cta: z.string().trim().min(2).max(40).optional(),
  roles: z.array(z.enum(applicationRoles)).optional(),
  startsOn: z.union([spotlightDaySchema, z.null()]).optional(),
  endsOn: z.union([spotlightDaySchema, z.null()]).optional(),
  surfaces: z
    .array(z.enum(["drawer", "home"]))
    .min(1)
    .max(2)
    .optional(),
  link: spotlightLinkSchema.optional(),
  kind: z.enum(spotlightKinds).optional(),
  icon: z.string().min(1).optional(),
  tone: z.enum(spotlightTones).optional(),
});
export type SpotlightItemOverride = z.infer<typeof spotlightItemOverrideSchema>;

export const CUSTOM_SPOTLIGHT_PREFIX = "custom-";
export const MAX_CUSTOM_SPOTLIGHTS = 12;

export function isCustomSpotlightId(id: string) {
  return id.startsWith(CUSTOM_SPOTLIGHT_PREFIX);
}

export const spotlightInternalTargets = [
  { to: "/", label: "Início" },
  { to: "/alunos", label: "Alunos" },
  { to: "/pessoas", label: "Pessoas" },
  { to: "/pedagogica", label: "Pedagógica" },
  { to: "/financeiro", label: "Tesouraria" },
  { to: "/faturas", label: "Faturas" },
  { to: "/documentos", label: "Documentos" },
  { to: "/calendario", label: "Calendário" },
  { to: "/comunicacoes", label: "Comunicações" },
  { to: "/acessos", label: "Acessos" },
  { to: "/relatorios/academicos", label: "Relatórios académicos" },
  { to: "/relatorios/financeiros", label: "Relatórios financeiros" },
] as const;

export const spotlightSettingsTargets = [
  { panel: "conta", label: "Conta" },
  { panel: "escola", label: "Escola" },
  { panel: "financeiro", label: "Financeiro" },
  { panel: "matricula", label: "Matrícula pública" },
  { panel: "destaques", label: "Destaques" },
  { panel: "integracoes", label: "Integrações" },
  { panel: "seguranca", label: "Segurança" },
  { panel: "sistema.cores", label: "Aparência" },
  { panel: "sistema.desempenho", label: "Desempenho" },
  { panel: "pedagogico", label: "Pedagógico" },
] as const;

export const spotlightOverridesSchema = z.object({
  items: z.record(z.string(), spotlightItemOverrideSchema).default({}),
  extras: z.array(spotlightItemSchema).max(MAX_CUSTOM_SPOTLIGHTS).default([]),
});
export type SpotlightOverrides = z.infer<typeof spotlightOverridesSchema>;

export function createCustomSpotlight(order: number): SpotlightItem {
  return spotlightItemSchema.parse({
    id: `${CUSTOM_SPOTLIGHT_PREFIX}${crypto.randomUUID()}`,
    kind: "note",
    enabled: true,
    order,
    title: "Nova nota",
    body: "Escreva o recado que aparece no início e no painel da conta.",
    cta: "Abrir",
    icon: "sparkles",
    tone: "info",
    link: { type: "settings", panel: "destaques" },
  });
}

export function applySpotlightOverrides(
  catalog: SpotlightItem[],
  overrides: SpotlightOverrides | null | undefined,
): SpotlightItem[] {
  const patches = overrides?.items ?? {};
  const catalogIds = new Set(catalog.map((item) => item.id));
  const patched = catalog.map((item) => {
    const patch = patches[item.id];
    if (!patch) return item;
    return {
      ...item,
      enabled: patch.enabled ?? item.enabled,
      order: patch.order ?? item.order,
      title: patch.title ?? item.title,
      body: patch.body ?? item.body,
      cta: patch.cta ?? item.cta,
      roles:
        patch.roles !== undefined ? (patch.roles.length ? patch.roles : undefined) : item.roles,
      startsOn: patch.startsOn === null ? undefined : (patch.startsOn ?? item.startsOn),
      endsOn: patch.endsOn === null ? undefined : (patch.endsOn ?? item.endsOn),
      surfaces: patch.surfaces ?? item.surfaces,
      link: patch.link ?? item.link,
      accessPath: patch.link ? accessPathForLink(patch.link) : item.accessPath,
      kind: patch.kind ?? item.kind,
      icon: patch.icon ?? item.icon,
      tone: patch.tone ?? item.tone,
    };
  });
  const extras = (overrides?.extras ?? []).filter((item) => !catalogIds.has(item.id));
  return [...patched, ...extras].sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt"),
  );
}

export function spotlightOverrideDiff(
  catalog: SpotlightItem[],
  edited: SpotlightItem[],
): SpotlightOverrides {
  const items: Record<string, SpotlightItemOverride> = {};
  const extras: SpotlightItem[] = [];
  for (const item of edited) {
    const base = catalog.find((row) => row.id === item.id);
    if (!base) {
      extras.push(item);
      continue;
    }
    const patch: SpotlightItemOverride = {};
    if (item.enabled !== base.enabled) patch.enabled = item.enabled;
    if (item.order !== base.order) patch.order = item.order;
    if (item.title !== base.title) patch.title = item.title;
    if (item.body !== base.body) patch.body = item.body;
    if (item.cta !== base.cta) patch.cta = item.cta;
    if (JSON.stringify(item.roles ?? []) !== JSON.stringify(base.roles ?? [])) {
      patch.roles = item.roles ?? [];
    }
    if ((item.startsOn ?? null) !== (base.startsOn ?? null)) patch.startsOn = item.startsOn ?? null;
    if ((item.endsOn ?? null) !== (base.endsOn ?? null)) patch.endsOn = item.endsOn ?? null;
    if (!sameSurfaceList(spotlightSurfacesFor(item), spotlightSurfacesFor(base))) {
      patch.surfaces = spotlightSurfacesFor(item);
    }
    if (!sameSpotlightLink(item.link, base.link)) patch.link = item.link;
    if (item.kind !== base.kind) patch.kind = item.kind;
    if (item.icon !== base.icon) patch.icon = item.icon;
    if (item.tone !== base.tone) patch.tone = item.tone;
    if (Object.keys(patch).length) items[item.id] = patch;
  }
  return { items, extras };
}

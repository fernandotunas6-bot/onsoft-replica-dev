import { websiteTemplate, type WebsiteDraft, type WebsiteField } from "../content-model";
import pages from "../site-pages.generated.json";
import { editableWebsitePages } from "../page-appearance";

export const studioPages = editableWebsitePages.filter((page) => Object.hasOwn(pages, page.url));
export const studioWidths = [320, 390, 768, 1024, 1440, 1920] as const;
export const studioZooms = [50, 75, 100] as const;
const pageFields = new Map<string, WebsiteField[]>();

export function studioPage(path: string) {
  return studioPages.find((page) => page.url === path) ?? studioPages[0];
}

/** Resolve real template bindings, including catalogue fields, without rewriting the HTML. */
export function fieldsForStudioPage(path: string): WebsiteField[] {
  const cached = pageFields.get(path);
  if (cached) return cached;
  const html = (pages as Record<string, string>)[path];
  if (!html || !studioPages.some((page) => page.url === path)) return [];
  const keys = new Set<string>();
  for (const match of html.matchAll(/<!--site:([^>]+)-->/g)) keys.add(match[1]);
  for (const match of html.matchAll(/data-site-fields="([^"]+)"/g)) {
    for (const token of match[1].split(/\s+/)) keys.add(token.slice(token.indexOf(":") + 1));
  }
  const fields = websiteTemplate.fields.filter((field) => keys.has(field.key));
  pageFields.set(path, fields);
  return fields;
}

export function studioValues(draft: WebsiteDraft, fields: readonly WebsiteField[]) {
  return Object.fromEntries(
    fields.map((field) => [field.key, draft.values[field.key] ?? field.value]),
  );
}

/** Puck is an editing surface; only existing, explicitly scoped field keys are persisted. */
export function mergeStudioValues(
  draft: WebsiteDraft,
  input: unknown,
  fields: readonly WebsiteField[],
): WebsiteDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) return draft;
  const next = { ...draft.values };
  let changed = false;
  for (const field of fields) {
    if (!Object.hasOwn(input, field.key)) continue;
    const value = (input as Record<string, unknown>)[field.key];
    if (typeof value !== "string" || value.length > 12000) continue;
    if (value !== (draft.values[field.key] ?? field.value)) {
      next[field.key] = value;
      changed = true;
    }
  }
  return changed ? { ...draft, values: next } : draft;
}

/** Academic bindings remain authoritative in preview, just as in the public service. */
export function studioPreviewDraft(
  draft: WebsiteDraft,
  programs: readonly { id: string; name: string }[],
): WebsiteDraft {
  const names = new Map(programs.map((program) => [program.id, program.name]));
  const bindings = Object.entries(draft.programBindings);
  if (!bindings.length) return draft;
  return {
    ...draft,
    values: {
      ...draft.values,
      ...Object.fromEntries(
        bindings.map(([key, id]) => [key, names.get(id) ?? "Curso indisponível"]),
      ),
    },
  };
}

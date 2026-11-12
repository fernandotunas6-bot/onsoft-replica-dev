import { parseWebsiteDesign, type WebsiteDesign } from "../../../painel/escolas/src/design.mjs";
import routes from "../../../painel/escolas/docs/routes.json";

export const editableWebsitePages = routes.filter(
  (route) => !route.url.startsWith("/portal/") && route.url !== "/404/",
);

/** Copies only page-level presentation; content and global inheritance stay separate. */
export function copyPageAppearance(
  design: WebsiteDesign,
  source: string,
  target: string,
  mode: "merge" | "replace",
): WebsiteDesign {
  for (const path of [source, target])
    if (!editableWebsitePages.some((page) => page.url === path))
      throw Error("Escolha duas páginas públicas do website.");
  if (source === target) throw Error("Escolha uma página de origem diferente da página actual.");
  if (!["merge", "replace"].includes(mode)) throw Error("Escolha como aplicar as personalizações.");
  const current = parseWebsiteDesign(design),
    options = current.pages[source];
  if (!options || !Object.keys(options).length)
    throw Error("A página de origem ainda não tem personalizações.");
  return parseWebsiteDesign({
    ...current,
    pages: {
      ...current.pages,
      [target]: { ...(mode === "merge" ? current.pages[target] : {}), ...options },
    },
  });
}

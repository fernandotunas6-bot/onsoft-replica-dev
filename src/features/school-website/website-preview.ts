import pages from "./site-pages.generated.json";
import { applyWebsiteValues } from "./render-site";
import {
  publicWebsiteContent,
  validateWebsiteDraft,
  safePublicUrl,
  type WebsiteDraft,
} from "./content-model";
import { designAttributes } from "../../../painel/escolas/src/design.mjs";
// @ts-expect-error The published website uses native browser modules.
import { setupAcademicPages } from "../../../painel/escolas/src/academic-pages.mjs";

// @ts-expect-error The published website uses native browser modules.
import { admissionSummaryHTML } from "../../../painel/escolas/src/presentation.mjs";

// CSS masks require CORS inside an opaque sandbox. Load only the known static
// artwork in the editor, then use a PNG data URL in the isolated document.
const wordmarks = new Map<string, Promise<string | null>>();
export function loadWebsitePreviewWordmark(origin: string): Promise<string | null> {
  const source = new URL("/_school-website/assets/ispab-wordmark.png", origin).href;
  const existing = wordmarks.get(source);
  if (existing) return existing;
  const request = (async () => {
    try {
      const response = await fetch(source, {
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png"))
        throw Error("Artwork unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.length > 1048576 ||
        [137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => bytes[index] !== value)
      )
        throw Error("Invalid artwork");
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      return "data:image/png;base64," + btoa(binary);
    } catch {
      wordmarks.delete(source);
      return null;
    }
  })();
  wordmarks.set(source, request);
  return request;
}

/** A sandboxed, non-interactive preview; never requests a draft from a public API. */
export function websiteDraftPreview(
  draft: WebsiteDraft,
  path: string,
  schoolName: string,
  origin: string,
  logoUrl?: string | null,
  wordmarkDataUrl?: string | null,
) {
  const content = validateWebsiteDraft(draft);
  const source = (pages as Record<string, string>)[path];
  if (!source || path.startsWith("/portal/"))
    throw Error("Esta página não está disponível para pré-visualização.");
  const publication = publicWebsiteContent({
    revision: 0,
    draft: content,
    published: { revision: 0, publishedAt: "", content },
  })!;
  const doc = new DOMParser().parseFromString(
    applyWebsiteValues(
      source.replaceAll("ISPAB", () =>
        schoolName
          .slice(0, 40)
          .replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
          ),
      ),
      content.values,
    ),
    "text/html",
  );
  doc.documentElement.dataset.bannerStyle = content.bannerStyle === "prism" ? "prism" : "classic";
  const aside = doc.querySelector(".application-aside");
  if (aside && !aside.querySelector(".admission-summary"))
    aside.insertAdjacentHTML(
      "beforeend",
      admissionSummaryHTML({ admissionFeeAmount: content.admissionFeeAmount ?? null }),
    );
  const layout = setupAcademicPages({ doc, win: { location: { hash: "" } } });
  if (publication.design)
    for (const [key, value] of Object.entries(designAttributes(publication.design, path)))
      doc.documentElement.setAttribute(key, value);
  doc
    .querySelectorAll("script,iframe,object,embed,base,meta[http-equiv]")
    .forEach((node) => node.remove());
  for (const node of doc.querySelectorAll("a")) {
    node.removeAttribute("href");
    node.setAttribute("aria-disabled", "true");
    node.tabIndex = -1;
  }
  for (const node of doc.querySelectorAll<HTMLInputElement>("input,select,textarea,button"))
    node.disabled = true;
  for (const node of doc.querySelectorAll("[src],[href]"))
    for (const attr of ["src", "href"]) {
      const value = node.getAttribute(attr);
      if (value?.startsWith("/"))
        node.setAttribute(
          attr,
          new URL(
            value.startsWith("/_school-website/") ? value : "/_school-website" + value,
            origin,
          ).href,
        );
    }
  for (const brand of doc.querySelectorAll("a.brand"))
    if (logoUrl?.startsWith("https://") && safePublicUrl(logoUrl, true)) {
      const image = doc.createElement("img");
      image.src = logoUrl;
      image.alt = "";
      brand.querySelector("svg")?.replaceWith(image);
    } else if (
      /^ISPAB/i.test(schoolName) &&
      !brand.querySelector("img") &&
      wordmarkDataUrl?.startsWith("data:image/png;base64,")
    ) {
      brand.classList.add("ispab-wordmark");
      const art = doc.createElement("span");
      art.className = "brand-wordmark-art";
      art.setAttribute("aria-hidden", "true");
      art.style.setProperty("--institution-wordmark", `url("${wordmarkDataUrl}")`);
      brand.append(art);
    }
  const style = doc.createElement("style");
  style.textContent =
    "*{animation:none!important;transition:none!important}a,button,input,select,textarea{pointer-events:none!important}.site-header .brand{min-height:44px}";
  doc.head.append(style);
  const result = "<!doctype html>" + doc.documentElement.outerHTML;
  layout.destroy();
  return result;
}

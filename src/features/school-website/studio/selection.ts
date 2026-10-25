import type { WebsiteField } from "../content-model";

export type SelectionDocument = { html: string; channel: string };

/** Runs only in the opaque iframe, with no imports, credentials or mutation commands. */
function selectionBridge(channel: string, targetOrigin: string) {
  const send = (event: Event) => {
    if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
    const element = (event.target as Element | null)?.closest<HTMLElement>("[data-studio-fields]");
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    document
      .querySelectorAll("[data-studio-selected]")
      .forEach((node) => node.removeAttribute("data-studio-selected"));
    element.setAttribute("data-studio-selected", "");
    parent.postMessage(
      { type: "siga-studio-select", channel, keys: element.dataset.studioFields!.split(" ") },
      targetOrigin,
    );
  };
  document.addEventListener("click", send, true);
  document.addEventListener("keydown", send, true);
}

/** Opt-in selection. A fresh nonce allows exactly the trusted bridge, never template scripts. */
export function selectablePreview(
  html: string,
  fields: readonly WebsiteField[],
  origin: string,
): SelectionDocument {
  const channel = crypto.randomUUID();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Map(fields.map((field) => [field.key, field]));
  doc
    .querySelectorAll("script,iframe,object,embed,base,meta[http-equiv],link:not([rel=stylesheet])")
    .forEach((node) => node.remove());
  for (const node of doc.querySelectorAll("*")) {
    for (const attr of [...node.attributes])
      if (
        /^on/i.test(attr.name) ||
        ["srcdoc", "nonce", "data-studio-fields", "data-studio-selected"].includes(attr.name)
      )
        node.removeAttribute(attr.name);
  }
  const annotate = (node: Element | null, keys: string[]) => {
    if (!node || !doc.body.contains(node)) return;
    const valid = keys.filter((key) => allowed.has(key));
    if (!valid.length) return;
    const previous = node.getAttribute("data-studio-fields")?.split(" ") ?? [];
    node.setAttribute(
      "data-studio-fields",
      [...new Set([...previous, ...valid])].slice(0, 20).join(" "),
    );
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute(
      "aria-label",
      "Editar: " +
        valid
          .map((key) => allowed.get(key)!.label)
          .join(", ")
          .slice(0, 240),
    );
  };
  for (const node of doc.querySelectorAll("[data-site-fields]"))
    annotate(
      node,
      node
        .getAttribute("data-site-fields")!
        .split(/\s+/)
        .map((pair) => pair.slice(pair.indexOf(":") + 1)),
    );
  const comments = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  while (comments.nextNode()) {
    const comment = comments.currentNode;
    if (comment.textContent?.startsWith("site:"))
      annotate(comment.parentElement, [comment.textContent.slice(5)]);
  }
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  const assets = new URL("/_school-website/", origin).href;
  policy.content = `default-src 'none'; script-src 'nonce-${nonce}'; script-src-attr 'none'; style-src 'unsafe-inline' https: ${assets}; img-src https: data: ${assets}; font-src https: data: ${assets}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  doc.head.prepend(policy);
  const style = doc.createElement("style");
  style.textContent =
    "[data-studio-fields]{pointer-events:auto!important;cursor:crosshair!important}[data-studio-fields]:hover,[data-studio-fields]:focus-visible,[data-studio-selected]{outline:2px solid #2458d3!important;outline-offset:3px!important}";
  doc.head.append(style);
  // Connected documents hide nonce attributes during serialisation in real browsers.
  // Append this one trusted script after serialisation so its CSP nonce survives srcdoc.
  const bridge = `(${selectionBridge.toString()})(${JSON.stringify(channel)},${JSON.stringify(new URL(origin).origin)});`;
  const serialized = doc.documentElement.outerHTML;
  return {
    html:
      "<!doctype html>" +
      serialized.replace("</body>", `<script nonce="${nonce}">${bridge}</script></body>`),
    channel,
  };
}

/** Opaque frames have origin null; bind every message to its Window and current document. */
export function selectedPreviewKeys(
  event: MessageEvent,
  frame: Window | null,
  channel: string,
  fields: readonly WebsiteField[],
): string[] | null {
  if (!frame || event.source !== frame || event.origin !== "null") return null;
  const data = event.data;
  if (
    !data ||
    data.type !== "siga-studio-select" ||
    data.channel !== channel ||
    !Array.isArray(data.keys) ||
    !data.keys.length ||
    data.keys.length > 20
  )
    return null;
  const allowed = new Set(fields.map((field) => field.key));
  if (!data.keys.every((key: unknown) => typeof key === "string" && allowed.has(key))) return null;
  return [...new Set<string>(data.keys)];
}

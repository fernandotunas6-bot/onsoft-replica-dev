/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { selectablePreview, selectedPreviewKeys } from "@/features/school-website/studio/selection";
import { fieldsForStudioPage } from "@/features/school-website/studio/adapter";
const fields = fieldsForStudioPage("/");
const key = fields.find((field) => field.kind === "text")!.key;
describe("Ponte de selecção sem autoridade de escrita", () => {
  it("remove scripts/handlers existentes e só permite o bridge com nonce novo", () => {
    const source = `<html><head><meta http-equiv="Content-Security-Policy" content="script-src *"></head><body><script>evil()</script><h1 onclick="evil()" data-studio-fields="invented"><!--site:${key}-->Título<!--/site--></h1><img onerror="evil()"><iframe srcdoc="evil"></iframe></body></html>`;
    const result = selectablePreview(source, fields, "https://portal-siga.com");
    const doc = new DOMParser().parseFromString(result.html, "text/html");
    expect(doc.querySelectorAll("script")).toHaveLength(1);
    const nonce = doc.querySelector("script")!.getAttribute("nonce");
    expect(nonce).toHaveLength(32);
    expect(doc.querySelector("meta[http-equiv]")!.getAttribute("content")).toContain(
      `script-src 'nonce-${nonce}'`,
    );
    expect(doc.querySelector("meta[http-equiv]")!.getAttribute("content")).toContain(
      "connect-src 'none'",
    );
    expect(doc.querySelector("h1")!.getAttribute("data-studio-fields")).toBe(key);
    expect(doc.querySelector("[onclick],[onerror],iframe,object")).toBeNull();
    expect(selectablePreview(source, fields, "https://portal-siga.com").channel).not.toBe(
      result.channel,
    );
  });
  it("recusa outra janela, origem, documento, chaves inventadas e comandos de conteúdo", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const source = frame.contentWindow!;
    const data = { type: "siga-studio-select", channel: "current", keys: [key] };
    const event = (extra = {}, origin = "null", from = source) =>
      new MessageEvent("message", { origin, source: from, data: { ...data, ...extra } });
    expect(selectedPreviewKeys(event(), source, "current", fields)).toEqual([key]);
    expect(
      selectedPreviewKeys(event({}, "https://portal-siga.com"), source, "current", fields),
    ).toBeNull();
    expect(selectedPreviewKeys(event({}, "null", window), source, "current", fields)).toBeNull();
    expect(selectedPreviewKeys(event({ channel: "old" }), source, "current", fields)).toBeNull();
    expect(
      selectedPreviewKeys(event({ keys: ["__proto__"] }), source, "current", fields),
    ).toBeNull();
    expect(
      selectedPreviewKeys(
        event({ type: "publish", values: { [key]: "bad" } }),
        source,
        "current",
        fields,
      ),
    ).toBeNull();
    expect(
      selectedPreviewKeys(event({ keys: Array(21).fill(key) }), source, "current", fields),
    ).toBeNull();
    frame.remove();
  });
});

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync("public/browser-check.js", "utf8");
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

/** Corre o script como o navegador, com `CSS.supports` a dizer se há color-mix(). */
function run({ colorMix = true, ua = MAC_UA, tauri = false } = {}) {
  vi.stubGlobal("CSS", { supports: () => colorMix });
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  if (tauri) vi.stubGlobal("isTauri", true);
  new Function(SOURCE)();
  return document.getElementById("siga-browser-check");
}

afterEach(() => {
  document.getElementById("siga-browser-check")?.remove();
  document.documentElement.removeAttribute("data-siga-browser");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verificação do navegador (motores antigos)", () => {
  it("num navegador actual não mostra nada", () => {
    expect(run()).toBeNull();
    expect(document.documentElement.hasAttribute("data-siga-browser")).toBe(false);
  });

  it("num Mac com o Safari antigo explica como actualizar o Safari", () => {
    const overlay = run({ colorMix: false });
    expect(overlay?.getAttribute("role")).toBe("alertdialog");
    expect(overlay?.textContent).toContain("É preciso actualizar o Safari deste Mac");
    expect(overlay?.textContent).toContain("Actualização de Software");
    expect(overlay?.textContent).not.toContain("SIGA Desktop");
    expect(document.documentElement.getAttribute("data-siga-browser")).toBe("outdated");
  });

  it("na app desktop do Mac diz que a app usa o Safari do sistema", () => {
    const overlay = run({ colorMix: false, tauri: true });
    expect(overlay?.textContent).toContain("A app SIGA Desktop usa o motor do Safari do Mac");
  });

  it("noutro navegador antigo sugere actualizar ou usar outro", () => {
    const overlay = run({
      colorMix: false,
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/100.0",
    });
    expect(overlay?.textContent).toContain("Este navegador é antigo demais");
  });

  it("a app desktop leva uma cópia igual", () => {
    expect(readFileSync("desktop/public/browser-check.js", "utf8")).toBe(SOURCE);
  });
});

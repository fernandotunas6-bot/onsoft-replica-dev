import { describe, expect, it } from "vitest";
import { isExternalHttpUrl, nextZoom, shortcutAction } from "@/lib/desktop-shortcuts";

const key = (
  k: string,
  mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("desktop — links externos", () => {
  const origin = "https://portal-siga.com";

  it("abre fora da app só links http(s) de fora do SIGA", () => {
    expect(isExternalHttpUrl("https://classroom.google.com/", origin)).toBe(true);
    expect(isExternalHttpUrl("/alunos", origin)).toBe(false);
    expect(isExternalHttpUrl("https://esperanca.portal-siga.com/", origin)).toBe(false);
    expect(isExternalHttpUrl("https://docs.portal-siga.com/pautas", origin)).toBe(false);
    expect(isExternalHttpUrl("blob:https://portal-siga.com/1", origin)).toBe(false);
    expect(isExternalHttpUrl("https://portal-siga.com.evil.io/", origin)).toBe(true);
  });
});

describe("desktop — atalhos", () => {
  it("reconhece recarregar, histórico e zoom", () => {
    expect(shortcutAction(key("F5"))).toBe("reload");
    expect(shortcutAction(key("r", { ctrlKey: true }))).toBe("reload");
    expect(shortcutAction(key("ArrowLeft", { altKey: true }))).toBe("back");
    expect(shortcutAction(key("ArrowRight", { altKey: true }))).toBe("forward");
    expect(shortcutAction(key("=", { metaKey: true }))).toBe("zoom-in");
    expect(shortcutAction(key("-", { ctrlKey: true }))).toBe("zoom-out");
    expect(shortcutAction(key("0", { ctrlKey: true }))).toBe("zoom-reset");
  });

  it("não rouba teclas normais nem Ctrl+K", () => {
    expect(shortcutAction(key("r"))).toBeNull();
    expect(shortcutAction(key("k", { ctrlKey: true }))).toBeNull();
    expect(shortcutAction(key("ArrowLeft"))).toBeNull();
  });

  it("zoom anda em degraus e tem limites", () => {
    expect(nextZoom(1, "zoom-in")).toBe(1.1);
    expect(nextZoom(1, "zoom-out")).toBe(0.9);
    expect(nextZoom(2, "zoom-in")).toBe(2);
    expect(nextZoom(0.67, "zoom-out")).toBe(0.67);
    expect(nextZoom(1.5, "zoom-reset")).toBe(1);
  });
});

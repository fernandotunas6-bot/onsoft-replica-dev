import { describe, expect, it } from "vitest";
import { isExternalUrl, nextZoom, shortcutAction, storedZoom } from "@/lib/desktop-shortcuts";

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

  it("só o portal fica na janela; o resto abre no browser do sistema", () => {
    expect(isExternalUrl("/alunos", origin)).toBe(false);
    expect(isExternalUrl("https://portal-siga.com/pautas", origin)).toBe(false);
    expect(isExternalUrl("https://classroom.google.com/", origin)).toBe(true);
    // As outras apps do ecossistema não têm os comandos da app: abrem fora.
    expect(isExternalUrl("https://docs.portal-siga.com/siga/index.html", origin)).toBe(true);
    expect(isExternalUrl("https://payflow.portal-siga.com/admin", origin)).toBe(true);
    expect(isExternalUrl("https://portal-siga.com.mal.example/", origin)).toBe(true);
    expect(isExternalUrl("mailto:secretaria@escola.ao", origin)).toBe(true);
    expect(isExternalUrl("tel:+244900000000", origin)).toBe(true);
  });

  it("blob:, javascript: e endereços inválidos não saem da app", () => {
    expect(isExternalUrl("blob:https://portal-siga.com/1", origin)).toBe(false);
    expect(isExternalUrl("javascript:alert(1)", origin)).toBe(false);
    expect(isExternalUrl("http://[::1", origin)).toBe(false);
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
    expect(shortcutAction(key("p", { metaKey: true }))).toBe("print");
    expect(shortcutAction(key("P", { ctrlKey: true }))).toBe("print");
    expect(shortcutAction(key("p", { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("não rouba teclas normais nem Ctrl+K", () => {
    expect(shortcutAction(key("r"))).toBeNull();
    expect(shortcutAction(key("k", { ctrlKey: true }))).toBeNull();
    expect(shortcutAction(key("ArrowLeft"))).toBeNull();
  });

  it("zoom anda em degraus, tem limites e só se lembra de degraus válidos", () => {
    expect(nextZoom(1, "zoom-in")).toBe(1.1);
    expect(nextZoom(1, "zoom-out")).toBe(0.9);
    expect(nextZoom(2, "zoom-in")).toBe(2);
    expect(nextZoom(0.67, "zoom-out")).toBe(0.67);
    expect(nextZoom(1.5, "zoom-reset")).toBe(1);
    expect(storedZoom("1.25")).toBe(1.25);
    expect(storedZoom("40")).toBe(1);
    expect(storedZoom(null)).toBe(1);
  });
});

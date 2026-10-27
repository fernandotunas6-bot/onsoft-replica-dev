import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/** Contrato de UI para evitar o regresso de animações decorativas nos controlos. */
describe("botões discretos e cabeçalho legível", () => {
  it("mantém foco, loading e desactivação sem encolher botões ao clicar", () => {
    const button = read("src/components/ui/button.tsx");
    expect(button).not.toContain("active:scale-");
    expect(button).not.toContain("transition-[color,background-color,transform");
    expect(button).toContain("focus-visible:ring-1");
    expect(button).toContain("disabled={disabled || loading}");
    expect(button).toContain("aria-busy={loading || undefined}");
  });

  it("mantém indicação de navegação activa sem deslocar os ícones", () => {
    const nav = read("src/components/layout/NavItem.tsx");
    expect(nav).not.toContain("active:scale-");
    expect(nav).not.toContain("group-hover:scale-");
    expect(nav).not.toContain("transition-[transform,background-color]");
    expect(nav).toContain('aria-current={props.active ? "page" : undefined}');
    expect(nav).toContain('before:w-[3px]');
  });

  it("não anima escala, rotação ou deslocação dos ícones dos controlos globais", () => {
    const css = read("src/styles.css");
    const start = css.indexOf("@utility header-icon-btn");
    const end = css.indexOf("/* Media/section surfaces */", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const headerIcon = css.slice(start, end);
    expect(headerIcon).not.toContain("scale(");
    expect(headerIcon).not.toContain("transform");
    expect(css).not.toContain("siga-motion-control:not(:disabled):not([aria-disabled");
    expect(css).not.toContain("group-hover:scale-150");
    expect(css).not.toContain("rotate(12deg)");
    const focusCards = read("src/features/dashboard/components/AdminHomeFocus.tsx");
    expect(focusCards).not.toContain("hover:-translate-y-");
    expect(focusCards).toContain("focus-visible:ring-2");
  });

  it("aumenta e suaviza a topbar sem perder os estados dos botões", () => {
    const shell = read("src/components/layout/AppShell.tsx");
    const mobile = read("src/components/mobile/MobileHeader.tsx");
    expect(shell).toContain('hidden h-16 min-w-0');
    expect(shell).toContain("bg-card/95");
    expect(shell).toContain("supports-[backdrop-filter]:backdrop-blur-sm");
    expect(mobile).toContain("min-h-[68px]");
    expect(mobile).toContain("bg-card/95");
    expect(shell).toContain("aria-pressed={favorited}");
    expect(shell).toContain("aria-expanded={notificationsOpen}");
  });
});

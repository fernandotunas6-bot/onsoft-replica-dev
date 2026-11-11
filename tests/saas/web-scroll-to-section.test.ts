// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollToSection } from "../../painel/web/src/lib/scroll-to-section";

/**
 * WEB: as secções da landing usam content-visibility, por isso a posição de uma
 * secção muda enquanto se desce (as de cima ganham a altura real). Antes, «Contacto»
 * vindo de outra página e o endereço /#contact deixavam a pessoa no topo.
 */
describe("scrollToSection", () => {
  let tops: number[];
  let scrolledBy: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<section id="contact"></section>';
    scrolledBy = [];
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollBy = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === "object" && options?.top !== undefined) scrolledBy.push(options.top);
    }) as typeof window.scrollBy;
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: tops.length ? tops.shift()! : 0 }) as DOMRect,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("corrige até a secção ficar no topo quando o layout muda a meio", () => {
    // Depois do salto, a secção ainda está 1200 px abaixo; depois 300; depois no sítio.
    tops = [1200, 300, 0];
    expect(scrollToSection("#contact")).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "instant",
      block: "start",
    });
    vi.runAllTimers();
    expect(scrolledBy).toEqual([1200, 300]);
  });

  it("procura a secção de novo em cada passo (o formulário de contacto chega depois)", () => {
    tops = [800, 0];
    scrollToSection("#contact");
    // O espaço reservado é substituído pela secção real antes da primeira correcção.
    document.body.innerHTML = '<section id="contact" data-real="1"></section>';
    vi.runAllTimers();
    expect(scrolledBy).toEqual([800]);
  });

  it("não insiste para sempre se o layout nunca estabilizar", () => {
    tops = Array.from({ length: 50 }, () => 500);
    scrollToSection("#contact");
    vi.runAllTimers();
    expect(scrolledBy.length).toBeLessThanOrEqual(12);
  });

  it("deslize suave nos cliques, salvo com «reduzir movimento»", () => {
    tops = [0];
    scrollToSection("#contact", { smooth: true });
    expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "start",
    });
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    scrollToSection("#contact", { smooth: true });
    expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "instant",
      block: "start",
    });
  });

  it("ignora âncoras sem secção ou inválidas", () => {
    expect(scrollToSection("#nao-existe")).toBe(false);
    expect(scrollToSection("#")).toBe(false);
    expect(scrollToSection("contact")).toBe(false);
    expect(scrollToSection("#1-invalido")).toBe(false);
  });
});

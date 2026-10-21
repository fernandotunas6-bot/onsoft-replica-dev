/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Native public-site module.
import { setupHomeHighlights } from "../../painel/escolas/src/home-highlights.mjs";
let controller: ReturnType<typeof setupHomeHighlights>;
let media: MediaQueryList;
afterEach(() => {
  controller?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.className = "";
});
function mount(reduced = false) {
  document.body.innerHTML =
    '<section class="home-hero"><div class="hero-visual"><div data-hero-carousel><div class="hero-photo"><p class="hero-photo-caption">Primeiro</p></div><div class="hero-photo" hidden><a class="hero-photo-caption" href="/ingresso/">Ingresso publicado</a></div><div class="hero-photo" hidden><p class="hero-photo-caption">Comunidade</p></div></div></div></section>';
  const original = document.body.innerHTML;
  vi.useFakeTimers();
  media = Object.assign(new EventTarget(), { matches: reduced }) as MediaQueryList;
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  controller = setupHomeHighlights();
  return original;
}
const visible = () => document.querySelector(".hero-photo:not([hidden])")?.textContent;
describe("destaques da página inicial", () => {
  it("roda apenas enquanto visível e pára após uma escolha manual, sem duplicar o carrossel", () => {
    const original = mount();
    setupHomeHighlights();
    expect(document.querySelectorAll(".home-slide-controls")).toHaveLength(1);
    vi.advanceTimersByTime(7000);
    expect(visible()).toBe("Ingresso publicado");
    document.querySelector<HTMLButtonElement>('[aria-label="Destaque seguinte"]')!.click();
    expect(visible()).toBe("Comunidade");
    vi.advanceTimersByTime(21000);
    expect(visible()).toBe("Comunidade");
    expect(document.querySelectorAll(".hero-photo[aria-hidden=false]")).toHaveLength(1);
    expect(document.querySelector<HTMLElement>(".hero-photo[aria-hidden=false]")?.inert).toBe(
      false,
    );
    expect(document.querySelector(".home-slide-controls [role=status]")?.textContent).toContain(
      "Destaque 3 de 3",
    );
    controller.destroy();
    controller.destroy();
    expect(document.body.innerHTML).toBe(original);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("respeita movimento reduzido e mantém os controlos manuais e destinos publicados", () => {
    mount(true);
    vi.advanceTimersByTime(28000);
    expect(visible()).toBe("Primeiro");
    expect(
      document.querySelector<HTMLButtonElement>(".home-slide-controls>button:last-of-type")
        ?.disabled,
    ).toBe(true);
    document.querySelector<HTMLButtonElement>('[aria-label="Destaque seguinte"]')!.click();
    expect(visible()).toBe("Ingresso publicado");
    expect(document.querySelector(".hero-photo:not([hidden]) a")?.getAttribute("href")).toBe(
      "/ingresso/",
    );
  });
  it("suspende ao esconder a página e ao focar, e só retoma por acção explícita", () => {
    mount();
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(14000);
    expect(visible()).toBe("Primeiro");
    window.dispatchEvent(new Event("pageshow"));
    vi.advanceTimersByTime(7000);
    expect(visible()).toBe("Ingresso publicado");
    document
      .querySelector(".hero-photo:not([hidden]) a")!
      .dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.advanceTimersByTime(14000);
    expect(visible()).toBe("Ingresso publicado");
    document.querySelector<HTMLButtonElement>('[aria-label="Reproduzir destaques"]')!.click();
    vi.advanceTimersByTime(7000);
    expect(visible()).toBe("Comunidade");
  });
});

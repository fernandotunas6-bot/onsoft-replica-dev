/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Native public-site module.
import { setupAcademicNavigation } from "../../painel/escolas/src/academic-navigation.mjs";
let controller: ReturnType<typeof setupAcademicNavigation>;
const mobile = Object.assign(new EventTarget(), { matches: false });
afterEach(() => {
  controller?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
function mount() {
  document.body.innerHTML =
    '<header class="site-header"><a class="brand" href="/">ISPAB</a><button class="mobile-toggle">Menu</button><nav id="main-nav"><details class="nav-dropdown"><summary>Estudar</summary><div class="mega-menu"><a href="/cursos/">Cursos</a><a href="/cursos/?nivel=Outro">Outro</a></div></details><details class="nav-dropdown"><summary>Ingresso</summary><div class="mega-menu"><a href="/ingresso/">Ingresso</a></div></details></nav></header><main></main><footer class="site-footer"></footer>';
  vi.useFakeTimers();
  mobile.matches = false;
  vi.stubGlobal("matchMedia", (q: string) =>
    q === "(max-width:760px)" ? mobile : Object.assign(new EventTarget(), { matches: true }),
  );
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => window.setTimeout(fn, 0));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
  controller = setupAcademicNavigation();
  return [...document.querySelectorAll("details")];
}
describe("cabeçalho académico", () => {
  it("reduz com histerese, mantém um menu aberto e conserva foco de teclado durante a saída do rato", () => {
    const [first, second] = mount();
    vi.stubGlobal("scrollY", 120);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1);
    expect(document.querySelector("header")?.dataset.condensed).toBe("true");
    vi.stubGlobal("scrollY", 70);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1);
    expect(document.querySelector("header")?.dataset.condensed).toBe("true");
    vi.stubGlobal("scrollY", 20);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1);
    expect(document.querySelector("header")?.dataset.condensed).toBe("false");
    first.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(100);
    expect(first.open).toBe(true);
    second.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(100);
    expect(second.open).toBe(true);
    expect(first.open).toBe(false);
    first
      .querySelector("summary")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    expect(first.open).toBe(true);
    expect(second.open).toBe(false);
    expect(document.activeElement).toBe(first.querySelector("a"));
    first.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(200);
    expect(first.open).toBe(true);
  });
  it("isola o menu móvel e repõe os estados anteriores do documento ao fechar e desmontar", async () => {
    mount();
    const main = document.querySelector("main")!;
    main.inert = false;
    document.body.style.overflow = "clip";
    mobile.matches = true;
    document.querySelector("#main-nav")!.classList.add("open");
    await Promise.resolve();
    expect(main.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    document.querySelector("#main-nav")!.classList.remove("open");
    await Promise.resolve();
    expect(main.inert).toBe(false);
    expect(document.body.style.overflow).toBe("clip");
    document.querySelector("#main-nav")!.classList.add("open");
    await Promise.resolve();
    controller.destroy();
    controller.destroy();
    expect(main.inert).toBe(false);
    expect(document.body.style.overflow).toBe("clip");
    expect(document.querySelector(".navigation-scrim")).toBeNull();
  });
});

/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import pages from "@/features/school-website/site-pages.generated.json";
// @ts-expect-error Native public-site module.
import * as navigation from "../../painel/escolas/src/academic-navigation.mjs";
const { setupAcademicNavigation, isHeaderSearchShortcut } = navigation;
let controller: ReturnType<typeof setupAcademicNavigation>;
const mobile = Object.assign(new EventTarget(), { matches: false });
afterEach(() => {
  controller?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
function mount(wrapped = false) {
  mobile.matches = false;
  document.body.innerHTML =
    '<header class="site-header"><a class="brand" href="/">ISPAB</a><button class="mobile-toggle">Menu</button><nav id="main-nav"><details class="nav-dropdown"><summary>Estudar</summary><div class="mega-menu"><a href="/cursos/">Cursos</a><a href="/cursos/?nivel=Outro">Outro</a></div></details><details class="nav-dropdown"><summary>Ingresso</summary><div class="mega-menu"><a href="/ingresso/">Ingresso</a></div></details></nav></header><main></main><footer class="site-footer"></footer>';
  if (wrapped) {
    const header = document.querySelector("header")!;
    header.dataset.navigationContext = "inner";
    const shell = document.createElement("div");
    shell.className = "site-navigation";
    header.before(shell);
    shell.append(header);
    shell.getBoundingClientRect = () => ({ height: 104, bottom: 104 }) as DOMRect;
    header.getBoundingClientRect = () => ({ height: 67, bottom: 104 }) as DOMRect;
  }
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
  it("cancela a abertura pendente ao dispensar o menu e não fecha por saída de toque num computador híbrido", () => {
    const [first] = mount();
    first.dispatchEvent(new Event("pointerenter"));
    document.body.click();
    vi.advanceTimersByTime(120);
    expect(first.open).toBe(false);
    first.dispatchEvent(new Event("pointerenter"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    vi.advanceTimersByTime(120);
    expect(first.open).toBe(false);
    first.open = true;
    const leave = new Event("pointerleave");
    Object.defineProperty(leave, "pointerType", { value: "touch" });
    first.dispatchEvent(leave);
    vi.advanceTimersByTime(220);
    expect(first.open).toBe(true);
  });

  it("preserva o menu com foco de teclado e fecha ao sair desse grupo", () => {
    const [first, second] = mount();
    first
      .querySelector("summary")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    second.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(120);
    expect(first.open).toBe(true);
    expect(second.open).toBe(false);
    expect(document.activeElement).toBe(first.querySelector("a"));
    second.querySelector("summary")!.focus();
    expect(first.open).toBe(false);
  });

  it("fecha e desbloqueia imediatamente o fundo ao escolher uma ligação no menu móvel", async () => {
    mount();
    document.querySelector("main")!.inert = false;
    mobile.matches = true;
    const nav = document.querySelector("#main-nav")!,
      toggle = document.querySelector(".mobile-toggle")!;
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
    nav.classList.add("open");
    await Promise.resolve();
    expect(document.querySelector("main")!.inert).toBe(true);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    nav.querySelector("a")!.addEventListener("click", (e) => e.preventDefault(), { once: true });
    nav.querySelector("a")!.dispatchEvent(event);
    expect(nav.classList.contains("open")).toBe(true);
    // The document observer must not be required to run before the native link action.
    nav.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(nav.classList.contains("open")).toBe(false);
    expect(document.querySelector("main")!.inert).toBe(false);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

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

describe("atalho de pesquisa", () => {
  it.each([
    "<input>",
    "<textarea></textarea>",
    "<select></select>",
    "<div contenteditable></div>",
    '<div contenteditable="plaintext-only"></div>',
    '<div role="textbox"></div>',
  ])("não interrompe a escrita em %s", (html) => {
    document.body.innerHTML = html;
    expect(
      isHeaderSearchShortcut({ key: "k", ctrlKey: true, target: document.body.firstElementChild }),
    ).toBe(false);
  });
  it("ignora composição e eventos tratados, e aceita um destino sem closest", () => {
    expect(
      isHeaderSearchShortcut({ key: "k", ctrlKey: true, target: document, isComposing: true }),
    ).toBe(false);
    expect(
      isHeaderSearchShortcut({ key: "k", ctrlKey: true, target: document, defaultPrevented: true }),
    ).toBe(false);
    expect(isHeaderSearchShortcut({ key: "k", metaKey: true, target: document })).toBe(true);
  });
});

describe("marca e cabeçalho ao navegar", () => {
  it("define o contexto e junta as duas linhas no HTML inicial, mantendo os portais separados", () => {
    for (const [path, context] of [
      ["/", "home"],
      ["/cursos/engenharia-informatica/", "inner"],
    ]) {
      const doc = new DOMParser().parseFromString(pages[path as keyof typeof pages], "text/html");
      expect(
        doc
          .querySelector(".site-navigation>.topline+.site-header")
          ?.getAttribute("data-navigation-context"),
      ).toBe(context);
      expect(doc.querySelector(".site-navigation .brand")?.getAttribute("aria-label")).toBe(
        "ISPAB, início",
      );
      expect(doc.querySelectorAll(".site-header")).toHaveLength(1);
    }
    expect(pages["/portal/"]).not.toContain('class="site-navigation"');
  });
  it("reserva a altura das duas linhas, actualiza no regresso à página e repõe o contexto inicial", () => {
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    mount(true);
    expect(observe).toHaveBeenCalledWith(document.querySelector(".site-navigation"));
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("104px");
    vi.stubGlobal("scrollY", 400);
    window.dispatchEvent(new Event("pageshow"));
    vi.advanceTimersByTime(1);
    expect(document.querySelector("header")?.dataset.condensed).toBe("true");
    expect(document.querySelector(".brand")?.getAttribute("href")).toBe("/");
    controller.destroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(document.querySelector("header")?.dataset.navigationContext).toBe("inner");
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("");
  });
});

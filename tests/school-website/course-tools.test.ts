/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/dom";
// @ts-expect-error Public website intentionally uses native browser modules.
import * as tools from "../../painel/escolas/src/course-tools.mjs";
const { setupCurriculumTools, setupCourseNavigation } = tools;
afterEach(() => {
  document.body.innerHTML = "";
});
describe("exploração do plano", () => {
  it("filtra temas sem perder o conteúdo ou os estados de abertura anteriores", () => {
    document.body.innerHTML =
      '<section id="plano"><h2>Plano existente</h2><div class="module-list"><details open><summary>Programação</summary><p>Algoritmos</p></details><details><summary>Redes e segurança</summary><p>Informação</p></details></div></section>';
    setupCurriculumTools();
    setupCurriculumTools();
    const input = document.querySelector("input")!,
      modules = [...document.querySelectorAll("details")],
      button = document.querySelector("button")!;
    expect(document.querySelectorAll(".curriculum-tools")).toHaveLength(1);
    fireEvent.input(input, { target: { value: "seguranca" } });
    expect(modules[0].hidden).toBe(true);
    expect(modules[1].open).toBe(true);
    expect(document.querySelector("[role=status]")?.textContent).toBe("1 de 2 temas disponíveis");
    fireEvent.input(input, { target: { value: "" } });
    expect(modules.map((m) => m.open)).toEqual([true, false]);
    fireEvent.click(button);
    expect(modules.every((m) => m.open)).toBe(true);
    fireEvent.click(button);
    expect(modules.some((m) => m.open)).toBe(false);
    fireEvent.input(input, { target: { value: "inexistente" } });
    expect(button.disabled).toBe(true);
    expect(document.querySelector("[role=status]")?.textContent).toMatch(/Nenhum tema/);
    expect(document.querySelector("h2")?.textContent).toBe("Plano existente");
  });
  it("utiliza um só observador para as secções e indica um único destino actual", () => {
    document.body.innerHTML =
      '<nav class="course-subnav"><a href="#a">A</a><a href="#b">B</a></nav><section id="a"></section><section id="b"></section>';
    const observe = vi.fn();
    let callback!: (entries: unknown[]) => void;
    const Observer = vi.fn(function (fn: typeof callback) {
      callback = fn;
      return { observe };
    });
    setupCourseNavigation({
      doc: document,
      win: { IntersectionObserver: Observer, location: { hash: "#b" } },
    });
    expect(Observer).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[aria-current=location]")?.getAttribute("href")).toBe("#b");
    callback([
      { target: document.querySelector("#a"), isIntersecting: true },
      { target: document.querySelector("#b"), isIntersecting: true },
    ]);
    expect(document.querySelectorAll("[aria-current=location]")).toHaveLength(1);
    expect(document.querySelector("[aria-current=location]")?.getAttribute("href")).toBe("#a");
  });
});

describe("posição de leitura das secções", () => {
  const fixture = () => {
    document.body.innerHTML =
      '<nav class="course-subnav"><div class="wrap"><a href="#a">A</a><a href="#b">B</a></div></nav><section id="a"></section><section id="b"></section>';
  };
  it("observa a linha dos destinos nativos e recalcula-a ao mudar o ecrã", () => {
    fixture();
    const callbacks: ((entries: unknown[]) => void)[] = [],
      options: IntersectionObserverInit[] = [];
    const disconnect = vi.fn();
    const add = vi.spyOn(window, "addEventListener"),
      remove = vi.spyOn(window, "removeEventListener");
    let height = 900;
    let resizeFrame!: FrameRequestCallback;
    const request = vi.fn((cb: FrameRequestCallback) => {
      resizeFrame = cb;
      return 1;
    });
    const win = {
      get innerHeight() {
        return height;
      },
      location: { hash: "" },
      getComputedStyle: (el: Element) =>
        el === document.documentElement
          ? { scrollPaddingTop: "110px" }
          : { scrollMarginTop: "167px" },
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      requestAnimationFrame: request,
      cancelAnimationFrame: vi.fn(),
      IntersectionObserver: class {
        observe = vi.fn();
        disconnect = disconnect;
        constructor(callback: (entries: unknown[]) => void, config: IntersectionObserverInit) {
          callbacks.push(callback);
          options.push(config);
        }
      },
    };
    const controller = setupCourseNavigation({ doc: document, win });
    setupCourseNavigation({ doc: document, win });
    expect(options).toHaveLength(1);
    expect(options[0].rootMargin).toBe("-278px 0px -621px 0px");
    callbacks[0]([{ target: document.getElementById("b"), isIntersecting: true }]);
    expect(document.querySelector("[aria-current]")?.getAttribute("href")).toBe("#b");
    height = 600;
    fireEvent(window, new Event("resize"));
    fireEvent(window, new Event("resize"));
    expect(request).toHaveBeenCalledTimes(1);
    resizeFrame(0);
    expect(options[1].rootMargin).toBe("-278px 0px -321px 0px");
    callbacks[0]([{ target: document.getElementById("a"), isIntersecting: true }]);
    expect(document.querySelector("[aria-current]")?.getAttribute("href")).toBe("#b");
    controller.destroy();
    controller.destroy();
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[aria-current]")).toBeNull();
    for (const event of ["resize", "hashchange"]) {
      expect(add).toHaveBeenCalledWith(event, expect.any(Function));
      expect(remove).toHaveBeenCalledWith(event, expect.any(Function));
    }
    vi.restoreAllMocks();
  });
  it("segue cliques e histórico sem observador e revela só a posição horizontal", () => {
    fixture();
    const scroller = document.querySelector(".wrap") as HTMLElement;
    Object.defineProperties(scroller, { scrollWidth: { value: 700 }, clientWidth: { value: 300 } });
    scroller.getBoundingClientRect = () => ({ left: 0, right: 300 }) as DOMRect;
    const links = [...document.querySelectorAll("a")];
    links[0].getBoundingClientRect = () => ({ left: 0, right: 100 }) as DOMRect;
    links[1].getBoundingClientRect = () => ({ left: 450, right: 550 }) as DOMRect;
    const scroll = vi.spyOn(window, "scrollTo");
    const win = {
      location: { hash: "" },
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
    };
    const controller = setupCourseNavigation({ doc: document, win });
    fireEvent.click(links[1]);
    expect(links[1].getAttribute("aria-current")).toBe("location");
    expect(scroller.scrollLeft).toBe(262);
    expect(scroll).not.toHaveBeenCalled();
    win.location.hash = "#a";
    fireEvent(window, new Event("hashchange"));
    expect(links[0].getAttribute("aria-current")).toBe("location");
    controller.destroy();
    win.location.hash = "#b";
    fireEvent(window, new Event("hashchange"));
    expect(document.querySelector("[aria-current]")).toBeNull();
    vi.restoreAllMocks();
  });
});

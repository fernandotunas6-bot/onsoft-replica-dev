/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/dom";
// @ts-expect-error Public website intentionally uses native browser modules.
import * as discovery from "../../painel/escolas/src/course-discovery.mjs";
const { findCourseSuggestions } = discovery;
const controllers: { destroy(): void }[] = [];
const setupCourseDiscovery: typeof discovery.setupCourseDiscovery = (...args: unknown[]) => {
  const controller = discovery.setupCourseDiscovery(...args);
  if (controller) controllers.push(controller);
  return controller;
};
const courses = [
  {
    id: "engenharia",
    name: "Engenharia Informática",
    description: "Bases de dados e sistemas",
    level: "Licenciatura",
    mode: "Presencial",
    duration: "4 anos",
    modules: ["Programação"],
  },
  {
    id: "dados",
    name: "Ciência de Dados",
    description: "Informática e investigação",
    level: "Pós-graduação",
    mode: "Presencial",
    duration: "2 anos",
    modules: ["Análise estatística"],
  },
];
beforeEach(() => {
  document.body.innerHTML =
    '<form id="hero-search" action="/cursos/"><div><input id="hero-search-q" name="q" type="search"></div><select id="hero-search-level"><option value="">Todas</option><option>Licenciatura</option><option>Pós-graduação</option></select><button>Procurar</button></form>';
});
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document
    .querySelectorAll('meta[name="school-site-base"],#school-site-bootstrap')
    .forEach((node) => node.remove());
});
describe("descoberta de cursos", () => {
  it("pesquisa texto publicado com acentos, formação e um limite curto de resultados", () => {
    expect(findCourseSuggestions(courses, "ciência").map((c: (typeof courses)[0]) => c.id)).toEqual(
      ["dados"],
    );
    expect(findCourseSuggestions(courses, "programacao")[0].id).toBe("engenharia");
    expect(findCourseSuggestions(courses, "informática", "Licenciatura")).toHaveLength(1);
    expect(findCourseSuggestions(courses, "i")).toHaveLength(0);
    expect(
      findCourseSuggestions(
        Array.from({ length: 10 }, (_, i) => ({ ...courses[0], id: "course-" + i })),
        "informática",
      ),
    ).toHaveLength(5);
    expect(
      findCourseSuggestions([{ ...courses[0], id: "../../portal" }], "informática"),
    ).toHaveLength(0);
  });
  it("mantém o formulário original e permite escolher por setas, Enter e Escape", () => {
    const navigate = vi.fn();
    setupCourseDiscovery(courses, { navigate });
    setupCourseDiscovery(courses, { navigate });
    const input = document.querySelector("input")!;
    fireEvent.input(input, { target: { value: "informática" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll("[role=listbox]")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe("hero-course-option-1");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigate).toHaveBeenCalledWith("/cursos/dados/");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.input(input, { target: { value: "nada-inexistente" } });
    expect(document.querySelector("[role=status]")?.textContent).toMatch(/Sem sugestões/);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(document.querySelector("form")?.getAttribute("action")).toBe("/cursos/");
  });
  it("trata nomes como texto e respeita o caminho da escola ligada", () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta name="school-site-base" content="/escolas/ispab">',
    );
    document.body.insertAdjacentHTML(
      "beforeend",
      '<script type="application/json" id="school-site-bootstrap">{"routes":["/cursos/engenharia/"]}</script>',
    );
    setupCourseDiscovery([{ ...courses[0], name: "Informática <img src=x>" }]);
    fireEvent.input(document.querySelector("input")!, { target: { value: "informática" } });
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("[role=option]")?.getAttribute("href")).toBe(
      "/escolas/ispab/cursos/engenharia/",
    );
  });
});

it("isola a pesquisa do cabeçalho e limpa sugestões, estados e eventos ao fechar", () => {
  document.body.innerHTML = '<form><div><input id="header-search-q"></div></form>';
  const input = document.querySelector<HTMLInputElement>("input")!;
  const controller = setupCourseDiscovery(
    [{ id: "engenharia", name: "Engenharia", description: "Curso", modules: [], careers: [] }],
    { input, idPrefix: "header" },
  );
  input.value = "engenharia";
  input.dispatchEvent(new Event("input"));
  expect(document.querySelector("#header-course-options")).not.toBeNull();
  expect(document.querySelector("#hero-course-options")).toBeNull();
  controller.destroy();
  controller.destroy();
  expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  expect(document.querySelector(".course-suggestions")).toBeNull();
  input.dispatchEvent(new Event("input"));
  expect(document.querySelector(".course-suggestions")).toBeNull();
});

it("mantém a composição de texto livre de sugestões e selecções pendentes", () => {
  const navigate = vi.fn();
  const controller = setupCourseDiscovery(courses, { navigate });
  const input = document.querySelector("input")!;
  fireEvent.input(input, { target: { value: "informática" } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.compositionStart(input);
  fireEvent.input(input, { target: { value: "ciência" }, isComposing: true });
  expect(input.getAttribute("aria-expanded")).toBe("false");
  expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    keyCode: 229,
    cancelable: true,
    bubbles: true,
  });
  input.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  expect(document.querySelectorAll("[role=option]")).toHaveLength(1);
  expect(document.querySelector("[role=option]")?.textContent).toContain("Ciência de Dados");
  controller.destroy();
});

it("posiciona a lista no espaço livre e desloca apenas as suas opções", () => {
  const controller = setupCourseDiscovery(courses);
  const input = document.querySelector("input")!;
  const field = input.parentElement!,
    popup = document.querySelector<HTMLElement>(".course-suggestions")!;
  field.getBoundingClientRect = () => ({ top: 650, bottom: 700 }) as DOMRect;
  Object.defineProperty(popup, "scrollHeight", { value: 360 });
  fireEvent.input(input, { target: { value: "informática" } });
  expect(popup.classList.contains("is-above")).toBe(true);
  expect(popup.style.maxHeight).toBe("360px");
  popup.getBoundingClientRect = () => ({ top: 281, bottom: 641 }) as DOMRect;
  const option = document.querySelector<HTMLElement>("[role=option]")!;
  option.getBoundingClientRect = () => ({ top: 660, bottom: 740 }) as DOMRect;
  const pageScroll = vi.spyOn(window, "scrollTo");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(popup.scrollTop).toBe(99);
  expect(pageScroll).not.toHaveBeenCalled();
  field.getBoundingClientRect = () => ({ top: 100, bottom: 150 }) as DOMRect;
  fireEvent.input(input);
  expect(popup.classList.contains("is-above")).toBe(false);
  controller.destroy();
  pageScroll.mockRestore();
});

it("fecha ao sair do campo e cancela a medição pendente na desmontagem", () => {
  const frame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  const controller = setupCourseDiscovery(courses);
  const input = document.querySelector("input")!;
  fireEvent.input(input, { target: { value: "informática" } });
  fireEvent.resize(window);
  fireEvent.resize(window);
  expect(frame).toHaveBeenCalledTimes(1);
  fireEvent.focusOut(input, { relatedTarget: document.querySelector("button") });
  expect(input.getAttribute("aria-expanded")).toBe("false");
  controller.destroy();
  expect(cancel).toHaveBeenCalledWith(42);
  expect(cancel).toHaveBeenCalledTimes(1);
  fireEvent.resize(window);
  expect(frame).toHaveBeenCalledTimes(1);
  frame.mockRestore();
  cancel.mockRestore();
});

it("recalcula o espaço quando a janela visual encolhe, sem deslocar o documento", () => {
  const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const viewport = Object.assign(new EventTarget(), { height: 400, offsetTop: 100 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  let resizeFrame!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    resizeFrame = callback;
    return 7;
  });
  const controller = setupCourseDiscovery(courses);
  try {
    const input = document.querySelector("input")!,
      popup = document.querySelector<HTMLElement>(".course-suggestions")!;
    input.parentElement!.getBoundingClientRect = () => ({ top: 400, bottom: 450 }) as DOMRect;
    Object.defineProperty(popup, "scrollHeight", { value: 600 });
    fireEvent.input(input, { target: { value: "informática" } });
    expect(popup.classList.contains("is-above")).toBe(true);
    expect(popup.style.maxHeight).toBe("240px");
    viewport.height = 250;
    viewport.dispatchEvent(new Event("resize"));
    resizeFrame(0);
    expect(popup.style.maxHeight).toBe("150px");
  } finally {
    controller.destroy();
    if (original) Object.defineProperty(window, "visualViewport", original);
    else Reflect.deleteProperty(window, "visualViewport");
  }
});

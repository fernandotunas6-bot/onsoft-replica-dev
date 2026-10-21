/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/dom";
// @ts-expect-error Public website intentionally uses native browser modules.
import * as discovery from "../../painel/escolas/src/course-discovery.mjs";
const { findCourseSuggestions, setupCourseDiscovery } = discovery;
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

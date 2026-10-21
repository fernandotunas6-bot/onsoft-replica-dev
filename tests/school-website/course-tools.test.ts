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

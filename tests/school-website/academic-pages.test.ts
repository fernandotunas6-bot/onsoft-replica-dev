/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import pages from "@/features/school-website/site-pages.generated.json";
// @ts-expect-error Public website intentionally uses native browser modules.
import { setupAcademicPages } from "../../painel/escolas/src/academic-pages.mjs";

// Em cache fria a avaliação dos módulos e a montagem das 18 páginas de curso
// passam dos 5s por omissão. Mesmo limite já usado nos ficheiros de tests/routes.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("apresentação académica progressiva", () => {
  it("reorganiza os 18 cursos mantendo nós publicados, links e eventos, e repõe a composição inicial", () => {
    const courses = Object.entries(pages).filter(([url]) => /^\/cursos\/[^/]+\/$/.test(url));
    expect(courses).toHaveLength(18);
    for (const [, html] of courses) {
      document.body.innerHTML = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);
      const original = document.body.innerHTML;
      const hero = document.querySelector(".course-hero")!;
      const button = hero.querySelector("[data-favorite]")!;
      const admission = hero.querySelector(".hero-buttons a")!;
      const href = admission.getAttribute("href");
      const labels = [...document.querySelectorAll(".course-summary dl>div")];
      labels[0].querySelector("dt")!.textContent = "Formação editada pela escola";
      const edited = document.body.innerHTML;
      const saved = vi.fn();
      button.addEventListener("click", saved);
      const controller = setupAcademicPages();
      setupAcademicPages();
      expect(document.querySelectorAll(".academic-course-overview")).toHaveLength(1);
      expect(document.querySelectorAll(".academic-course-overview dl>div")).toHaveLength(6);
      expect(document.querySelector(".academic-course-overview dt")?.textContent).toBe(
        "Formação editada pela escola",
      );
      expect(document.querySelector(".academic-course-actions .hero-buttons a")).toBe(admission);
      expect(admission.getAttribute("href")).toBe(href);
      expect(document.querySelector(".academic-curriculum-link")?.getAttribute("href")).toBe(
        "#plano",
      );
      expect(document.querySelector(".academic-course-campus")?.textContent).toBe(
        labels[6].querySelector("dd")!.textContent,
      );
      (button as HTMLButtonElement).click();
      expect(saved).toHaveBeenCalledTimes(1);
      controller.destroy();
      controller.destroy();
      expect(document.body.innerHTML).toBe(edited);
      expect(original).toContain("course-hero");
    }
  });

  it("conserva a página existente quando o resumo é incompleto", () => {
    document.body.innerHTML =
      '<main><section class="course-hero"><h1>Curso</h1><a href="/candidatura/">Candidatura</a></section></main>';
    const controller = setupAcademicPages();
    expect(document.querySelector(".academic-course-hero")).toBeNull();
    expect(document.querySelector("a")?.getAttribute("href")).toBe("/candidatura/");
    controller.destroy();
  });

  it("deriva a navegação dos títulos publicados e limpa observadores e IDs próprios", () => {
    document.body.innerHTML =
      '<header class="site-header"></header><main><section class="academic-page-head"><h1>Ingresso</h1></section><section id="academic-section-1"><h2>Texto da escola<br>Continuação</h2></section><section><h2>Checklist</h2><a class="resource-card" href="/um">Um recurso</a></section><section class="cta"><h2>Continuar</h2></section></main>';
    const original = document.body.innerHTML;
    let notify!: (entries: { target: Element; isIntersecting: boolean }[]) => void;
    const observe = vi.fn(),
      disconnect = vi.fn(),
      resizeDisconnect = vi.fn();
    const win = {
      location: { hash: "#academic-section-2" },
      IntersectionObserver: class {
        observe = observe;
        disconnect = disconnect;
        constructor(callback: typeof notify) {
          notify = callback;
        }
      },
      ResizeObserver: class {
        observe = vi.fn();
        disconnect = resizeDisconnect;
      },
    };
    const controller = setupAcademicPages({ doc: document, win });
    const links = [...document.querySelectorAll(".academic-section-nav a")];
    expect(links.map((a) => a.textContent)).toEqual(["Texto da escola Continuação", "Checklist"]);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[aria-current]")).toBe(links[1]);
    notify([{ target: document.getElementById("academic-section-1")!, isIntersecting: true }]);
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
    expect(document.querySelector("[aria-current]")).toBe(links[0]);
    controller.destroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe(original);
  });

  it("preserva destinos dos serviços, incluindo recursos externos, sem interpretar títulos como HTML", () => {
    document.body.innerHTML =
      '<main><section class="academic-page-head"></section><section><a class="resource-card" href="/escolas/ispab/biblioteca/"><h2>&lt;img src=x&gt;</h2></a><a class="resource-card" href="https://catalogue.example/" target="_blank" rel="noopener noreferrer"><h2>Catálogo</h2></a></section></main>';
    const controller = setupAcademicPages();
    const nav = document.querySelector(".academic-section-nav")!;
    expect(nav.querySelector("img")).toBeNull();
    expect(nav.querySelector("a")?.textContent).toBe("<img src=x>");
    expect(nav.querySelector("a")?.getAttribute("href")).toContain("/escolas/ispab/biblioteca/");
    expect(nav.querySelectorAll("a")[1].getAttribute("rel")).toBe("noopener noreferrer");
    expect(nav.querySelectorAll("a")[1].getAttribute("target")).toBe("_blank");
    controller.destroy();
  });
});

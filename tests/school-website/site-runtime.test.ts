/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Static website modules are intentionally plain JavaScript.
import * as siteRuntime from "../../painel/escolas/src/site-content.mjs";

const { applyPublishedContent, connectSchoolWebsite } = siteRuntime;
// @ts-expect-error Static website modules are intentionally plain JavaScript.
import { setupSiteSearch } from "../../painel/escolas/src/search.mjs";

// Em cache fria a avaliação dos módulos e a primeira renderização consomem o
// orçamento de 5s por omissão, e o custo cai em quem correr primeiro. Mesmo
// limite já usado nos ficheiros de tests/routes.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  document.body.innerHTML =
    '<main><!--site:heading-->Inicial<!--/site--><img data-site-fields="src:photo" src="/assets/hero.webp"><a href="/login/">Portal</a><a data-siga-login aria-disabled="true">Entrar</a><p data-siga-status></p></main>';
  delete document.documentElement.dataset.sigaContent;
});
afterEach(() => vi.unstubAllGlobals());
describe("sincronização no website", () => {
  it("a pesquisa utiliza o nome sincronizado e exclui cursos retirados", async () => {
    document.body.innerHTML =
      '<form id="site-search-form"><input id="site-query"></form><p id="site-results-count"></p><div id="site-results"></div>';
    history.replaceState(null, "", "/pesquisa/?q=Engenharia");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { url: "/cursos/course-a/", title: "Engenharia retirada", kind: "Curso" },
          { url: "/cursos/course-b/", title: "Engenharia antiga", kind: "Curso" },
        ]),
      ),
    );
    setupSiteSearch({
      courses: [
        { id: "course-b", name: "Engenharia oficial", description: "", modules: [], careers: [] },
      ],
      normal: (value: unknown) => String(value).toLowerCase(),
      esc: (value: unknown) => String(value),
    });
    await vi.waitFor(() =>
      expect(document.querySelector("#site-results-count")?.textContent).toBe(
        "1 resultados encontrados",
      ),
    );
    expect(document.querySelector('a[href="/cursos/course-a/"]')).toBeNull();
    expect(document.querySelector("#site-results")?.textContent).toContain("Engenharia oficial");
    history.replaceState(null, "", "/");
  });
  it("actualiza texto sem criar HTML e rejeita URLs executáveis", () => {
    applyPublishedContent(document, {
      heading: '<img src=x onerror="alert(1)">',
      photo: "javascript:alert(1)",
    });
    expect(document.querySelector("main")?.textContent).toContain("<img src=x");
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("/assets/hero.webp");
  });
  it("usa o login existente e sincroniza apenas o modelo compatível, sem cookies", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url) === "/school-runtime.json")
        return Response.json({
          portalUrl: "https://siga.example/",
          contentUrl: "https://siga.example/api/public/school-content/ISPAB",
        });
      if (String(url) === "/content-bindings.json")
        return Response.json({
          version: "template-a",
          fields: [
            { key: "data.courses.0.name", kind: "text", dataPath: ["courses", "0", "name"] },
          ],
        });
      return Response.json({
        apiVersion: 1,
        templateVersion: "template-a",
        values: { heading: "Conteúdo publicado", "data.courses.0.name": 'Engenharia "A"' },
        unavailablePrograms: [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = { courses: [{ id: "course-a", name: "Inicial" }] };
    await connectSchoolWebsite(data);
    expect(document.documentElement.dataset.sigaContent).toBe("synced");
    expect(data.courses[0].name).toBe('Engenharia "A"');
    expect(document.querySelector("a")?.getAttribute("href")).toBe("/login/");
    expect(document.querySelector("[data-siga-login]")?.hasAttribute("aria-disabled")).toBe(false);
    expect(document.querySelector("[data-siga-login]")?.getAttribute("href")).toBe(
      "https://siga.example/",
    );
    expect(
      fetchMock.mock.calls.find(([url]) => String(url).startsWith("https://"))?.[1],
    ).toMatchObject({ credentials: "omit", cache: "no-store" });
  });
  it("recusa versões incompatíveis e informa o visitante quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url) === "/school-runtime.json"
          ? Response.json({ contentUrl: "https://siga.example/api/public/school-content/ISPAB" })
          : String(url) === "/content-bindings.json"
            ? Response.json({ version: "new", fields: [] })
            : Response.json({
                apiVersion: 1,
                templateVersion: "old",
                values: { heading: "Não aplicar" },
              }),
      ),
    );
    await connectSchoolWebsite({ courses: [] });
    expect(document.documentElement.dataset.sigaContent).toBe("unavailable");
    expect(document.querySelector("[role=status]")?.textContent).toMatch(/demonstração/);
    expect(document.querySelector("main")?.textContent).not.toContain("Não aplicar");
  });
  it("um curso desactivado deixa o catálogo e as opções de candidatura", async () => {
    document
      .querySelector("main")
      ?.insertAdjacentHTML(
        "beforeend",
        '<article data-course="course-a">A</article><select><option value="course-a">A</option><option value="course-b">B</option></select>',
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url) === "/school-runtime.json"
          ? Response.json({ contentUrl: "https://siga.example/api/public/school-content/ISPAB" })
          : String(url) === "/content-bindings.json"
            ? Response.json({
                version: "v1",
                fields: [
                  { key: "data.courses.0.name", kind: "text", dataPath: ["courses", "0", "name"] },
                ],
              })
            : Response.json({
                apiVersion: 1,
                templateVersion: "v1",
                values: {},
                unavailablePrograms: ["data.courses.0.name"],
              }),
      ),
    );
    const data = {
      courses: [
        { id: "course-a", name: "A" },
        { id: "course-b", name: "B" },
      ],
    };
    await connectSchoolWebsite(data);
    expect(data.courses.map((c) => c.id)).toEqual(["course-b"]);
    expect(document.querySelector('[data-course="course-a"]')).toBeNull();
    expect(document.querySelector('option[value="course-a"]')).toBeNull();
  });
  it("uma configuração de login inválida não interrompe o website", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ portalUrl: "/invalid-relative" })),
    );
    await expect(connectSchoolWebsite({ courses: [] })).resolves.toMatchObject({
      portalUrl: "/invalid-relative",
    });
  });
  it("encaminha candidaturas abertas ao formulário oficial e bloqueia campanhas encerradas", async () => {
    for (const isOpen of [true, false]) {
      document.body.innerHTML =
        '<main><a id="apply" href="/candidatura/?curso=example">Candidatar-me</a></main>';
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL) =>
          String(url) === "/school-runtime.json"
            ? Response.json({ contentUrl: "https://siga.example/api/public/school-content/ISPAB" })
            : String(url) === "/content-bindings.json"
              ? Response.json({ version: "v1", fields: [] })
              : Response.json({
                  apiVersion: 1,
                  templateVersion: "v1",
                  values: {},
                  admissions: { isOpen, path: isOpen ? "/matricula/ispab-2026" : null },
                }),
        ),
      );
      await connectSchoolWebsite({ courses: [] });
      if (isOpen)
        expect(document.querySelector("#apply")?.getAttribute("href")).toBe(
          "https://siga.example/matricula/ispab-2026",
        );
      else {
        expect(document.querySelector("#apply")?.hasAttribute("href")).toBe(false);
        expect(document.querySelector("#apply")?.textContent).toMatch(/encerradas/);
      }
    }
  });
});

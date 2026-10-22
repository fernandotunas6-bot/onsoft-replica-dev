/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  builtInThemes,
  parseThemePackage,
  parseWebsiteDesign,
  publishDesign,
  designAttributes,
  setupSchoolDesign,
} from "../../painel/escolas/src/design.mjs";
import {
  changeWebsiteState,
  readWebsiteState,
  publicWebsiteContent,
  validateWebsiteDraft,
  websiteTemplate,
} from "@/features/school-website/content-model";
import { websiteDraftPreview } from "@/features/school-website/website-preview";
const custom = () => ({
  ...structuredClone(builtInThemes[1]),
  id: "custom-instituto",
  name: "Instituto próprio",
});
const draft = () => ({
  ...readWebsiteState(null).draft,
  websiteUrl: "https://school.example",
  values: { "data.courses.0.name": "Curso da escola" },
  design: parseWebsiteDesign({ activeTheme: "campus" }),
});
afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  for (const key of Object.keys(document.documentElement.dataset))
    if (key.startsWith("website")) delete document.documentElement.dataset[key];
});
describe("temas instaláveis por escola", () => {
  it("aceita os três temas base e um pacote compatível, sem alterar os conteúdos ao trocar", () => {
    for (const theme of builtInThemes)
      expect(publishDesign(parseWebsiteDesign({ activeTheme: theme.id })).appearance.layout).toBe(
        theme.appearance.layout,
      );
    const input = draft();
    input.design = {
      ...input.design,
      installedThemes: [parseThemePackage(custom())],
      activeTheme: "custom-instituto",
    };
    expect(validateWebsiteDraft(input).values).toEqual({
      "data.courses.0.name": "Curso da escola",
    });
    const state = changeWebsiteState(null, {
      expectedRevision: 0,
      action: "publish",
      draft: input,
    });
    const changed = changeWebsiteState(JSON.parse(JSON.stringify(state)), {
      expectedRevision: 1,
      action: "save",
      draft: { ...input, design: parseWebsiteDesign({ activeTheme: "minimal" }) },
    });
    expect(publicWebsiteContent(changed)?.design?.themeId).toBe("custom-instituto");
    expect(changed.draft.design?.activeTheme).toBe("minimal");
    const restored = changeWebsiteState(changed, { expectedRevision: 2, action: "restore" });
    expect(restored.draft.design?.activeTheme).toBe("custom-instituto");
    expect(restored.draft.values).toEqual(input.values);
  });
  it("publica apenas o tema activo e opções por página; temas instalados e rascunhos ficam privados", () => {
    const input = draft();
    input.design = parseWebsiteDesign({
      activeTheme: "editorial",
      installedThemes: [custom()],
      pages: { "/cursos/": { motion: "none", photos: "clean" } },
    });
    const state = changeWebsiteState(null, {
      expectedRevision: 0,
      action: "publish",
      draft: input,
    });
    const result = publicWebsiteContent(state)!;
    expect(JSON.stringify(result)).not.toContain("Instituto próprio");
    expect(result.design?.pages["/cursos/"]).toEqual({ motion: "none", photos: "clean" });
    expect(designAttributes(result.design!, "/cursos/")["data-website-motion"]).toBe("none");
    expect(designAttributes(result.design!, "/")["data-website-motion"]).toBe("fade");
    setupSchoolDesign({ design: result.design }, { path: "/cursos/" });
    expect(document.documentElement.dataset.websitePhotos).toBe("clean");
    expect(document.documentElement.style.getPropertyValue("--blue")).toBe("#183d70");
  });
  it("não migra nem muda o visual de publicações antigas sem opções de tema", () => {
    const state = readWebsiteState(null);
    expect(state.draft.design).toBeUndefined();
    const published = changeWebsiteState(null, {
      expectedRevision: 0,
      action: "publish",
      draft: { ...state.draft, websiteUrl: "https://school.example" },
    });
    expect(publicWebsiteContent(published)?.design).toBeNull();
    setupSchoolDesign({});
    expect(document.documentElement.dataset.websiteDesign).toBeUndefined();
  });
  it.each([
    { ...custom(), script: "alert(1)" },
    { ...custom(), version: 2 },
    { ...custom(), id: "campus" },
    { ...custom(), appearance: { ...custom().appearance, primary: "url(javascript:alert(1))" } },
    { ...custom(), appearance: { ...custom().appearance, text: "#ffffff" } },
    { ...custom(), appearance: { ...custom().appearance, motion: "infinite-script" } },
  ])("recusa pacotes inválidos e código arbitrário", (input) => {
    expect(() => parseThemePackage(input)).toThrow();
  });
  it("recusa tema não instalado, duplicados, excesso, páginas inexistentes e contraste insuficiente", () => {
    expect(() => parseWebsiteDesign({ activeTheme: "unknown" })).toThrow();
    expect(() =>
      parseWebsiteDesign({ activeTheme: "campus", installedThemes: [custom(), custom()] }),
    ).toThrow();
    expect(() =>
      parseWebsiteDesign({ activeTheme: "campus", installedThemes: Array(9).fill(custom()) }),
    ).toThrow();
    expect(() =>
      validateWebsiteDraft({
        ...draft(),
        design: { ...draft().design, pages: { "/nao-existe/": { motion: "none" } } },
      }),
    ).toThrow(/página/);
    expect(() =>
      parseWebsiteDesign({ activeTheme: "campus", pages: { "/portal/": { motion: "none" } } }),
    ).toThrow();
    expect(() =>
      parseWebsiteDesign({ activeTheme: "campus", overrides: { primary: "#ffffff" } }),
    ).toThrow(/contraste/);
  });
  it("mostra o rascunho numa prévia sem scripts, operações ou ligações activas", () => {
    const input = draft();
    input.design.activeTheme = "editorial";
    const html = websiteDraftPreview(
      input,
      "/cursos/engenharia-informatica/",
      "ISPAB",
      "https://portal.example",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.documentElement.dataset.websiteTheme).toBe("editorial");
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("a[href]")).toBeNull();
    expect(doc.querySelector(".academic-course-overview")).not.toBeNull();
    expect(doc.querySelector("h1")?.textContent).toBe("Curso da escola");
    expect(
      doc.querySelector('link[rel=stylesheet][href$="/style.css"]')?.getAttribute("href"),
    ).toBe("https://portal.example/_school-website/style.css");
    expect(websiteTemplate.fields).toHaveLength(4653);
  });
  it("respeita o logótipo próprio da escola na pré-visualização", () => {
    const html = websiteDraftPreview(
      draft(),
      "/",
      "Outra escola",
      "https://portal.example",
      "https://school.example/logo.png",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("a.brand img")?.getAttribute("src")).toBe(
      "https://school.example/logo.png",
    );
    expect(doc.querySelector(".ispab-wordmark")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  fieldsForStudioPage,
  mergeStudioValues,
  studioPage,
  studioPages,
  studioValues,
  studioPreviewDraft,
} from "@/features/school-website/studio/adapter";
import { studioSearchSchema } from "@/features/school-website/studio/navigation";
import {
  readWebsiteState,
  changeWebsiteState,
  websiteTemplate,
} from "@/features/school-website/content-model";
import { canAccessPath } from "@/features/auth/access-policy";
import { isPublicAppPath } from "@/lib/public-paths";

describe("adaptador Puck para o contrato institucional existente", () => {
  it("resolve páginas reais, recusa portal e recupera uma página inválida", () => {
    expect(studioPages.some((page) => page.url.startsWith("/portal/"))).toBe(false);
    expect(studioPage("/../../admin").url).toBe("/");
    expect(fieldsForStudioPage("/../../admin")).toEqual([]);
  });
  it("só apresenta campos ligados ao HTML da página escolhida", () => {
    const a = fieldsForStudioPage("/cursos/engenharia-informatica/");
    const b = fieldsForStudioPage("/contactos/");
    expect(a.some((field) => field.key === "data.courses.0.name")).toBe(true);
    expect(b.some((field) => field.key === "data.courses.0.name")).toBe(false);
    expect(a.some((field) => field.group === "Navegação")).toBe(true);
    expect(b.some((field) => field.group === "Rodapé")).toBe(true);
    expect(fieldsForStudioPage("/contactos/")).toBe(b);
  });
  it("não grava defaults não editados nem o JSON do Puck; conserva outros campos e publicação", () => {
    const fields = fieldsForStudioPage("/contactos/").slice(0, 2);
    const draft = {
      ...readWebsiteState(null).draft,
      values: { "data.courses.17.name": "preservado" },
    };
    expect(mergeStudioValues(draft, studioValues(draft, fields), fields)).toBe(draft);
    const changed = mergeStudioValues(
      draft,
      { [fields[0].key]: "Nome próprio", other: "injectado", school_id: "school-b" },
      fields,
    );
    expect(changed.values["data.courses.17.name"]).toBe("preservado");
    expect(changed.values[fields[0].key]).toBe("Nome próprio");
    expect(changed.values).not.toHaveProperty("school_id");
    expect(draft.values).not.toHaveProperty(fields[0].key);
    const state = changeWebsiteState(null, {
      action: "publish",
      expectedRevision: 0,
      draft: {
        ...draft,
        templateVersion: websiteTemplate.version,
        websiteUrl: "https://school.example",
      },
    });
    const saved = changeWebsiteState(state, {
      action: "save",
      expectedRevision: 1,
      draft: { ...changed, websiteUrl: "https://school.example" },
    });
    expect(saved.published).toEqual(state.published);
  });
  it("ignora tipos inválidos, protótipos e campos fora do âmbito", () => {
    const draft = readWebsiteState(null).draft;
    const fields = fieldsForStudioPage("/contactos/").slice(0, 1);
    for (const input of [
      null,
      [],
      "html",
      { [fields[0].key]: 123 },
      { [fields[0].key]: "x".repeat(12001) },
      Object.create({ [fields[0].key]: "injected" }),
    ])
      expect(mergeStudioValues(draft, input, fields)).toBe(draft);
  });
  it("valida página, largura e zoom sem aceitar estado privado na URL", () => {
    expect(
      studioSearchSchema.parse({
        pagina: "https://evil.example",
        largura: "999999",
        zoom: "1",
        token: "private",
      }),
    ).toEqual({ pagina: "/", largura: 1440, zoom: 50 });
    expect(studioSearchSchema.parse({ pagina: "/contactos/", largura: "390", zoom: "75" })).toEqual(
      { pagina: "/contactos/", largura: 390, zoom: 75 },
    );
  });
  it("a rota permanece privada e os grants de Gestão não substituem o cargo", () => {
    expect(isPublicAppPath("/website/editor")).toBe(false);
    expect(canAccessPath("/website/editor", "Administrador")).toBe(true);
    expect(canAccessPath("/website/editor", "Administrador", { gestao: "Nenhum" })).toBe(false);
    for (const role of ["Professor", "Secretaria", "Tesouraria", "Aluno", "Encarregado"])
      expect(canAccessPath("/website/editor", role, { gestao: "Total" })).toBe(false);
  });
});

it("a prévia respeita nomes académicos ligados sem alterar o rascunho editorial", () => {
  const draft = {
    ...readWebsiteState(null).draft,
    values: { "data.courses.0.name": "Nome editorial" },
    programBindings: { "data.courses.0.name": "course-a", "data.courses.1.name": "inactive" },
  };
  const preview = studioPreviewDraft(draft, [{ id: "course-a", name: "Nome académico oficial" }]);
  expect(preview.values["data.courses.0.name"]).toBe("Nome académico oficial");
  expect(preview.values["data.courses.1.name"]).toBe("Curso indisponível");
  expect(draft.values["data.courses.0.name"]).toBe("Nome editorial");
});

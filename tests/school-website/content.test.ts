import { describe, expect, it } from "vitest";
import {
  changeWebsiteState,
  changeWebsiteSchema,
  publicWebsiteContent,
  publishedAdmissionFee,
  readWebsiteState,
  validateWebsiteDraft,
  websiteTemplate,
} from "@/features/school-website/content-model";
import { createWebsiteContentHandler } from "@/features/school-website/content-http";
import { isPublicAppPath } from "@/lib/public-paths";

const text = websiteTemplate.fields.find((f) => f.kind === "text" && !f.dataPath)!;
const image = websiteTemplate.fields.find((f) => f.kind === "image")!;
const link = websiteTemplate.fields.find((f) => f.kind === "link")!;
const draft = (value = "Informação institucional") => ({
  templateVersion: websiteTemplate.version,
  websiteUrl: "https://school.example",
  values: { [text.key]: value },
  programBindings: {},
  campaignSlug: "",
});
const publish = () =>
  changeWebsiteState(null, { action: "publish", expectedRevision: 0, draft: draft() });
describe("editor e publicação escolar", () => {
  it("guardar um rascunho nunca o publica nem altera a publicação anterior", () => {
    const saved = changeWebsiteState(null, {
      action: "save",
      expectedRevision: 0,
      draft: draft("Rascunho privado"),
    });
    expect(publicWebsiteContent(saved)).toBeNull();
    const state = changeWebsiteState(publish(), {
      action: "save",
      expectedRevision: 1,
      draft: draft("Nova versão ainda privada"),
    });
    expect(publicWebsiteContent(state)?.values[text.key]).toBe("Informação institucional");
    expect(JSON.stringify(publicWebsiteContent(state))).not.toMatch(
      /privada|programBindings|websiteUrl|school_id|draft/,
    );
  });
  it("uma edição concorrente não sobrepõe a revisão mais recente", () => {
    expect(() =>
      changeWebsiteState(publish(), { action: "save", expectedRevision: 0, draft: draft() }),
    ).toThrow(/Outra pessoa/);
  });
  it("repor a publicação cria um rascunho; retirar a publicação fecha a API", () => {
    const state = changeWebsiteState(publish(), {
      action: "save",
      expectedRevision: 1,
      draft: draft("Pendente"),
    });
    const restored = changeWebsiteState(state, { action: "restore", expectedRevision: 2 });
    expect(restored.draft.values[text.key]).toBe("Informação institucional");
    const removed = changeWebsiteState(restored, { action: "unpublish", expectedRevision: 3 });
    expect(publicWebsiteContent(removed)).toBeNull();
    expect(removed.draft).toEqual(restored.draft);
  });
  it("recusa campos desconhecidos, um modelo incompatível e âmbito fornecido pelo cliente", () => {
    expect(() =>
      validateWebsiteDraft({ ...draft(), values: { "__proto__.admin": "true" } }),
    ).toThrow(/campo/);
    expect(() => validateWebsiteDraft({ ...draft(), templateVersion: "older" })).toThrow(/modelo/);
    expect(() =>
      changeWebsiteSchema.parse({
        action: "publish",
        expectedRevision: 0,
        draft: draft(),
        school_id: "another-school",
      }),
    ).toThrow();
    expect(() =>
      changeWebsiteState(null, {
        action: "publish",
        expectedRevision: 0,
        draft: { ...draft(), websiteUrl: "" },
      }),
    ).toThrow(/endereço/);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "//evil.example/a",
    "https://user:pass@example.com/",
    "/\\evil.example",
    "https://school.example/a\n",
  ])("recusa links e imagens inseguros: %s", (value) => {
    for (const field of [image, link])
      expect(() => validateWebsiteDraft({ ...draft(), values: { [field.key]: value } })).toThrow();
  });
  it("aceita texto literal, links locais e imagens HTTPS; protege os catálogos usados em HTML", () => {
    expect(
      validateWebsiteDraft({
        ...draft(),
        values: {
          [text.key]: "<b>Texto literal</b>",
          [image.key]: "https://images.example/campus.webp",
          [link.key]: "/cursos/?area=saude",
        },
      }),
    ).toBeTruthy();
    expect(() =>
      validateWebsiteDraft({
        ...draft(),
        values: { "data.courses.0.name": "<img onerror=alert(1)>" },
      }),
    ).toThrow(/texto simples/);
    expect(() =>
      validateWebsiteDraft({
        ...draft(),
        programBindings: { [text.key]: "11111111-1111-4111-8111-111111111111" },
      }),
    ).toThrow(/curso/);
  });
});

describe("API de conteúdo publicado", () => {
  const request = (origin: string | null = "https://school.example", method = "GET") =>
    new Request("https://siga.example/api/public/school-content/ISPAB", {
      method,
      headers: origin ? { Origin: origin } : {},
    });
  it("entrega apenas a publicação, com CORS exacto, sem cookies nem chaves", async () => {
    const handle = createWebsiteContentHandler(async () => ({
      state: publish(),
      programNames: {},
    }));
    const response = await handle(request(), "ISPAB");
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://school.example");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).values[text.key]).toBe("Informação institucional");
    expect(isPublicAppPath("/api/public/school-content/ISPAB")).toBe(true);
  });
  it("não confunde o domínio de outra escola, subdomínios ou prefixos", async () => {
    const handle = createWebsiteContentHandler(async () => ({
      state: publish(),
      programNames: {},
    }));
    for (const origin of [
      "https://school.example.evil.com",
      "https://another.example",
      "https://sub.school.example",
    ])
      expect((await handle(request(origin), "ISPAB")).status).toBe(403);
    expect((await handle(request(null), "ISPAB")).status).toBe(200);
    expect((await handle(request(undefined, "POST"), "ISPAB")).status).toBe(405);
    expect((await handle(request(undefined, "OPTIONS"), "ISPAB")).status).toBe(204);
  });
  it("curso ligado acompanha o nome e o estado sem divulgar IDs académicos", async () => {
    const handle = createWebsiteContentHandler(async () => ({
      state: publish(),
      programNames: { "data.courses.0.name": 'Curso "A"', "data.courses.1.name": null },
    }));
    const payload = await (await handle(request(), "ISPAB")).json();
    expect(payload.values["data.courses.0.name"]).toBe('Curso "A"');
    expect(payload.unavailablePrograms).toEqual(["data.courses.1.name"]);
    expect(payload.programBindings).toBeUndefined();
  });
  it("o encerramento da campanha não fecha a API de conteúdos nem abre candidaturas", async () => {
    const state = changeWebsiteState(null, {
      action: "publish",
      expectedRevision: 0,
      draft: { ...draft(), campaignSlug: "ispab-2026" },
    });
    for (const campaignOpen of [true, false]) {
      const handle = createWebsiteContentHandler(async () => ({
        state,
        programNames: {},
        campaignOpen,
      }));
      const response = await handle(request(), "ISPAB");
      expect(response.status).toBe(200);
      expect((await response.json()).admissions).toEqual({
        isOpen: campaignOpen,
        path: campaignOpen ? "/matricula/ispab-2026" : null,
      });
    }
  });
  it("escola ausente ou sem publicação retorna 404; uma falha não expõe detalhes", async () => {
    for (const state of [null, { state: readWebsiteState(null), programNames: {} }]) {
      const handle = createWebsiteContentHandler(async () => state);
      expect((await handle(request(), "ISPAB")).status).toBe(404);
    }
    const response = await createWebsiteContentHandler(async () => {
      throw Error("secret credentials");
    })(request(), "ISPAB");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
});

describe("taxa publicada e apresentação da escola", () => {
  it("mantém rascunhos antigos e só expõe a taxa publicada da campanha correspondente", () => {
    expect(validateWebsiteDraft(draft()).admissionFeeAmount).toBeUndefined();
    const state = changeWebsiteState(null, {
      action: "publish",
      expectedRevision: 0,
      draft: {
        ...draft(),
        campaignSlug: "ispab-2026",
        admissionFeeAmount: 24000,
        bannerStyle: "prism",
      },
    });
    const edited = changeWebsiteState(state, {
      action: "save",
      expectedRevision: 1,
      draft: {
        ...draft(),
        campaignSlug: "ispab-2026",
        admissionFeeAmount: 30000,
        bannerStyle: "classic",
      },
    });
    expect(publicWebsiteContent(edited)).toMatchObject({
      admissionFeeAmount: 24000,
      bannerStyle: "prism",
    });
    expect(publishedAdmissionFee(edited, "ispab-2026")).toBe(24000);
    expect(publishedAdmissionFee(edited, "another-school")).toBeNull();
    expect(publishedAdmissionFee(readWebsiteState(null), "ispab-2026")).toBeNull();
    const unpublished = changeWebsiteState(edited, { action: "unpublish", expectedRevision: 2 });
    expect(publishedAdmissionFee(unpublished, "ispab-2026")).toBeNull();
  });
  it.each([-1, 24.5, 100000001, Infinity, "24000"])(
    "recusa uma taxa inválida: %s",
    (admissionFeeAmount) => {
      expect(() => validateWebsiteDraft({ ...draft(), admissionFeeAmount })).toThrow();
    },
  );
});

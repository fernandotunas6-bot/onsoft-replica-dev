import { describe, expect, it } from "vitest";
import {
  defaultSchoolSiteSettings,
  parseSchoolSiteSettings,
  schoolSiteContentSchema,
  schoolSiteSaveInputSchema,
  withDraft,
  withPublication,
} from "@/features/school-site/schema";

describe("school-site v1 — publicação segura", () => {
  const defaults = () => defaultSchoolSiteSettings("Colégio Esperança");

  it("começa em rascunho, nunca publicado por omissão", () => {
    const site = defaults();
    expect(site.draft.title).toBe("Colégio Esperança");
    expect(site.published).toBeNull();
    expect(site.publishedAt).toBeNull();
  });

  it("editar rascunho não modifica o conteúdo publicado", () => {
    const published = withPublication(defaults(), new Date("2026-10-20T10:00:00Z"));
    const changed = withDraft(published, { ...published.draft, title: "Novo título" });
    expect(changed.published?.title).toBe("Colégio Esperança");
    expect(changed.draft.title).toBe("Novo título");
  });

  it("publicar cria snapshot distinto do rascunho e data ISO", () => {
    const site = withPublication(defaults(), new Date("2026-10-20T10:30:00Z"));
    expect(site.published).toEqual(site.draft);
    expect(site.published).not.toBe(site.draft);
    expect(site.publishedAt).toBe("2026-10-20T10:30:00.000Z");
    expect(parseSchoolSiteSettings(site).published).not.toBeNull();
  });

  it("rejeita URL sem HTTPS e credenciais embutidas", () => {
    const draft = defaults().draft;
    for (const value of [
      "javascript:alert(1)",
      "http://example.org/image.png",
      "https://user:password@example.org/a.png",
      "https://localhost/logo.png",
    ]) {
      expect(schoolSiteContentSchema.safeParse({ ...draft, heroImageUrl: value }).success).toBe(false);
    }
  });

  it("rejeita propriedades extras que tentem injectar HTML ou escopo escolar", () => {
    const draft = defaults().draft;
    expect(schoolSiteContentSchema.safeParse({ ...draft, html: "<script>bad()</script>" }).success).toBe(false);
    expect(schoolSiteSaveInputSchema.safeParse({
      expectedVersion: 0, draft, schoolId: "another-tenant",
    }).success).toBe(false);
  });

  it("rejeita cor inválida, versão malformada e campos grandes", () => {
    const draft = defaults().draft;
    expect(schoolSiteContentSchema.safeParse({ ...draft, primaryColor: "red" }).success).toBe(false);
    expect(schoolSiteSaveInputSchema.safeParse({ expectedVersion: -1, draft }).success).toBe(false);
    expect(schoolSiteContentSchema.safeParse({ ...draft, title: "X".repeat(121) }).success).toBe(false);
  });

  it("não inventa contactos públicos sem autorização", () => {
    expect(defaults().draft.showContact).toBe(false);
  });
});

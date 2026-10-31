import { describe, expect, it } from "vitest";
import {
  changeWebsiteState,
  publicWebsiteContent,
  readWebsiteState,
  websiteTemplate,
} from "@/features/school-website/content-model";
describe("actualizações aditivas do website escolar", () => {
  it("lê a publicação ISPAB antiga sem apagar dados nem confundir versão de template", () => {
    const old = {
      revision: 1,
      draft: {
        templateVersion: "96cb157ddf38b2059299",
        websiteUrl: "https://ispab.portal-siga.com/",
        values: {},
        programBindings: {},
        campaignSlug: "",
      },
      published: {
        revision: 1,
        publishedAt: "2026-10-22T14:00:00Z",
        content: {
          templateVersion: "96cb157ddf38b2059299",
          websiteUrl: "https://ispab.portal-siga.com/",
          values: {},
          programBindings: {},
          campaignSlug: "",
        },
      },
    };
    const state = readWebsiteState(old);
    expect(state.draft.templateVersion).toBe(websiteTemplate.version);
    expect(state.published?.content.templateVersion).toBe(websiteTemplate.version);
    expect(publicWebsiteContent(state)?.values).toEqual({});
    expect(old.published.content.templateVersion).toBe("96cb157ddf38b2059299");
  });
  it.each([
    "2ab6e331ce0e67b8044e",
    "5fd4cbb7d43915bde5c6",
    "b7bb3fc0893638fd4fd6",
    "96cb157ddf38b2059299",
  ])(
    "conserva a publicação, o rascunho e as edições de %s",
    (templateVersion) => {
      const key = websiteTemplate.fields.find((f) => f.kind === "text")!.key;
      const draft = {
        templateVersion,
        websiteUrl: "https://school.example",
        values: { [key]: "Texto da escola" },
        programBindings: {},
        campaignSlug: "",
        admissionFeeAmount: 24000,
        bannerStyle: "classic" as const,
      };
      const stored = {
        revision: 4,
        draft,
        published: {
          revision: 3,
          publishedAt: "2026-10-21T00:00:00Z",
          content: structuredClone(draft),
        },
      };
      const state = readWebsiteState(stored);
      expect(state.revision).toBe(4);
      expect(state.draft.values).toEqual(draft.values);
      expect(state.published?.revision).toBe(3);
      expect(state.draft.templateVersion).toBe(websiteTemplate.version);
      expect(publicWebsiteContent(state)?.values[key]).toBe("Texto da escola");
      expect(
        changeWebsiteState(stored, { expectedRevision: 4, action: "restore" }).draft.values,
      ).toEqual(draft.values);
      expect(stored.draft.templateVersion).toBe(templateVersion);
    },
  );
});

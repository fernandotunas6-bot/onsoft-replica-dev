import { describe, expect, it } from "vitest";
import {
  changeWebsiteState,
  publicWebsiteContent,
  readWebsiteState,
  websiteTemplate,
} from "@/features/school-website/content-model";
describe("actualização aditiva da selecção de portal", () => {
  it("conserva a publicação, o rascunho, a revisão e as edições anteriores", () => {
    const key = websiteTemplate.fields.find((f) => f.kind === "text")!.key;
    const draft = {
      templateVersion: "2ab6e331ce0e67b8044e",
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
    expect(stored.draft.templateVersion).toBe("2ab6e331ce0e67b8044e");
  });
});

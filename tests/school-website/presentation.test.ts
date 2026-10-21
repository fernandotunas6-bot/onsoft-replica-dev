/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Public website uses browser-native modules.
import * as presentation from "../../painel/escolas/src/presentation.mjs";
const { admissionFeeLabel, admissionSummaryHTML, setupSchoolPresentation } = presentation;
// @ts-expect-error Public website uses browser-native modules.
import { connectSchoolWebsite } from "../../painel/escolas/src/site-content.mjs";
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
describe("apresentação pública por escola", () => {
  it("trata o nome como texto e mantém as decorações fora da acessibilidade", () => {
    document.body.innerHTML =
      '<div class="hero-visual"></div><aside class="application-aside"></aside>';
    setupSchoolPresentation({
      schoolName: "<img src=x onerror=alert(1)>",
      bannerStyle: "prism",
      admissionFeeAmount: 24000,
    });
    setupSchoolPresentation({
      schoolName: "Outra escola",
      bannerStyle: "prism",
      admissionFeeAmount: 24000,
    });
    expect(document.querySelectorAll(".school-monogram")).toHaveLength(1);
    expect(document.querySelector(".school-monogram")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelectorAll(".admission-summary")).toHaveLength(1);
    expect(document.querySelector(".admission-summary")?.textContent).toMatch(/24\D000 Kz/);
    expect(admissionSummaryHTML({ admissionFeeAmount: "<script>" })).not.toContain("<script>");
    expect(admissionFeeLabel(-1)).toBe("A confirmar pela escola");
  });
  it.each([true, false])(
    "nunca usa a taxa estática de ISPAB numa escola ligada; API disponível: %s",
    async (available) => {
      document.body.innerHTML = "<main></main>";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "/school-runtime.json")
            return Response.json({
              schoolName: "Outra escola",
              admissionFeeAmount: 24000,
              bannerStyle: "prism",
              contentUrl: "https://siga.example/api/public/school-content/OUTRA",
            });
          if (url === "/content-bindings.json") return Response.json({ version: "v1", fields: [] });
          return available
            ? Response.json({
                apiVersion: 1,
                templateVersion: "v1",
                values: {},
                admissionFeeAmount: 12000,
                bannerStyle: "classic",
              })
            : new Response(null, { status: 503 });
        }),
      );
      const config = await connectSchoolWebsite({ courses: [] });
      expect(config.admissionFeeAmount).toBe(available ? 12000 : null);
      expect(config.bannerStyle).toBe("classic");
    },
  );
});

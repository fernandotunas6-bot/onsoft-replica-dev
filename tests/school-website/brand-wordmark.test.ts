/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Public website intentionally uses native browser modules.
import { setupInstitutionWordmark } from "../../painel/escolas/src/brand-wordmark.mjs";
afterEach(() => {
  document.body.innerHTML = "";
});
describe("identidade ISPAB", () => {
  const mount = () => {
    document.body.innerHTML =
      '<a class="brand" href="/"><svg aria-hidden="true"></svg><span><!--site:brand-->ISPAB<!--/site--><span class="brand-dot">.</span></span></a>';
  };
  it("aplica a textura mantendo o nome acessível, a ligação e o campo editável original", async () => {
    mount();
    const loadImage = vi.fn(async () => true);
    await setupInstitutionWordmark({ schoolName: "ISPAB" }, { loadImage });
    await setupInstitutionWordmark({ schoolName: "ISPAB" }, { loadImage });
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(".brand-wordmark-art")).toHaveLength(1);
    expect(document.querySelector(".brand-wordmark-art")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".brand")?.textContent).toBe("ISPAB.");
    expect(document.querySelector(".brand")?.innerHTML).toContain("<!--site:brand-->");
    expect(document.querySelector(".brand")?.getAttribute("href")).toBe("/");
  });
  it("mantém a marca anterior quando a imagem falha e respeita o logótipo próprio de outras escolas", async () => {
    mount();
    await setupInstitutionWordmark({ schoolName: "ISPAB" }, { loadImage: async () => false });
    expect(document.querySelector(".ispab-wordmark")).toBeNull();
    const loadImage = vi.fn(async () => true);
    await setupInstitutionWordmark({ schoolName: "Outra escola" }, { loadImage });
    expect(loadImage).not.toHaveBeenCalled();
    document
      .querySelector(".brand")!
      .insertAdjacentHTML("afterbegin", '<img src="/custom-school-logo.png" alt="">');
    await setupInstitutionWordmark({ schoolName: "ISPAB" }, { loadImage });
    expect(loadImage).not.toHaveBeenCalled();
    expect(document.querySelector(".ispab-wordmark")).toBeNull();
  });
});

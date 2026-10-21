import { expect, test } from "@playwright/test";

/**
 * Comparação visual não destrutiva entre a homepage original ISPAB e /site.
 * Só localhost, com conteúdo da nova escola inteiramente fictício.
 *
 * O ensaio produz 4 capturas (original/adaptação a 390 e 1440 px).
 * Confirma tokens e geometria; não declara pixel-perfect.
 */
const enabled = process.env.SIGA_SCHOOL_SITE_PARITY_E2E === "1";
const originalOrigin = process.env.SCHOOL_ISPAB_REFERENCE_URL ?? "http://127.0.0.1:4174";
const appOrigin = process.env.VITE_SIGA_URL ?? "http://localhost:3006";

if (enabled) {
  for (const address of [originalOrigin, appOrigin]) {
    const url = new URL(address);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      throw new Error("Comparação ISPAB: os dois websites devem estar em HTTP localhost.");
    }
  }
}

test.use({ screenshot: "off", video: "off", trace: "off" });

test.describe("Website escolar — contrato visual de referência ISPAB", () => {
  test.skip(!enabled, "Comparação opt-in apenas com dois servidores locais.");

  const fixture = {
    site: {
      schoolName: "Colégio de Demonstração",
      publishedAt: "2026-10-20T10:00:00.000Z",
      content: {
        title: "Colégio de Demonstração",
        tagline: "Aprender, descobrir e construir o futuro.",
        about: "Conteúdo exclusivamente fictício para comparação visual.",
        heroImageUrl: null,
        primaryColor: "#1558ee",
        showContact: false,
      },
      contact: null,
    },
  };

  for (const width of [390, 1440]) {
    test(`original e adaptação preservam tipografia, hierarquia e navegação a ${width}px`, async ({
      browser,
    }, testInfo) => {
      const original = await browser.newPage({ viewport: { width, height: 900 } });
      const adapted = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await adapted.route("**/api/public/school-site", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(fixture),
          }),
        );
        await Promise.all([
          original.goto(originalOrigin, { waitUntil: "domcontentloaded" }),
          adapted.goto(appOrigin + "/site", { waitUntil: "domcontentloaded" }),
        ]);
        await expect(original.locator(".site-header")).toBeVisible();
        await expect(original.locator(".home-hero")).toBeVisible();
        await expect(adapted.locator(".school-site__header")).toBeVisible();
        await expect(adapted.locator(".school-site__hero")).toBeVisible();

        const metrics = async (page: typeof adapted, root: string, header: string, hero: string) =>
          page.evaluate(
            ({ root, header, hero }) => {
              const body = document.querySelector(root);
              const heading = document.querySelector(hero + " h1");
              const nav = document.querySelector(header);
              const heroElement = document.querySelector(hero);
              if (!body || !heading || !nav || !heroElement) throw Error("Estrutura em falta");
              return {
                bodyFont: getComputedStyle(body).fontFamily,
                headingFont: getComputedStyle(heading).fontFamily,
                headerHeight: nav.getBoundingClientRect().height,
                gridColumns: getComputedStyle(heroElement).gridTemplateColumns,
                scrollWidth: document.documentElement.scrollWidth,
                viewportWidth: document.documentElement.clientWidth,
              };
            },
            { root, header, hero },
          );

        const [a, b] = await Promise.all([
          metrics(original, "body", ".site-header", ".home-hero"),
          metrics(adapted, ".school-site", ".school-site__header", ".school-site__hero"),
        ]);
        for (const current of [a, b]) {
          expect(current.bodyFont).toContain("DM Sans");
          expect(current.headingFont).toContain("Manrope");
          expect(current.scrollWidth).toBeLessThanOrEqual(current.viewportWidth + 2);
        }
        if (width === 1440) {
          expect(Math.abs(a.headerHeight - b.headerHeight)).toBeLessThanOrEqual(12);
          const ratio = (value: string) => {
            const columns = value.split(" ").map(Number.parseFloat);
            return (columns[0] ?? 0) / (columns[1] ?? 1);
          };
          expect(Math.abs(ratio(a.gridColumns) - ratio(b.gridColumns))).toBeLessThan(0.13);
        }

        // Apenas as duas homepages, sem dados privados de alunos.
        await original.screenshot({
          path: testInfo.outputPath(`ispab-original-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
        await adapted.screenshot({
          path: testInfo.outputPath(`siga-adaptado-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      } finally {
        await original.close();
        await adapted.close();
      }
    });
  }
});

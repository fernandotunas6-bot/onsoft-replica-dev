import { expect, test } from "@playwright/test";

/**
 * Ensaio visual da nova página escolar com dados inteiramente fictícios.
 * Opt-in e SOMENTE em localhost; não lê nem escreve em escolas de produção.
 *
 * SIGA_SCHOOL_SITE_VISUAL_E2E=1 VITE_SIGA_URL=http://localhost:3006 \
 *   bunx playwright test tests/e2e/school-site-visual.spec.ts
 */
const enabled = process.env.SIGA_SCHOOL_SITE_VISUAL_E2E === "1";
const baseURL = process.env.VITE_SIGA_URL ?? "http://localhost:3006";

if (enabled) {
  const origin = new URL(baseURL);
  if (
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
    origin.username ||
    origin.password
  ) {
    throw new Error("School-site visual: o ensaio só pode usar HTTP localhost.");
  }
}

const fixture = {
  site: {
    schoolName: "Colégio Visual de Testes",
    publishedAt: "2026-10-20T10:00:00.000Z",
    content: {
      title: "Colégio Visual de Testes",
      tagline: "Aprender. Descobrir. Construir o futuro.",
      about: "Uma instituição de demonstração, sem dados reais de alunos.",
      heroImageUrl: null,
      primaryColor: "#1558ee",
      showContact: false,
    },
    contact: null,
  },
};

test.describe("School Sites v1 — estilo institucional e adaptação responsiva", () => {
  test.skip(!enabled, "Apenas com SIGA_SCHOOL_SITE_VISUAL_E2E=1 em localhost.");

  // Fixtures não têm dados reais; não produzir capturas ou traces por omissão.
  test.use({ trace: "off", video: "off", screenshot: "off" });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/public/school-site", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
    });
  });

  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    test(`composição sem overflow em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width <= 390 ? 780 : 900 });
      await page.goto("/site", { waitUntil: "domcontentloaded" });

      await expect(page.locator(".school-site__header")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: /Colégio Visual de Testes/ })).toBeVisible();
      await expect(page.locator(".school-site__hero-visual")).toBeVisible();
      await expect(page.locator(".school-site__footer")).toBeVisible();
      await expect(page.getByRole("link", { name: /Aceder ao portal/i })).toHaveAttribute("href", "/");

      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2);

      if (width <= 760) {
        await page.locator(".school-site__menu summary").click();
        await expect(page.getByRole("navigation", { name: "Navegação móvel" })).toBeVisible();
      } else {
        await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
      }
    });
  }

  test("a página pública não revela rascunho e segue a tipografia institucional", async ({ page }) => {
    await page.goto("/site");
    await expect(page.locator(".school-site__hero")).toBeVisible();
    const presentation = await page.locator(".school-site").evaluate((node) => ({
      family: getComputedStyle(node).fontFamily,
      background: getComputedStyle(node).backgroundColor,
    }));
    expect(presentation.family).toContain("Inter");
    expect(presentation.background).toBe("rgb(255, 255, 255)");
    expect(await page.locator("body").innerText()).not.toContain("draft");
    expect(await page.locator("body").innerText()).not.toContain("tenant-a");
  });

  test("movimento reduzido mantém leitura e links", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/site");
    await expect(page.getByRole("link", { name: /Aceder ao portal/i })).toBeVisible();
    const duration = await page.locator(".school-site__button").first().evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );
    expect(duration.split(",").every((time) => Number.parseFloat(time) === 0)).toBe(true);
  });
});

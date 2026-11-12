import { expect, test } from "@playwright/test";
import { ECOSYSTEM_E2E_URLS } from "./helpers/ecosystem-urls";

/** Regressão da navegação mobile do WEB — sem criar escolas nem modificar dados. */
test.describe("WEB — menu mobile de soluções", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(ECOSYSTEM_E2E_URLS.web);
    await page.getByRole("button", { name: "Abrir menu" }).click();
  });

  test("abre soluções ao toque e recolhe novamente", async ({ page }) => {
    const menu = page.getByRole("dialog");
    const solutions = menu.getByRole("button", { name: "Soluções" });

    await expect(solutions).toHaveAttribute("aria-expanded", "false");
    await solutions.click();
    await expect(solutions).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("group", { name: "Soluções" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Gestão escolar" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Ensino público" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Secretaria e matrículas" })).toBeVisible();

    await solutions.click();
    await expect(solutions).toHaveAttribute("aria-expanded", "false");
    await expect(menu.getByRole("group", { name: "Soluções" })).toHaveCount(0);
  });

  test("Criar escola, Aplicação Desktop e Ensino público têm destinos certos", async ({ page }) => {
    let menu = page.getByRole("dialog");
    await expect(menu.getByRole("link", { name: "Aplicação Desktop" })).toHaveAttribute(
      "href",
      "/download",
    );
    await expect(menu.getByRole("link", { name: "Criar escola" })).toHaveAttribute(
      "href",
      "/start",
    );

    await menu.getByRole("button", { name: "Soluções" }).click();
    await menu.getByRole("link", { name: "Ensino público" }).click();
    await expect(page).toHaveURL(/ensino-publico/);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Abrir menu" }).click();
    menu = page.getByRole("dialog");
    await expect(menu.getByRole("button", { name: "Soluções" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

import { test, expect } from "@playwright/test";
import { ECOSYSTEM_E2E_URLS } from "./helpers/ecosystem-urls";

test.describe("WEB — wizard comercial /start", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${ECOSYSTEM_E2E_URLS.web}/start`);
    await expect(page.getByRole("heading", { name: "Criar a minha escola" })).toBeVisible();
  });

  test("percorre passos 1–6 até revisão sem submeter", async ({ page }) => {
    await page.getByLabel("Nome da instituição").fill("Colégio E2E Playwright");
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByLabel("Nome do responsável").fill("Ana Director");
    await page.getByLabel("E-mail", { exact: true }).fill("ana.director@e2e.siga.test");
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: /Continuar/ }).click();

    await expect(page.getByLabel("Nome do administrador inicial")).toHaveValue("Ana Director");
    await expect(page.getByLabel("E-mail da conta SIGA")).toHaveValue("ana.director@e2e.siga.test");
    await page.getByRole("button", { name: /Continuar/ }).click();

    const slugField = page.getByLabel("Subdomínio SIGA");
    await expect(slugField).not.toHaveValue("");
    await page.getByRole("button", { name: /Continuar/ }).click();

    await expect(page.getByText("Colégio E2E Playwright")).toBeVisible();
    await expect(page.getByText("Ana Director")).toBeVisible();
    await expect(page.getByRole("button", { name: /Criar escola/ })).toBeVisible();
  });
});

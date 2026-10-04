import { test, expect } from "@playwright/test";
import { ECOSYSTEM_E2E_URLS } from "./helpers/ecosystem-urls";

/**
 * Assistente "Criar a sua escola" do WEB (painel/web/src/app/start/page.tsx), 7 passos:
 * Instituição → Localização → Responsável → Plano → Conta → Endereço → Revisão.
 * Percorre até à revisão sem submeter (não cria escola).
 */
test.describe("WEB — wizard comercial /start", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${ECOSYSTEM_E2E_URLS.web}/start`);
    await expect(page.getByRole("heading", { name: "Criar a sua escola" })).toBeVisible();
  });

  test("percorre os 7 passos até à revisão sem submeter", async ({ page }) => {
    const continuar = page.getByRole("button", { name: /Continuar/ });

    // 1. Instituição — o NIF é obrigatório (9–10 dígitos) e é preciso pelo menos
    // um nível de ensino. Fica o Primário: o II Ciclo abriria os cursos do médio.
    await page.getByLabel("Nome oficial da instituição").fill("Colégio E2E Playwright");
    await page.getByLabel("NIF da instituição").fill("5417000001");
    await page.getByRole("checkbox", { name: /Ensino Primário/ }).click();
    await continuar.click();

    // 2. Localização — província e município obrigatórios.
    await expect(page.getByText("Passo 2 de 7")).toBeVisible();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Luanda", exact: true }).click();
    await page.getByLabel("Município").fill("Belas");
    await continuar.click();

    // 3. Responsável.
    await expect(page.getByText("Passo 3 de 7")).toBeVisible();
    await page.getByLabel("Nome do responsável").fill("Ana Director");
    await page.getByLabel("E-mail", { exact: true }).fill("ana.director@e2e.siga.test");
    await continuar.click();

    // 4. Plano — fica o recomendado.
    await expect(page.getByText("Passo 4 de 7")).toBeVisible();
    await continuar.click();

    // 5. Conta — nome e e-mail vêm do responsável.
    await expect(page.getByText("Passo 5 de 7")).toBeVisible();
    await expect(page.getByLabel("Nome do administrador")).toHaveValue("Ana Director");
    await expect(page.getByLabel("E-mail da conta SIGA")).toHaveValue("ana.director@e2e.siga.test");
    await page.getByLabel("Senha de acesso").fill("Escola2026e2e");
    await page.getByLabel("Confirmar senha").fill("Escola2026e2e");
    await continuar.click();

    // 6. Endereço — subdomínio sugerido a partir do nome.
    await expect(page.getByText("Passo 6 de 7")).toBeVisible();
    await expect(page.getByLabel("Subdomínio SIGA")).not.toHaveValue("");
    await continuar.click();

    // 7. Revisão.
    await expect(page.getByText("Passo 7 de 7")).toBeVisible();
    await expect(page.getByText("Colégio E2E Playwright").first()).toBeVisible();
    await expect(
      page.getByText(/Ana Director · ana\.director@e2e\.siga\.test/).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Criar escola/ })).toBeVisible();
  });
});

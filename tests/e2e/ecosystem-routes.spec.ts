import { test, expect } from "@playwright/test";
import { ECOSYSTEM_E2E_URLS } from "./helpers/ecosystem-urls";

test.describe("Ecossistema — rotas públicas (Fase 13)", () => {
  test("WEB landing responde", async ({ page }) => {
    const res = await page.goto(ECOSYSTEM_E2E_URLS.web);
    expect(res?.ok()).toBeTruthy();
  });

  test("WEB wizard /start abre", async ({ page }) => {
    await page.goto(`${ECOSYSTEM_E2E_URLS.web}/start`);
    await expect(page.getByRole("heading", { name: "Criar a sua escola" })).toBeVisible();
  });

  test("DOC home responde", async ({ page }) => {
    const res = await page.goto(ECOSYSTEM_E2E_URLS.docs);
    expect(res?.ok()).toBeTruthy();
  });

  test("ADMIN /tenants redirecciona para sign-in sem sessão", async ({ page }) => {
    await page.goto(`${ECOSYSTEM_E2E_URLS.admin}/tenants`);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  for (const path of ["/platform-admins", "/audit", "/domains", "/subscriptions"]) {
    test(`ADMIN ${path} redirecciona para sign-in sem sessão`, async ({ page }) => {
      await page.goto(`${ECOSYSTEM_E2E_URLS.admin}${path}`);
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }

  test("SIGA home responde", async ({ page }) => {
    const res = await page.goto(ECOSYSTEM_E2E_URLS.siga);
    expect(res?.ok() || res?.status() === 302).toBeTruthy();
  });
});

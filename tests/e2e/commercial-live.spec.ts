import { test, expect } from "@playwright/test";
import {
  buildSignupPayload,
  ECOSYSTEM_E2E_URLS,
  getPublicEnrollmentUrl,
  isLiveE2EEnabled,
  uniqueE2ESlug,
} from "./helpers/ecosystem-urls";
import { cleanupE2ETenantBySlug } from "./helpers/sga-live-admin";

test.describe("Provisionamento comercial @live", () => {
  test.skip(!isLiveE2EEnabled(), "Defina SIGA_E2E_LIVE=1 com apps locais e Supabase configurado.");

  test("API signup cria tenant, bootstrap e resolve lookup por slug", async ({ request }) => {
    const slug = uniqueE2ESlug();
    const payload = buildSignupPayload(slug);
    try {
      const res = await request.post(`${ECOSYSTEM_E2E_URLS.siga}/api/saas/signup`, {
        data: payload,
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as {
        tenantId?: string;
        slug?: string;
        sigaUrl?: string;
        adminTenantsUrl?: string;
        bootstrapSeeded?: string[];
        adminInviteDelivered?: boolean;
      };
      expect(body.slug).toBe(slug);
      expect(body.tenantId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(body.adminTenantsUrl).toMatch(/\/tenants$/);
      expect(body.sigaUrl).toMatch(/^https?:\/\//);
      expect(body.bootstrapSeeded?.length).toBeGreaterThan(0);
      // O provisionamento não pode depender da entrega de e-mail, e o link de
      // definição de senha nunca sai pela API pública.
      expect(typeof body.adminInviteDelivered).toBe("boolean");
      expect(body).not.toHaveProperty("adminSetupUrl");

      const lookup = await request.get(
        `${ECOSYSTEM_E2E_URLS.siga}/api/saas/tenants/lookup?slug=${encodeURIComponent(slug)}`,
      );
      expect(lookup.ok()).toBeTruthy();
      const lookupBody = (await lookup.json()) as { tenant?: { slug?: string; status?: string } };
      expect(lookupBody.tenant?.slug).toBe(slug);
      expect(lookupBody.tenant?.status).toBe("active");

      const enrollmentPage = await request.get(getPublicEnrollmentUrl(slug));
      expect(enrollmentPage.ok()).toBeTruthy();
    } finally {
      await cleanupE2ETenantBySlug(slug, payload.admin_email).catch(() => undefined);
    }
  });

  test("wizard WEB percorre os 7 passos e apresenta as 3 entradas", async ({ page }) => {
    test.setTimeout(180_000);
    const slug = uniqueE2ESlug("web");
    const email = `e2e+${slug}@siga-plus.test`;
    const school = `Escola Live ${slug}`;
    const nif = `5417${String(Date.now() % 1_000_000).padStart(6, "0")}`;
    const continuar = page.getByRole("button", { name: /Continuar/ });

    try {
      await page.goto(`${ECOSYSTEM_E2E_URLS.web}/start`);

      // 1. Instituição (nome, NIF e nível) e 2. Localização.
      await page.getByLabel("Nome oficial da instituição").fill(school);
      await page.getByLabel("NIF da instituição").fill(nif);
      await page.getByRole("checkbox", { name: /Ensino Primário/ }).click();
      await continuar.click();
      await expect(page.getByText("Passo 2 de 7")).toBeVisible();
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Huambo", exact: true }).click();
      await page.getByLabel("Município").fill("Huambo");
      await continuar.click();

      // 3. Responsável; 4. Plano; 5. Conta do administrador.
      await expect(page.getByText("Passo 3 de 7")).toBeVisible();
      await page.getByLabel("Nome do responsável").fill("Live Director");
      await page.getByLabel("E-mail", { exact: true }).fill(email);
      await continuar.click();
      await expect(page.getByText("Passo 4 de 7")).toBeVisible();
      await continuar.click();
      await expect(page.getByText("Passo 5 de 7")).toBeVisible();
      await expect(page.getByLabel("E-mail da conta SIGA")).toHaveValue(email);
      await page.getByLabel("Senha de acesso").fill("Escola2026e2e");
      await page.getByLabel("Confirmar senha").fill("Escola2026e2e");
      await continuar.click();

      // 6. Endereço; 7. Revisão e criação (apenas num staging autorizado).
      await expect(page.getByText("Passo 6 de 7")).toBeVisible();
      await page.getByLabel("Subdomínio SIGA").fill(slug);
      await continuar.click();
      await expect(page.getByText("Passo 7 de 7")).toBeVisible();
      await expect(page.getByText(school).first()).toBeVisible();
      await page.getByRole("button", { name: /Criar escola/ }).click();

      // O sucesso actual dá três escolhas de entrada. Não confundir a
      // presença de links com a prova de uma sessão/admin autenticada.
      await expect(page.getByText(`${school} está criada`)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("1. Escola criada")).toBeVisible();
      await expect(page.getByRole("link", { name: /Painel Administrativo/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Portal Escolar/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Assistente de configuração/ })).toBeVisible();
      await expect(page.getByText(`${slug}.portal-siga.com`).first()).toBeVisible();
    } finally {
      await cleanupE2ETenantBySlug(slug, email).catch(() => undefined);
    }
  });
});

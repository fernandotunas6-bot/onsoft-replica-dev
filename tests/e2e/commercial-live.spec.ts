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
    };
    expect(body.slug).toBe(slug);
    expect(body.tenantId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.adminTenantsUrl).toMatch(/\/tenants$/);
    expect(body.sigaUrl).toMatch(/^https?:\/\//);
    expect(body.bootstrapSeeded?.length).toBeGreaterThan(0);

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

  test("wizard WEB conclui com ecrã de sucesso", async ({ page }) => {
    const slug = uniqueE2ESlug("web");
    const email = `e2e+${slug}@siga-plus.test`;

    try {
    await page.goto(`${ECOSYSTEM_E2E_URLS.web}/start`);
    await page.getByLabel("Nome da instituição").fill(`Escola Live ${slug}`);
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByLabel("Nome do responsável").fill("Live Director");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByLabel("Subdomínio SIGA").fill(slug);
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.getByRole("button", { name: /Criar escola/ }).click();

    await expect(page.getByRole("heading", { name: "Escola criada" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Abrir o SIGA Plus" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ver no Control Center (ADMIN)" }),
    ).toBeVisible();
    await expect(page.getByText(`${slug}.portal-siga.com`)).toBeVisible();
    } finally {
      await cleanupE2ETenantBySlug(slug, email).catch(() => undefined);
    }
  });
});

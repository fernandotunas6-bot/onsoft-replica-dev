import { createHmac } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  buildSignupPayload,
  ECOSYSTEM_E2E_URLS,
  isLiveE2EEnabled,
  uniqueE2ESlug,
} from "./helpers/ecosystem-urls";
import {
  cleanupE2ETenantBySlug,
  E2E_GATEWAY_SCHOOL_WEBHOOK_KEY,
  findSchoolIdByTenantSlug,
  getE2EGatewayDevApiKey,
  getFinanceInvoiceStatus,
  getPaymentPlanStatus,
  installE2EMulticaixaIntegration,
  installE2EUnitelIntegration,
  seedE2EGatewayFixture,
  E2E_UNITEL_SCHOOL_WEBHOOK_KEY,
} from "./helpers/sga-live-admin";

/** Aviso assinado como o provedor o envia (a key nunca vai no corpo). */
function signedGatewayPost(
  request: APIRequestContext,
  url: string,
  key: string,
  body: Record<string, unknown>,
) {
  const payload = { externalId: `e2e-${Date.now()}`, ...body };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac("sha256", key).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  return request.post(url, {
    data: rawBody,
    headers: {
      "Content-Type": "application/json",
      "X-SIGA-Timestamp": timestamp,
      "X-SIGA-Signature": signature,
    },
  });
}

test.describe("Gateway EMIS @live", () => {
  test.skip(!isLiveE2EEnabled(), "Defina SIGA_E2E_LIVE=1 com apps locais e Supabase configurado.");

  test("SIGA_GATEWAY_DEV_API_KEY liquida fatura e plano pending_gateway", async ({ request }) => {
    const slug = uniqueE2ESlug("gw");
    const payload = buildSignupPayload(slug);
    const apiKey = getE2EGatewayDevApiKey();

    try {
      const signup = await request.post(`${ECOSYSTEM_E2E_URLS.siga}/api/saas/signup`, {
        data: payload,
      });
      expect(signup.ok()).toBeTruthy();

      const schoolId = await findSchoolIdByTenantSlug(slug);
      expect(schoolId).toBeTruthy();

      const fixture = await seedE2EGatewayFixture(schoolId!, { amount: 45_000 });

      const confirm = await signedGatewayPost(
        request,
        `${ECOSYSTEM_E2E_URLS.siga}/api/finance/gateway/confirm`,
        apiKey,
        {
          reference: fixture.reference,
          amount: fixture.amount,
          invoiceId: fixture.invoiceId,
          channel: "multicaixa_express",
          externalId: `e2e-dev-${Date.now()}`,
        },
      );
      expect(confirm.ok()).toBeTruthy();
      const body = (await confirm.json()) as {
        ok?: boolean;
        planSettled?: boolean;
        receiptNumber?: string;
      };
      expect(body.ok).toBe(true);
      expect(body.planSettled).toBe(true);
      expect(body.receiptNumber).toBeTruthy();

      expect(await getFinanceInvoiceStatus(fixture.invoiceId)).toBe("paid");
      expect(await getPaymentPlanStatus(fixture.planId)).toBe("settled");
    } finally {
      await cleanupE2ETenantBySlug(slug, payload.admin_email).catch(() => undefined);
    }
  });

  test("webhookApiKey da escola liquida via POST /gateway/confirm", async ({ request }) => {
    const slug = uniqueE2ESlug("gw");
    const payload = buildSignupPayload(slug);

    try {
      const signup = await request.post(`${ECOSYSTEM_E2E_URLS.siga}/api/saas/signup`, {
        data: payload,
      });
      expect(signup.ok()).toBeTruthy();

      const schoolId = await findSchoolIdByTenantSlug(slug);
      expect(schoolId).toBeTruthy();

      const schoolWebhookKey = `e2e-mcx-${slug}`;
      await installE2EMulticaixaIntegration(schoolId!, {
        webhookApiKey: schoolWebhookKey,
        merchantId: "54321",
      });

      const fixture = await seedE2EGatewayFixture(schoolId!, { amount: 45_000 });

      const confirm = await signedGatewayPost(
        request,
        `${ECOSYSTEM_E2E_URLS.siga}/api/finance/gateway/confirm`,
        schoolWebhookKey,
        {
          reference: fixture.reference,
          amount: fixture.amount,
          invoiceId: fixture.invoiceId,
          channel: "multicaixa_express",
        },
      );
      expect(confirm.ok()).toBeTruthy();
      const body = (await confirm.json()) as { ok?: boolean; planSettled?: boolean };
      expect(body.ok).toBe(true);
      expect(body.planSettled).toBe(true);

      expect(await getFinanceInvoiceStatus(fixture.invoiceId)).toBe("paid");
    } finally {
      await cleanupE2ETenantBySlug(slug, payload.admin_email).catch(() => undefined);
    }
  });
});

test.describe("Gateway Unitel @live", () => {
  test.skip(!isLiveE2EEnabled(), "Defina SIGA_E2E_LIVE=1 com apps locais e Supabase configurado.");

  const unitelConfirmUrl = `${ECOSYSTEM_E2E_URLS.siga}/api/finance/gateway/unitel/confirm`;

  test("SIGA_GATEWAY_DEV_API_KEY liquida via POST /unitel/confirm", async ({ request }) => {
    const slug = uniqueE2ESlug("gw");
    const payload = buildSignupPayload(slug);
    const apiKey = getE2EGatewayDevApiKey();

    try {
      const signup = await request.post(`${ECOSYSTEM_E2E_URLS.siga}/api/saas/signup`, {
        data: payload,
      });
      expect(signup.ok()).toBeTruthy();

      const schoolId = await findSchoolIdByTenantSlug(slug);
      expect(schoolId).toBeTruthy();

      const fixture = await seedE2EGatewayFixture(schoolId!, {
        amount: 45_000,
        channel: "unitel_money",
      });

      const confirm = await signedGatewayPost(request, unitelConfirmUrl, apiKey, {
        reference: fixture.reference,
        amount: fixture.amount,
        invoiceId: fixture.invoiceId,
        externalId: `e2e-unitel-dev-${Date.now()}`,
      });
      expect(confirm.ok()).toBeTruthy();
      const body = (await confirm.json()) as {
        ok?: boolean;
        planSettled?: boolean;
        receiptNumber?: string;
      };
      expect(body.ok).toBe(true);
      expect(body.planSettled).toBe(true);
      expect(body.receiptNumber).toBeTruthy();

      expect(await getFinanceInvoiceStatus(fixture.invoiceId)).toBe("paid");
      expect(await getPaymentPlanStatus(fixture.planId)).toBe("settled");
    } finally {
      await cleanupE2ETenantBySlug(slug, payload.admin_email).catch(() => undefined);
    }
  });

  test("webhookApiKey Unitel da escola liquida via POST /unitel/confirm", async ({ request }) => {
    const slug = uniqueE2ESlug("gw");
    const payload = buildSignupPayload(slug);

    try {
      const signup = await request.post(`${ECOSYSTEM_E2E_URLS.siga}/api/saas/signup`, {
        data: payload,
      });
      expect(signup.ok()).toBeTruthy();

      const schoolId = await findSchoolIdByTenantSlug(slug);
      expect(schoolId).toBeTruthy();

      const unitelWebhookKey = `e2e-unt-${slug}`;
      await installE2EUnitelIntegration(schoolId!, {
        webhookApiKey: unitelWebhookKey,
        merchantCode: "UNITEL-E2E",
      });

      const fixture = await seedE2EGatewayFixture(schoolId!, {
        amount: 45_000,
        channel: "unitel_money",
      });

      const confirm = await signedGatewayPost(request, unitelConfirmUrl, unitelWebhookKey, {
        reference: fixture.reference,
        amount: fixture.amount,
        invoiceId: fixture.invoiceId,
      });
      expect(confirm.ok()).toBeTruthy();
      const body = (await confirm.json()) as { ok?: boolean; planSettled?: boolean };
      expect(body.ok).toBe(true);
      expect(body.planSettled).toBe(true);

      expect(await getFinanceInvoiceStatus(fixture.invoiceId)).toBe("paid");
    } finally {
      await cleanupE2ETenantBySlug(slug, payload.admin_email).catch(() => undefined);
    }
  });
});

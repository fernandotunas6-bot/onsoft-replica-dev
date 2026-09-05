import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";

import {
  decideEmisWebhookIngress,
  isEmisProductionAdapterEnabled,
  verifyEmisWebhookSignature,
} from "../lib/providers/emis-webhook.ts";

test("production EMIS adapter stays disabled even after homologation checks", () => {
  assert.equal(isEmisProductionAdapterEnabled(), false);

  const blocked = decideEmisWebhookIngress({
    homologated: false,
    signatureValid: true,
    productionAdapterEnabled: false,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "emis_not_homologated");

  const badSig = decideEmisWebhookIngress({
    homologated: true,
    signatureValid: false,
    productionAdapterEnabled: false,
  });
  assert.equal(badSig.ok, false);
  if (!badSig.ok) assert.equal(badSig.code, "emis_webhook_signature_invalid");

  const readyButClosed = decideEmisWebhookIngress({
    homologated: true,
    signatureValid: true,
    productionAdapterEnabled: false,
  });
  assert.equal(readyButClosed.ok, true);
  if (readyButClosed.ok) {
    assert.equal(readyButClosed.settle, false);
    assert.equal(readyButClosed.code, "emis_adapter_not_ready");
    assert.equal(readyButClosed.status, 501);
  }
});

test("HMAC signature verification is strict and does not settle", async () => {
  const secret = "emis-webhook-secret-16+";
  const rawBody = JSON.stringify({ event: "payment.authorized", reference: "PF-TEST" });
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");

  assert.equal(
    await verifyEmisWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${hex}`,
      secret,
    }),
    true,
  );
  assert.equal(
    await verifyEmisWebhookSignature({
      rawBody,
      signatureHeader: hex,
      secret,
    }),
    true,
  );
  assert.equal(
    await verifyEmisWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${hex.slice(0, -2)}aa`,
      secret,
    }),
    false,
  );
  assert.equal(
    await verifyEmisWebhookSignature({
      rawBody: `${rawBody} `,
      signatureHeader: `sha256=${hex}`,
      secret,
    }),
    false,
  );
});

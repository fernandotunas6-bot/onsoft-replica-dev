import { describe, it, expect } from "vitest";
import { verifyResendWebhookSignature } from "@/features/integrations/resend-webhook-signature";

const SECRET_BYTES = "super-secreto-de-teste-resend-01";
const SECRET = `whsec_${btoa(SECRET_BYTES)}`;

const PAYLOAD = JSON.stringify({
  type: "email.delivered",
  created_at: "2026-09-12T10:00:00Z",
  data: { email_id: "7f2a9c31-de00-4b1e-8f2a-1d6c7e8f9a0b", from: "a@b.ao", to: ["c@d.ao"] },
});

/** Assina como o Svix assina, para o teste não depender do código em teste. */
async function sign(payload: string, id: string, timestamp: string, secret = SECRET) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const binary = atob(raw);
  const keyBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) keyBytes[i] = binary.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${payload}`),
  );
  const bytes = new Uint8Array(signature);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return btoa(out);
}

const NOW = new Date("2026-09-12T10:00:30Z");
const TS = String(Math.floor(NOW.getTime() / 1000));
const ID = "msg_2abc";

describe("verifyResendWebhookSignature", () => {
  it("aceita uma assinatura legítima", async () => {
    const signature = await sign(PAYLOAD, ID, TS);
    const result = await verifyResendWebhookSignature({
      payload: PAYLOAD,
      svixId: ID,
      svixTimestamp: TS,
      svixSignature: `v1,${signature}`,
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejeita quando o corpo foi adulterado depois de assinado", async () => {
    const signature = await sign(PAYLOAD, ID, TS);
    const tampered = PAYLOAD.replace("email.delivered", "email.bounced");
    const result = await verifyResendWebhookSignature({
      payload: tampered,
      svixId: ID,
      svixTimestamp: TS,
      svixSignature: `v1,${signature}`,
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("rejeita uma assinatura feita com outro segredo", async () => {
    const signature = await sign(PAYLOAD, ID, TS, `whsec_${btoa("outro-segredo-completamente-x")}`);
    const result = await verifyResendWebhookSignature({
      payload: PAYLOAD,
      svixId: ID,
      svixTimestamp: TS,
      svixSignature: `v1,${signature}`,
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("rejeita quando faltam cabeçalhos", async () => {
    const result = await verifyResendWebhookSignature({
      payload: PAYLOAD,
      svixId: null,
      svixTimestamp: TS,
      svixSignature: "v1,qualquer",
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "missing_headers" });
  });

  it("rejeita um pedido reenviado fora da janela temporal", async () => {
    const oldTs = String(Math.floor(NOW.getTime() / 1000) - 3600);
    const signature = await sign(PAYLOAD, ID, oldTs);
    const result = await verifyResendWebhookSignature({
      payload: PAYLOAD,
      svixId: ID,
      svixTimestamp: oldTs,
      svixSignature: `v1,${signature}`,
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "timestamp_out_of_tolerance" });
  });

  it("aceita durante rotação de segredo, quando uma das assinaturas bate", async () => {
    const valid = await sign(PAYLOAD, ID, TS);
    const result = await verifyResendWebhookSignature({
      payload: PAYLOAD,
      svixId: ID,
      svixTimestamp: TS,
      svixSignature: `v1,assinatura-antiga-que-nao-bate v1,${valid}`,
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: true });
  });

  it("ignora esquemas de versão desconhecidos", async () => {
    const signature = await sign(PAYLOAD, ID, TS);
    const result = await verifyResendWebhookSignature({
      payload: PAYLOAD,
      svixId: ID,
      svixTimestamp: TS,
      svixSignature: `v2,${signature}`,
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "no_v1_signature" });
  });
});

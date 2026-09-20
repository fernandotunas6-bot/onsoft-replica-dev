import { describe, expect, it } from "vitest";
import { verifyTwilioWebhookSignature } from "@/features/otp/webhooks/twilio-webhook-handler";
import { verifyMetaWebhookSignature } from "@/features/otp/webhooks/whatsapp-webhook-handler";

/**
 * Não existia teste nenhum para estes dois verificadores, e foi por isso que um
 * `require("crypto")` sobreviveu dentro de um módulo ESM servido por um Worker.
 * Enquanto os endpoints não estavam registados, nunca corria; assim que
 * passaram a estar, tornou-se falha garantida.
 *
 * As assinaturas são calculadas aqui de forma independente, para o teste não
 * validar o código contra ele próprio.
 */

const TOKEN = "token-de-teste-twilio-0123456789";
const SECRET = "segredo-de-teste-meta-0123456789";

async function hmac(alg: "SHA-1" | "SHA-256", secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: alg },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
}

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

const b64 = (b: ArrayBuffer) => {
  const bytes = new Uint8Array(b);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

describe("verifyTwilioWebhookSignature", () => {
  const url = "https://app.siga.ao/api/webhooks/twilio-sms";
  const body = { MessageSid: "SM123", MessageStatus: "delivered", To: "+244912345678" };

  async function sign(params: Record<string, string>, u = url, token = TOKEN) {
    let data = u;
    for (const [k, v] of Object.entries(params).sort()) data += k + v;
    return b64(await hmac("SHA-1", token, data));
  }

  it("aceita uma assinatura legítima", async () => {
    expect(await verifyTwilioWebhookSignature(url, body, await sign(body), TOKEN)).toBe(true);
  });

  it("rejeita quando um parâmetro foi alterado depois de assinado", async () => {
    const signature = await sign(body);
    const tampered = { ...body, MessageStatus: "failed" };
    expect(await verifyTwilioWebhookSignature(url, tampered, signature, TOKEN)).toBe(false);
  });

  it("rejeita uma assinatura feita com outro token", async () => {
    const signature = await sign(body, url, "outro-token-completamente-diferente");
    expect(await verifyTwilioWebhookSignature(url, body, signature, TOKEN)).toBe(false);
  });

  it("rejeita quando o URL assinado não é o que recebemos", async () => {
    const signature = await sign(body, "https://outro.host/api/webhooks/twilio-sms");
    expect(await verifyTwilioWebhookSignature(url, body, signature, TOKEN)).toBe(false);
  });

  it("devolve false — e não atira — perante assinatura de comprimento errado", async () => {
    // `crypto.timingSafeEqual` do Node atirava aqui, transformando um ataque
    // numa resposta 500 em vez de 401.
    await expect(verifyTwilioWebhookSignature(url, body, "curta", TOKEN)).resolves.toBe(false);
    await expect(verifyTwilioWebhookSignature(url, body, "", TOKEN)).resolves.toBe(false);
  });

  it("a ordem dos parâmetros no objecto não altera o resultado", async () => {
    const signature = await sign(body);
    const reordered = {
      To: body.To,
      MessageStatus: body.MessageStatus,
      MessageSid: body.MessageSid,
    };
    expect(await verifyTwilioWebhookSignature(url, reordered, signature, TOKEN)).toBe(true);
  });
});

describe("verifyMetaWebhookSignature", () => {
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  const sign = async (b: string, secret = SECRET) =>
    `sha256=${hex(await hmac("SHA-256", secret, b))}`;

  it("aceita uma assinatura legítima", async () => {
    expect(await verifyMetaWebhookSignature(payload, await sign(payload), SECRET)).toBe(true);
  });

  it("rejeita quando o corpo foi alterado", async () => {
    const signature = await sign(payload);
    expect(await verifyMetaWebhookSignature(payload + " ", signature, SECRET)).toBe(false);
  });

  it("rejeita uma assinatura feita com outro segredo", async () => {
    const signature = await sign(payload, "outro-segredo-completamente-diferente");
    expect(await verifyMetaWebhookSignature(payload, signature, SECRET)).toBe(false);
  });

  it("rejeita algoritmos que não sejam sha256", async () => {
    const hash = hex(await hmac("SHA-256", SECRET, payload));
    expect(await verifyMetaWebhookSignature(payload, `sha1=${hash}`, SECRET)).toBe(false);
    expect(await verifyMetaWebhookSignature(payload, hash, SECRET)).toBe(false);
  });

  it("devolve false perante cabeçalho vazio ou sem hash", async () => {
    expect(await verifyMetaWebhookSignature(payload, "", SECRET)).toBe(false);
    expect(await verifyMetaWebhookSignature(payload, "sha256=", SECRET)).toBe(false);
  });
});

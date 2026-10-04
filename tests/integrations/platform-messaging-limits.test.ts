import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/integrations/server.ts", "utf8");
const handler = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("mensagens pagas pela plataforma", () => {
  it("SMS: só números da escola, sem quem desligou, com limite partilhado", () => {
    const sms = handler("sendSchoolSmsMessage");
    expect(sms).toContain("onlySchoolPhones(db, membership.schoolId, recipients)");
    expect(sms).toContain("withoutOptedOutPhones(db, membership.schoolId, recipients)");
    expect(sms).toContain("platformQuotaOk(`platform_sms:");
    expect(sms.indexOf("platformQuotaOk(")).toBeLessThan(sms.indexOf("sendTwilioSms("));
  });

  it("WhatsApp com token da plataforma: só números da escola", () => {
    const wa = handler("sendSchoolWhatsAppMessage");
    expect(wa).toContain("if (usingPlatformToken) {\n      recipients = await onlySchoolPhones(");
  });

  it("os limites usam o contador partilhado entre instâncias", () => {
    expect(source).toContain("return consumeRateLimit([key], PLATFORM_EMAIL_RATE_LIMIT);");
    expect(source).not.toContain("checkRateLimit(");
  });
});

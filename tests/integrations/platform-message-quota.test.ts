import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/integrations/server.ts", "utf8");

describe("mensagens pagas pela plataforma", () => {
  it("contam por destinatário, nos três canais", () => {
    for (const key of ["platform_email_msgs", "platform_whatsapp_msgs", "platform_sms_msgs"]) {
      expect(source, key).toMatch(new RegExp(`platformMessagesOk\\(\\s*\`${key}:`));
    }
  });

  it("quem desligou os comunicados: uma falha de leitura não envia", () => {
    const optOut = source.slice(source.indexOf("async function withoutOptedOutRecipients"));
    expect(optOut.slice(0, 900)).toContain("if (optedOutError) throw");
    const phones = source.slice(source.indexOf("async function withoutOptedOutPhones"));
    expect(phones.slice(0, 900)).toContain("if (optedOutError) throw");
  });

  it("ler a configuração de uma integração não engole erros", () => {
    const read = source.slice(source.indexOf("async function readIntegrationConfig"));
    expect(read.slice(0, 900)).not.toContain("catch {");
    expect(read.slice(0, 900)).toContain("if (error && !isMissingTable(error))");
  });
});

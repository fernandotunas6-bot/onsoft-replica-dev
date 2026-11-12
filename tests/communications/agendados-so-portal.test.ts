import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SCHEDULED_CHANNEL_MESSAGE,
  createAnnouncementInputSchema,
} from "@/features/communications/schemas";

/** Auditoria 13, F-36: um agendado por SMS/e-mail/WhatsApp ficava «Enviado» sem sair. */
describe("comunicados agendados", () => {
  const base = { title: "Reunião", body: "Reunião de pais", audience: "all_guardians" as const };

  it("agendar no portal continua possível", () => {
    const parsed = createAnnouncementInputSchema.safeParse({
      ...base,
      channel: "portal",
      status: "scheduled",
      scheduledFor: "2026-11-02",
    });
    expect(parsed.success).toBe(true);
  });

  it.each(["sms", "email", "whatsapp"])("agendar por %s é recusado com a explicação", (channel) => {
    const parsed = createAnnouncementInputSchema.safeParse({
      ...base,
      channel,
      status: "scheduled",
      scheduledFor: "2026-11-02",
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain(SCHEDULED_CHANNEL_MESSAGE);
  });

  it("envio imediato por SMS continua possível", () => {
    expect(
      createAnnouncementInputSchema.safeParse({ ...base, channel: "sms", status: "sent" }).success,
    ).toBe(true);
  });

  it("a publicação automática só toca nos agendados do portal", () => {
    const server = readFileSync("src/features/communications/server.ts", "utf8");
    expect(server).toMatch(/\.eq\("status", "scheduled"\)[\s\S]{0,300}\.eq\("channel", "portal"\)/);
  });
});

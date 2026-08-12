import { describe, expect, it } from "vitest";
import {
  actionForCapability,
  capabilityActionKind,
  meetingRoomLink,
  officialUrlForCapability,
  paymentReference,
  providerIdFromCapability,
  whatsappHref,
} from "@/features/integrations/actions";

describe("integration actions", () => {
  it("maps every declared capability to a known action kind", () => {
    for (const id of Object.keys(capabilityActionKind)) {
      expect(actionForCapability({ id })).toBe(capabilityActionKind[id]);
    }
  });

  it("falls back to open-official for unknown capabilities", () => {
    expect(actionForCapability({ id: "unknown.feature" })).toBe("open-official");
  });

  it("resolves provider ids from capability prefixes", () => {
    expect(providerIdFromCapability("whatsapp.notices")).toBe("whatsapp_business");
    expect(providerIdFromCapability("m365.outlook")).toBe("microsoft_365_education");
    expect(providerIdFromCapability("agt.einvoice")).toBe("agt");
  });

  it("builds whatsapp links with optional prefilled text", () => {
    expect(whatsappHref("")).toBe("https://wa.me/");
    expect(whatsappHref("+244 923 000 111", "Olá")).toBe(
      "https://wa.me/244923000111?text=Ol%C3%A1",
    );
  });

  it("generates payment references and meeting links", () => {
    expect(paymentReference("EMIS")).toMatch(/^EMIS\d{9}$/);
    expect(meetingRoomLink("zoom")).toMatch(/^https:\/\/zoom\.us\/j\/\d+$/);
    expect(meetingRoomLink("teams")).toContain("teams.microsoft.com");
  });

  it("returns official install URLs for catalog providers", () => {
    expect(officialUrlForCapability("sige.export_students")).toContain("med.gov.ao");
    expect(officialUrlForCapability("resend.send")).toContain("resend.com");
  });
});

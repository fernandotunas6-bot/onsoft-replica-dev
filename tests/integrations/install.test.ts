import { describe, expect, it } from "vitest";
import { academicIntegrationCatalog } from "@/features/integrations/catalog";
import {
  capabilityActionKind,
  meetingRoomLink,
  paymentReference,
  whatsappHref,
} from "@/features/integrations/actions";
import {
  allInstallPackages,
  capabilitiesForModule,
  capabilityIdsFor,
  installPackageFor,
  parseGrantedCapabilities,
  publicInstalledProviderIds,
  publicSchoolEmail,
  publicSchoolPhone,
} from "@/features/integrations/install";

describe("integration install packages", () => {
  it("gives every catalog app its own official install kit and capabilities", () => {
    const packs = allInstallPackages();
    expect(packs.map((pack) => pack.provider)).toEqual(
      academicIntegrationCatalog.map((item) => item.id),
    );
    for (const pack of packs) {
      expect(pack.installUrl.startsWith("https://")).toBe(true);
      expect(pack.capabilities.length).toBeGreaterThan(0);
      expect(new Set(pack.capabilities.map((item) => item.id)).size).toBe(pack.capabilities.length);
    }
  });

  it("lets AGT add electronic invoicing to faturas after consent", () => {
    const agt = installPackageFor("agt");
    expect(agt?.capabilities.map((item) => item.module)).toContain("faturas");
    expect(agt?.installUrl).toContain("minfin.gov.ao");
    const granted = new Set(capabilityIdsFor("agt"));
    expect(capabilitiesForModule("faturas", granted).map((item) => item.id)).toEqual(
      expect.arrayContaining(["agt.nif", "agt.einvoice"]),
    );
    expect(capabilitiesForModule("pedagogica", granted)).toEqual([]);
  });

  it("maps every installed capability to an in-app action", () => {
    const ids = allInstallPackages().flatMap((pack) => pack.capabilities.map((item) => item.id));
    expect(ids.every((id) => Boolean(capabilityActionKind[id]))).toBe(true);
  });

  it("builds catalog-ready payment refs and meeting links", () => {
    expect(paymentReference("EMIS")).toMatch(/^EMIS\d{9}$/);
    expect(paymentReference("UML")).toMatch(/^UML\d{9}$/);
    expect(meetingRoomLink("zoom")).toContain("zoom.us/j/");
    expect(meetingRoomLink("teams")).toContain("teams.microsoft.com");
    expect(whatsappHref("923 000 111", "Olá")).toBe("https://wa.me/923000111?text=Ol%C3%A1");
  });

  it("parses granted capabilities from stored config", () => {
    expect(parseGrantedCapabilities({ grantedCapabilities: ["zoom.rooms", 1, ""] })).toEqual([
      "zoom.rooms",
    ]);
    expect(parseGrantedCapabilities({})).toEqual([]);
  });

  it("covers every host module with installable capabilities", () => {
    const modules = [
      "pedagogica",
      "financeiro",
      "faturas",
      "calendario",
      "comunicacoes",
      "alunos",
      "documentos",
      "arquivos",
    ] as const;
    const allCaps = allInstallPackages().flatMap((pack) => pack.capabilities);
    for (const module of modules) {
      expect(allCaps.some((cap) => cap.module === module)).toBe(true);
    }
  });

  it("exposes only active catalog providers on public pages", () => {
    expect(
      publicInstalledProviderIds([
        { provider: "whatsapp_business", status: "configured" },
        { provider: "agt", status: "disconnected" },
        { provider: "secret-gateway", status: "connected" },
        { provider: "resend_email", status: "connected" },
      ]),
    ).toEqual(["whatsapp_business", "resend_email"]);
  });

  it("gates public school contacts by installed provider", () => {
    const providers = ["whatsapp_business", "resend_email"];
    expect(publicSchoolPhone("923 000 111", providers)).toBe("923 000 111");
    expect(publicSchoolEmail(" secretaria@escola.ao ", providers)).toBe("secretaria@escola.ao");
    expect(publicSchoolPhone("923", ["resend_email"])).toBeNull();
    expect(publicSchoolEmail("a@b.ao", ["whatsapp_business"])).toBeNull();
    expect(publicSchoolEmail("", providers)).toBeNull();
  });
});

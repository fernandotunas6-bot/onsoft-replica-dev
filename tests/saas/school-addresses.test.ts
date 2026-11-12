import { describe, expect, it } from "vitest";
import { schoolAddressUrls } from "../../painel/web/src/lib/school-addresses";
import { schoolSiteRequest } from "@/features/school-website/school-sites";

describe("WEB — endereços da escola criada", () => {
  it("website na raiz do subdomínio e portal SIGA Plus em /portal", () => {
    expect(schoolAddressUrls("liceu.portal-siga.com", "liceu")).toEqual({
      websiteUrl: "https://liceu.portal-siga.com/",
      portalUrl: "https://liceu.portal-siga.com/portal?escola=liceu",
    });
  });

  it("recusa hostnames inválidos em vez de montar links", () => {
    expect(schoolAddressUrls("evil.com/x", "x")).toBeNull();
    expect(schoolAddressUrls("localhost", "x")).toBeNull();
    expect(schoolAddressUrls("", "x")).toBeNull();
  });

  it("o Worker serve o website no link mostrado e deixa /portal ao SIGA", () => {
    const urls = schoolAddressUrls("liceu.portal-siga.com", "liceu")!;
    expect(schoolSiteRequest(new URL(urls.websiteUrl))).toMatchObject({
      mode: "hostname",
      page: "/",
    });
    expect(schoolSiteRequest(new URL(urls.portalUrl))).toBeNull();
  });
});

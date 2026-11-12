import { afterEach, describe, expect, it, vi } from "vitest";

/** ADMIN → SIGA de cada escola: `<slug>.PLATFORM_DOMAIN`, como o resolver do SIGA. */
async function loadAdminUrls(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("../../painel/admin/src/lib/ecosystem-urls");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ADMIN getSigaSchoolUrl", () => {
  it("em produção aponta para o subdomínio da escola na plataforma", async () => {
    const { getSigaSchoolUrl } = await loadAdminUrls({
      NODE_ENV: "production",
      NEXT_PUBLIC_SIGA_URL: "",
      NEXT_PUBLIC_PLATFORM_DOMAIN: "",
    });
    // O SIGA vive na raiz: tirar-lhe um rótulo dava "colegio-esperanca.com".
    expect(getSigaSchoolUrl("colegio-esperanca")).toBe("https://colegio-esperanca.portal-siga.com");
  });

  it("segue PLATFORM_DOMAIN mesmo com NEXT_PUBLIC_SIGA_URL definido", async () => {
    const { getSigaSchoolUrl } = await loadAdminUrls({
      NODE_ENV: "production",
      NEXT_PUBLIC_SIGA_URL: "https://portal-siga.com",
      NEXT_PUBLIC_PLATFORM_DOMAIN: "escolas.ao",
    });
    expect(getSigaSchoolUrl("liceu")).toBe("https://liceu.escolas.ao");
  });

  it("slug vazio ou inválido abre o SIGA principal", async () => {
    const { getSigaSchoolUrl, ECOSYSTEM_URLS } = await loadAdminUrls({ NODE_ENV: "production" });
    expect(getSigaSchoolUrl()).toBe(ECOSYSTEM_URLS.siga);
    expect(getSigaSchoolUrl("evil.com/x")).toBe(ECOSYSTEM_URLS.siga);
  });

  it("em desenvolvimento fica no SIGA local", async () => {
    const { getSigaSchoolUrl } = await loadAdminUrls({ NODE_ENV: "development" });
    expect(getSigaSchoolUrl("colegio-esperanca")).toBe("http://localhost:3006");
  });
});

describe("ADMIN website e portal da escola", () => {
  it("em produção: website na raiz do subdomínio e portal em /portal", async () => {
    const { getSchoolWebsiteUrl, getSchoolPortalUrl } = await loadAdminUrls({
      NODE_ENV: "production",
      NEXT_PUBLIC_SIGA_URL: "",
      NEXT_PUBLIC_PLATFORM_DOMAIN: "",
    });
    expect(getSchoolWebsiteUrl("colegio-esperanca")).toBe(
      "https://colegio-esperanca.portal-siga.com/",
    );
    expect(getSchoolPortalUrl("colegio-esperanca")).toBe(
      "https://colegio-esperanca.portal-siga.com/portal?escola=colegio-esperanca",
    );
  });

  it("slug inválido não gera website e o portal fica no SIGA principal", async () => {
    const { getSchoolWebsiteUrl, getSchoolPortalUrl, ECOSYSTEM_URLS } = await loadAdminUrls({
      NODE_ENV: "production",
    });
    expect(getSchoolWebsiteUrl("evil.com/x")).toBeNull();
    expect(getSchoolWebsiteUrl()).toBeNull();
    expect(getSchoolPortalUrl("evil.com/x")).toBe(`${ECOSYSTEM_URLS.siga}/portal`);
  });

  it("em desenvolvimento usa o caminho partilhado do SIGA local", async () => {
    const { getSchoolWebsiteUrl, getSchoolPortalUrl } = await loadAdminUrls({
      NODE_ENV: "development",
    });
    expect(getSchoolWebsiteUrl("liceu")).toBe("http://localhost:3006/escolas/liceu/");
    expect(getSchoolPortalUrl("liceu")).toBe("http://localhost:3006/portal?escola=liceu");
  });
});

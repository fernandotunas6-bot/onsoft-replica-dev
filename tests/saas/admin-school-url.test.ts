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

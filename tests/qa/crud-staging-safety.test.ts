import { describe, expect, it } from "vitest";
import { resolveCrudStagingConfig } from "../e2e/helpers/crud-staging-safety";

const makeEnv = (patch: Record<string, string> = {}) => ({
  SIGA_CRUD_E2E: "1",
  VITE_SIGA_URL: "http://127.0.0.1:3006",
  SIGA_CRUD_E2E_PROJECT_REF: "stagingexample123456",
  SUPABASE_URL: "https://stagingexample123456.supabase.co",
  SIGA_CRUD_E2E_TENANT_A_STATE: "/tmp/tenant-a.json",
  SIGA_CRUD_E2E_TENANT_B_STATE: "/tmp/tenant-b.json",
  SIGA_CRUD_E2E_TENANT_A_MARKER: "E2E Pessoa A 9876",
  SIGA_CRUD_E2E_TENANT_B_MARKER: "E2E Pessoa B 9876",
  ...patch,
});

describe("homologação CRUD: segurança do alvo E2E com duas escolas", () => {
  it("desactivado por omissão, não toca em sessões ou servidores", () => {
    expect(resolveCrudStagingConfig({})).toBeNull();
    expect(resolveCrudStagingConfig(makeEnv({ SIGA_CRUD_E2E: "0" }))).toBeNull();
  });

  it("aceita somente frontend local e projecto de staging explicitamente conferido", () => {
    expect(resolveCrudStagingConfig(makeEnv())).toEqual({
      baseUrl: "http://127.0.0.1:3006",
      stateA: "/tmp/tenant-a.json",
      stateB: "/tmp/tenant-b.json",
      markerA: "E2E Pessoa A 9876",
      markerB: "E2E Pessoa B 9876",
    });
  });

  it("recusa URL de produção mesmo quando o nome do projecto tenta mascará-la", () => {
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({
          SIGA_CRUD_E2E_PROJECT_REF: "xodgfmxiaunpamctfeea",
          SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co",
        }),
      ),
    ).toThrow(/produção/);
  });

  it("recusa URL de projecto divergente e frontend não local", () => {
    expect(() =>
      resolveCrudStagingConfig(makeEnv({ SUPABASE_URL: "https://outro123.supabase.co" })),
    ).toThrow(/não corresponde/);
    expect(() =>
      resolveCrudStagingConfig(makeEnv({ VITE_SIGA_URL: "https://portal-siga.com" })),
    ).toThrow(/servidor local/);
    expect(() =>
      resolveCrudStagingConfig(makeEnv({ VITE_SIGA_URL: "http://user:pass@127.0.0.1:3006" })),
    ).toThrow(/servidor local/);
  });

  it("falha quando o frontend aponta para outro projecto Supabase", () => {
    expect(() =>
      resolveCrudStagingConfig(makeEnv({
        VITE_SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co",
      })),
    ).toThrow(/Supabase diferente/);
  });

  it("recusa sessões iguais, marcadores sobrepostos e parâmetros em falta", () => {
    expect(() =>
      resolveCrudStagingConfig(makeEnv({ SIGA_CRUD_E2E_TENANT_B_STATE: "/tmp/tenant-a.json" })),
    ).toThrow(/distintos/);
    expect(() =>
      resolveCrudStagingConfig(makeEnv({
        SIGA_CRUD_E2E_TENANT_B_MARKER: "Pessoa A 9876",
      })),
    ).toThrow(/não se sobreponham/);
    expect(() =>
      resolveCrudStagingConfig(makeEnv({ SIGA_CRUD_E2E_TENANT_B_MARKER: "" })),
    ).toThrow(/configure/);
  });
});

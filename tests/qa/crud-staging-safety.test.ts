import { describe, expect, it } from "vitest";
import {
  isUnexpectedCrudSupabaseOrigin,
  resolveCrudStagingConfig,
} from "../e2e/helpers/crud-staging-safety";

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

describe("bloqueio de chamadas Supabase durante o ensaio E2E", () => {
  const staging = "https://stagingexample123456.supabase.co";

  it("permite chamadas do projecto de staging e recursos externos neutros", () => {
    expect(isUnexpectedCrudSupabaseOrigin(`${staging}/rest/v1/people`, staging)).toBe(false);
    expect(isUnexpectedCrudSupabaseOrigin("https://fonts.googleapis.com/css2", staging)).toBe(
      false,
    );
  });

  it("bloqueia o projecto de produção e qualquer outro Supabase", () => {
    expect(
      isUnexpectedCrudSupabaseOrigin(
        "https://xodgfmxiaunpamctfeea.supabase.co/auth/v1/user",
        staging,
      ),
    ).toBe(true);
    expect(isUnexpectedCrudSupabaseOrigin("https://outroprojeto.supabase.co/rest/v1", staging)).toBe(
      true,
    );
  });
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
      supabaseOrigin: "https://stagingexample123456.supabase.co",
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
      resolveCrudStagingConfig(
        makeEnv({
          VITE_SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co",
        }),
      ),
    ).toThrow(/Supabase diferente/);
  });

  it("recusa sessões relativas, ficheiros sob o repositório e caminhos equivalentes", () => {
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({ SIGA_CRUD_E2E_TENANT_A_STATE: "tests/.auth/escola-a.json" }),
      ),
    ).toThrow(/fora do repositório/);
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({ SIGA_CRUD_E2E_TENANT_A_STATE: `${process.cwd()}/.auth/escola-a.json` }),
      ),
    ).toThrow(/fora do repositório/);
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({
          SIGA_CRUD_E2E_TENANT_A_STATE: "/tmp/teste/../tenant-b.json",
          SIGA_CRUD_E2E_TENANT_B_STATE: "/tmp/tenant-b.json",
        }),
      ),
    ).toThrow(/mesma sessão/);
  });

  it("não aceita extensões de armazenamento de credenciais diferentes de JSON", () => {
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({ SIGA_CRUD_E2E_TENANT_A_STATE: "/tmp/escola-a.txt" }),
      ),
    ).toThrow(/ficheiros JSON/);
  });

  it("recusa marcadores indistintos por caixa ou acentos, como a pesquisa real", () => {
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({
          SIGA_CRUD_E2E_TENANT_A_MARKER: "Pessoa Única",
          SIGA_CRUD_E2E_TENANT_B_MARKER: "pessoa unica",
        }),
      ),
    ).toThrow(/distintos/);
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({
          SIGA_CRUD_E2E_TENANT_A_MARKER: "PESSOA FICTÍCIA",
          SIGA_CRUD_E2E_TENANT_B_MARKER: "pessoa ficticia 2026",
        }),
      ),
    ).toThrow(/não se sobreponham/);
  });

  it("recusa sessões iguais, marcadores sobrepostos e parâmetros em falta", () => {
    expect(() =>
      resolveCrudStagingConfig(makeEnv({ SIGA_CRUD_E2E_TENANT_B_STATE: "/tmp/tenant-a.json" })),
    ).toThrow(/mesma sessão/);
    expect(() =>
      resolveCrudStagingConfig(
        makeEnv({
          SIGA_CRUD_E2E_TENANT_B_MARKER: "Pessoa A 9876",
        }),
      ),
    ).toThrow(/não se sobreponham/);
    expect(() => resolveCrudStagingConfig(makeEnv({ SIGA_CRUD_E2E_TENANT_B_MARKER: "" }))).toThrow(
      /configure/,
    );
  });
});

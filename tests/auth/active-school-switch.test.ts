// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Troca de escola (professor ou funcionário em várias escolas): os dados em cache são
 * da escola anterior e as chaves não levam a escola, por isso a troca tem de os
 * descartar. Até 2026-10-05 só o contexto da conta era invalidado.
 */

vi.mock("@/components/auth/AuthGate", () => ({
  useAuthSession: () => ({ user: { id: "user-1", email: "prof@escola.ao", user_metadata: {} } }),
}));

const accountContext = vi.fn();
vi.mock("@/features/auth/server", () => ({
  getCurrentAccountContext: (input: { data: { preferredSchoolId?: string } }) =>
    accountContext(input),
}));

// Subdomínio do endereço (null = app./local) e a navegação para outro subdomínio.
let host: string | null = null;
const navigate = vi.fn();
vi.mock("@/features/auth/active-school", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/auth/active-school")>();
  return {
    ...real,
    hostSchoolSlug: () => host,
    navigateToSchoolHost: (slug: string) => navigate(slug),
  };
});

const { useCurrentAccount } = await import("@/features/auth/use-current-account");
const { ACTIVE_SCHOOL_CHANGED_EVENT, hostSchoolSlug, schoolHostUrl } = await vi.importActual<
  typeof import("@/features/auth/active-school")
>("@/features/auth/active-school");

const schools = [
  {
    schoolId: "escola-a",
    schoolName: "Escola A",
    schoolSlug: "escola-a",
    status: "active",
    isActive: true,
  },
  {
    schoolId: "escola-b",
    schoolName: "Escola B",
    schoolSlug: "escola-b",
    status: "active",
    isActive: true,
  },
];

describe("troca de escola", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    host = null;
    navigate.mockReset();
    localStorage.clear();
    document.cookie = "siga-active-school=; path=/; max-age=0";
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    accountContext.mockImplementation(async ({ data }) => ({
      school_id: data.preferredSchoolId ?? "escola-a",
      school_name: data.preferredSchoolId === "escola-b" ? "Escola B" : "Escola A",
      schools,
      roles: ["Professor"],
      cargo: "Professor",
    }));
  });

  it("descarta os dados da escola anterior e mantém a sessão", async () => {
    const { result } = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(result.current.activeSchool?.schoolId).toBe("escola-a"));

    queryClient.setQueryData(["pedagogical-workspace"], { turmas: ["10ª A da Escola A"] });
    queryClient.setQueryData(["finance", "invoices"], [{ id: "fatura-da-escola-a" }]);
    queryClient.setQueryData(["auth", "outra-coisa-da-sessao"], { ok: true });

    const changed = vi.fn();
    window.addEventListener(ACTIVE_SCHOOL_CHANGED_EVENT, changed);
    act(() => result.current.setActiveSchoolId("escola-b"));

    expect(queryClient.getQueryData(["pedagogical-workspace"])).toBeUndefined();
    expect(queryClient.getQueryData(["finance", "invoices"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth", "outra-coisa-da-sessao"])).toEqual({ ok: true });
    // O tenant (marca e plano) é avisado, e o servidor passa a ler a escola nova (cookie).
    expect(changed).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain("siga-active-school=escola-b");
    await waitFor(() => expect(result.current.activeSchool?.schoolId).toBe("escola-b"));
  });

  it("escolher a escola que já está activa não deita a cache fora", async () => {
    const { result } = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(result.current.activeSchool?.schoolId).toBe("escola-a"));
    queryClient.setQueryData(["pedagogical-workspace"], { turmas: ["10ª A"] });

    act(() => result.current.setActiveSchoolId("escola-a"));

    expect(queryClient.getQueryData(["pedagogical-workspace"])).toEqual({ turmas: ["10ª A"] });
    expect(document.cookie).toContain("siga-active-school=escola-a");
  });

  it("no subdomínio de uma escola, essa escola fica activa", async () => {
    host = "escola-b";
    const { result } = renderHook(() => useCurrentAccount(), { wrapper });
    // O cookie deste endereço não tinha escolha: o servidor resolveu a escola A.
    await waitFor(() => expect(result.current.activeSchool?.schoolId).toBe("escola-b"));
    expect(document.cookie).toContain("siga-active-school=escola-b");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("no subdomínio de A, escolher B vai para o endereço de B sem mexer nos dados de A", async () => {
    host = "escola-a";
    const { result } = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(result.current.activeSchool?.schoolId).toBe("escola-a"));
    queryClient.setQueryData(["pedagogical-workspace"], { turmas: ["10ª A"] });

    act(() => result.current.setActiveSchoolId("escola-b"));

    expect(navigate).toHaveBeenCalledWith("escola-b");
    expect(queryClient.getQueryData(["pedagogical-workspace"])).toEqual({ turmas: ["10ª A"] });
    expect(document.cookie).not.toContain("siga-active-school=escola-b");
  });
});

describe("endereço da escola", () => {
  it("só os subdomínios de escola têm escola própria", () => {
    expect(hostSchoolSlug("colegio-huambo.portal-siga.com")).toBe("colegio-huambo");
    expect(hostSchoolSlug("app.portal-siga.com")).toBeNull();
    expect(hostSchoolSlug("portal-siga.com")).toBeNull();
    expect(hostSchoolSlug("localhost")).toBeNull();
  });

  it("o mesmo ecrã no subdomínio da outra escola", () => {
    expect(
      schoolHostUrl("escola-b", {
        protocol: "https:",
        hostname: "escola-a.portal-siga.com",
        port: "",
        pathname: "/faturas",
        search: "?estado=open",
      }),
    ).toBe("https://escola-b.portal-siga.com/faturas?estado=open");
  });
});

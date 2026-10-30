// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    accountContext.mockReset();
    accountContext.mockImplementation(async ({ data }) => ({
      school_id: data.preferredSchoolId ?? "escola-a",
      school_name: data.preferredSchoolId === "escola-b" ? "Escola B" : "Escola A",
      schools,
      roles: ["Professor"],
      cargo: "Professor",
    }));
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
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

  it("sincroniza os consumidores já montados e os montados depois da troca", async () => {
    const first = renderHook(() => useCurrentAccount(), { wrapper });
    const second = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(second.result.current.schoolId).toBe("escola-a"));

    act(() => first.result.current.setActiveSchoolId("escola-b"));

    await waitFor(() => expect(second.result.current.schoolId).toBe("escola-b"));
    const third = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(third.result.current.schoolId).toBe("escola-b"));
    expect(document.cookie).toContain("siga-active-school=escola-b");
  });

  it("não usa o contexto anterior como placeholder enquanto a nova escola carrega", async () => {
    queryClient.setDefaultOptions({ queries: { retry: false, placeholderData: keepPreviousData } });
    const { result } = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(result.current.schoolId).toBe("escola-a"));
    let resolve!: (value: unknown) => void;
    accountContext.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );

    act(() => result.current.setActiveSchoolId("escola-b"));

    expect(result.current.schoolId).toBeNull();
    expect(result.current.role).toBe("Utilizador");
    await act(async () => resolve({ school_id: "escola-b", schools, cargo: "Professor" }));
    await waitFor(() => expect(result.current.schoolId).toBe("escola-b"));
  });

  it("a troca noutra aba actualiza contexto e descarta os dados uma só vez", async () => {
    const first = renderHook(() => useCurrentAccount(), { wrapper });
    const second = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(first.result.current.schoolId).toBe("escola-a"));
    queryClient.setQueryData(["finance", "invoices"], [{ id: "privado-a" }]);
    const reset = vi.spyOn(queryClient, "resetQueries");

    act(() => {
      localStorage.setItem("siga:active-school-id", "escola-b");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "siga:active-school-id",
          newValue: "escola-b",
          storageArea: localStorage,
        }),
      );
    });

    await waitFor(() => expect(second.result.current.schoolId).toBe("escola-b"));
    expect(first.result.current.schoolId).toBe("escola-b");
    expect(queryClient.getQueryData(["finance", "invoices"])).toBeUndefined();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain("siga-active-school=escola-b");
  });

  it("a hidratação preserva a escola guardada no browser", async () => {
    localStorage.setItem("siga:active-school-id", "escola-b");
    function Probe() {
      return React.createElement("span", null, useCurrentAccount().schoolId ?? "loading");
    }
    const view = React.createElement(wrapper, null, React.createElement(Probe));
    const container = document.createElement("div");
    container.innerHTML = renderToString(view);
    document.body.appendChild(container);
    const root = hydrateRoot(container, view);
    try {
      await waitFor(() => expect(container.textContent).toBe("escola-b"));
      expect(localStorage.getItem("siga:active-school-id")).toBe("escola-b");
      expect(document.cookie).toContain("siga-active-school=escola-b");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("uma resposta recusada da escola anterior não limpa a nova selecção", async () => {
    const { result } = renderHook(() => useCurrentAccount(), { wrapper });
    await waitFor(() => expect(result.current.schoolId).toBe("escola-a"));
    act(() => result.current.setActiveSchoolId("escola-a"));
    await waitFor(() => expect(result.current.profile.isFetching).toBe(false));
    let reject!: (reason: Error) => void;
    accountContext.mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail;
        }),
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.profile.refetch();
    });
    await waitFor(() => expect(reject).toBeTypeOf("function"));
    act(() => result.current.setActiveSchoolId("escola-b"));
    await waitFor(() => expect(result.current.schoolId).toBe("escola-b"));

    await act(async () => {
      reject(new Error("ACTIVE_SCHOOL_UNAVAILABLE"));
      await pending;
    });

    expect(document.cookie).toContain("siga-active-school=escola-b");
    expect(result.current.schoolId).toBe("escola-b");
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

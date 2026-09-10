// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type {
  listSystemAccounts,
  listSchoolInvitations,
  listSchoolRoles,
} from "@/features/access/server";
import type { listStaffModuleGrants } from "@/features/access/grants";
import type { listStaffDirectory } from "@/features/people/server";

/**
 * Smoke de render de `/acessos` — a rota mais pesada do módulo de segurança
 * (5 queries, matriz de permissões, tabela de contas, convites e equipa).
 *
 * Os tipos abaixo são importados do módulo REAL (`import type` é apagado na
 * compilação, por isso não colide com o `vi.mock`): se a forma devolvida por
 * uma destas server functions mudar, `tsc --noEmit` parte este ficheiro em vez
 * de o deixar a asseverar contra dados que já não existem.
 */
type SystemAccount = Awaited<ReturnType<typeof listSystemAccounts>>[number];
type StaffMember = Awaited<ReturnType<typeof listStaffDirectory>>[number];
type ModuleGrant = Awaited<ReturnType<typeof listStaffModuleGrants>>[number];
type Invitation = Awaited<ReturnType<typeof listSchoolInvitations>>[number];
type SchoolRole = Awaited<ReturnType<typeof listSchoolRoles>>[number];

// Montar uma rota real em jsdom leva ~1s isolado, mas passa facilmente dos 5s
// por omissão quando a suite inteira corre em paralelo (o handoff já regista
// falhas por carga da máquina no Ciclo 71). Timeout explícito para estes
// testes: fica a medir o render, não a fila de CPU.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

const listSystemAccountsMock = vi.fn();
const listStaffDirectoryMock = vi.fn();
const listStaffModuleGrantsMock = vi.fn();
const listSchoolInvitationsMock = vi.fn();
const listSchoolRolesMock = vi.fn();

vi.mock("@/features/access/server", () => ({
  listSystemAccounts: () => listSystemAccountsMock(),
  listSchoolInvitations: () => listSchoolInvitationsMock(),
  listSchoolRoles: () => listSchoolRolesMock(),
  createSchoolInvitation: vi.fn(),
  inviteSystemUser: vi.fn(),
  resendSystemInvite: vi.fn(),
  resetStaffPasswordDirect: vi.fn(),
  revokeSchoolInvitation: vi.fn(),
  sendSystemInviteEmail: vi.fn(),
  setSystemAccountDisabled: vi.fn(),
  updateSystemAccountCargo: vi.fn(),
}));

vi.mock("@/features/access/grants", () => ({
  listStaffModuleGrants: () => listStaffModuleGrantsMock(),
  setStaffModuleGrant: vi.fn(),
  clearStaffModuleGrant: vi.fn(),
}));

vi.mock("@/features/people/server", () => ({
  listStaffDirectory: () => listStaffDirectoryMock(),
  createPerson: vi.fn(),
  updatePersonStatus: vi.fn(),
}));

function seed({
  accounts = [] as SystemAccount[],
  staff = [] as StaffMember[],
  grants = [] as ModuleGrant[],
  invitations = [] as Invitation[],
  roles = [] as SchoolRole[],
} = {}) {
  listSystemAccountsMock.mockResolvedValue(accounts);
  listStaffDirectoryMock.mockResolvedValue(staff);
  listStaffModuleGrantsMock.mockResolvedValue(grants);
  listSchoolInvitationsMock.mockResolvedValue(invitations);
  listSchoolRolesMock.mockResolvedValue(roles);
}

// O `import` da rota arrasta um grafo de módulos grande e passa dos 5s de
// timeout por omissão do Vitest à primeira vez. Fica no `beforeAll`, com
// timeout próprio, para os testes em si medirem só o render.
let Acessos: ComponentType;

beforeAll(async () => {
  Acessos = routeComponentOf(await import("@/routes/acessos"));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("/acessos — render", () => {
  it("atravessa a transição loading → carregado sem rebentar", async () => {
    seed({
      accounts: [
        {
          id: "acc-1",
          full_name: "Ana Domingos",
          email: "ana@escola.ao",
          cargo: "Secretaria",
          disabled: false,
          is_self: false,
          last_sign_in_at: null,
        } as SystemAccount,
      ],
    });

    renderRoute(Acessos);

    expect(screen.getByText("A carregar contas…")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Ana Domingos")).toBeDefined();
    });
    expect(screen.getByRole("heading", { name: "Gestão de Acessos" })).toBeDefined();
  });

  it("mostra o estado vazio quando a escola ainda não tem contas", async () => {
    seed();

    renderRoute(Acessos);

    await waitFor(() => {
      expect(screen.getByText("Ainda não há contas nesta escola")).toBeDefined();
    });
  });

  it("troca o erro cru pelo aviso de configuração quando falta a chave de serviço", async () => {
    seed();
    listSystemAccountsMock.mockRejectedValue(new Error("Missing Supabase SUPABASE_SECRET_KEY"));

    renderRoute(Acessos);

    await waitFor(() => {
      expect(screen.getByText("Gestão Auth indisponível neste ambiente")).toBeDefined();
    });
    expect(screen.queryByText(/Missing Supabase/)).toBeNull();
  });
});

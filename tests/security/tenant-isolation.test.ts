import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_SCHOOL_UNAVAILABLE } from "@/features/auth/active-school";
import type { SgaMembershipContext } from "@/integrations/supabase/sga";

/**
 * Isolamento multi-tenant — a invariante em que assenta toda a arquitectura.
 *
 * As server functions correm com `supabaseAdmin` (service_role), que ignora
 * RLS. A única coisa que impede a escola A de ler/escrever dados da escola B
 * é `requireSgaWriter` resolver a escola a partir das memberships do
 * utilizador no servidor, e recusar quando a escola pedida não é uma delas.
 *
 * Não havia nenhum teste a fixar este comportamento. O comentário no código
 * regista que a falha contrária ("cair silenciosamente noutra escola") já
 * causou escritas na escola errada sem erro visível — exactamente o tipo de
 * regressão que estes testes existem para apanhar.
 */

const resolveSgaMembershipMock = vi.fn();
const readActiveSchoolCookieMock = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));

vi.mock("@/integrations/supabase/sga", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integrations/supabase/sga")>();
  return {
    ...actual,
    sgaClient: (client: unknown) => client,
    resolveSgaMembership: (...args: unknown[]) => resolveSgaMembershipMock(...args),
  };
});

vi.mock("@/features/auth/active-school-cookie.server", () => ({
  readActiveSchoolCookie: () => readActiveSchoolCookieMock(),
}));

const ESCOLA_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ESCOLA_B = "bbbbbbbb-0000-4000-8000-000000000002";

function membership(overrides: Partial<SgaMembershipContext> = {}): SgaMembershipContext {
  return {
    schoolId: ESCOLA_A,
    membershipId: "mem-1",
    roleCode: "owner",
    roleName: "Proprietário",
    appRole: "Administrador",
    allAppRoles: ["Administrador"],
    schoolName: "Colégio A",
    schoolSlug: "colegio-a",
    ...overrides,
  } as SgaMembershipContext;
}

async function loadSubject() {
  return import("@/integrations/supabase/sga-admin");
}

describe("isolamento multi-tenant (requireSgaWriter)", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveSgaMembershipMock.mockReset();
    readActiveSchoolCookieMock.mockReset();
    readActiveSchoolCookieMock.mockResolvedValue(null);
  });

  it("devolve a membership quando o utilizador pertence à escola pedida", async () => {
    resolveSgaMembershipMock.mockResolvedValue(membership());
    const { requireSgaWriter } = await loadSubject();

    const result = await requireSgaWriter("user-1", ["Administrador"], ESCOLA_A);

    expect(result.schoolId).toBe(ESCOLA_A);
  });

  it("RECUSA quando a escola pedida não é uma das memberships do utilizador", async () => {
    // O resolvedor devolve a escola A (a única do utilizador) apesar de terem
    // pedido a B. Cair para a A seria escrever na escola errada em silêncio.
    resolveSgaMembershipMock.mockResolvedValue(membership({ schoolId: ESCOLA_A }));
    const { requireSgaWriter } = await loadSubject();

    await expect(requireSgaWriter("user-1", ["Administrador"], ESCOLA_B)).rejects.toThrow(
      ACTIVE_SCHOOL_UNAVAILABLE,
    );
  });

  it("RECUSA quando a escola vem de um cookie que não corresponde à membership", async () => {
    // Mesmo vector, mas com a escola a chegar pelo cookie em vez do argumento
    // — é este o caminho que a maioria das server functions usa.
    readActiveSchoolCookieMock.mockResolvedValue(ESCOLA_B);
    resolveSgaMembershipMock.mockResolvedValue(membership({ schoolId: ESCOLA_A }));
    const { requireSgaWriter } = await loadSubject();

    await expect(requireSgaWriter("user-1", ["Administrador"])).rejects.toThrow(
      ACTIVE_SCHOOL_UNAVAILABLE,
    );
  });

  it("RECUSA quando o utilizador não tem membership activa nenhuma", async () => {
    resolveSgaMembershipMock.mockResolvedValue(null);
    const { requireSgaWriter } = await loadSubject();

    await expect(requireSgaWriter("user-sem-escola", ["Administrador"])).rejects.toThrow(
      /Sem membership activa/i,
    );
  });

  it("RECUSA quando o papel do utilizador não está entre os permitidos", async () => {
    // Pertence à escola, mas é Professor a tentar uma operação de Tesouraria.
    resolveSgaMembershipMock.mockResolvedValue(membership({ appRole: "Professor" }));
    const { requireSgaWriter } = await loadSubject();

    await expect(requireSgaWriter("user-professor", ["Tesouraria"], ESCOLA_A)).rejects.toThrow(
      /Sem permissão/i,
    );
  });

  it("RECUSA sem userId — sessão inválida", async () => {
    const { requireSgaWriter } = await loadSubject();

    await expect(requireSgaWriter("", ["Administrador"])).rejects.toThrow(/Sessão inválida/i);
  });

  it("usa os papéis de escrita por omissão quando nenhum é indicado", async () => {
    resolveSgaMembershipMock.mockResolvedValue(membership({ appRole: "Aluno" }));
    const { requireSgaWriter } = await loadSubject();

    // Aluno nunca pode escrever, mesmo sem lista explícita de papéis.
    await expect(requireSgaWriter("user-aluno")).rejects.toThrow(/Sem permissão/i);
  });

  it("aceita a assinatura legada (client, userId, roles, escola)", async () => {
    // Módulos antigos chamam requireSgaWriter(client, userId, ...). A
    // sobrecarga tem de continuar a aplicar exactamente os mesmos guardas.
    resolveSgaMembershipMock.mockResolvedValue(membership({ schoolId: ESCOLA_A }));
    const { requireSgaWriter } = await loadSubject();

    await expect(
      requireSgaWriter({} as never, "user-1", ["Administrador"], ESCOLA_B),
    ).rejects.toThrow(ACTIVE_SCHOOL_UNAVAILABLE);
  });
});

describe("isolamento multi-tenant (resolveSgaMembershipAdmin — caminhos de leitura)", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveSgaMembershipMock.mockReset();
    readActiveSchoolCookieMock.mockReset();
    readActiveSchoolCookieMock.mockResolvedValue(null);
  });

  it("RECUSA leitura de uma escola que não é do utilizador", async () => {
    resolveSgaMembershipMock.mockResolvedValue(membership({ schoolId: ESCOLA_A }));
    const { resolveSgaMembershipAdmin } = await loadSubject();

    await expect(resolveSgaMembershipAdmin("user-1", ESCOLA_B)).rejects.toThrow(
      ACTIVE_SCHOOL_UNAVAILABLE,
    );
  });

  it("devolve null (em vez de lançar) quando não há membership nenhuma", async () => {
    resolveSgaMembershipMock.mockResolvedValue(null);
    const { resolveSgaMembershipAdmin } = await loadSubject();

    await expect(resolveSgaMembershipAdmin("user-sem-escola")).resolves.toBeNull();
  });
});

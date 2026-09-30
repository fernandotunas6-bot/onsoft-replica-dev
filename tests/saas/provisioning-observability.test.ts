import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Uma escola que não consegue nascer não deixa rasto nenhum.
 *
 * O `saas_audit_logs` só é escrito no fim do provisionamento, e qualquer falha
 * a meio reverte tudo — tenant, domínio, escola, conta. Ou seja: o modo de
 * falha mais consequente do produto era também o mais invisível. Quem opera a
 * plataforma só sabia que uma escola não nasceu se o cliente se queixasse.
 *
 * Estes testes fixam o contrário: falhou, ficou registado, e o registo diz em
 * que passo parou. É a diferença entre diagnosticar e adivinhar.
 */

type Op = "select" | "insert" | "upsert" | "update" | "delete";
type Fail = { table: string; op: Op } | null;

let failAt: Fail = null;
const selectRows: Record<string, unknown> = {};
const deletedTables: string[] = [];
const insertedTables: string[] = [];
const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
const deleteUser = vi.fn(async () => ({ error: null }));

function makeQuery(table: string) {
  let op: Op = "select";
  const result = () => {
    if (failAt && failAt.table === table && failAt.op === op) {
      return { data: null, error: { code: "23505", message: `erro simulado em ${table}` } };
    }
    if (op === "delete") return { data: null, error: null };
    if (op === "insert" || op === "upsert") return { data: { id: `${table}-id` }, error: null };
    return { data: selectRows[table] ?? null, error: null };
  };
  const q: Record<string, unknown> = {
    insert: () => ((op = "insert"), insertedTables.push(table), q),
    upsert: () => ((op = "upsert"), q),
    update: (values: Record<string, unknown>) => (
      (op = "update"),
      updates.push({ table, values }),
      q
    ),
    delete: () => ((op = "delete"), deletedTables.push(table), q),
    select: () => q,
    eq: () => q,
    or: () => q,
    in: () => q,
    limit: () => q,
    single: async () => result(),
    maybeSingle: async () => result(),
    // Torna o objecto aguardável: `await db.from(x).insert(...)` sem `.single()`.
    then: (resolve: (value: unknown) => void) => resolve(result()),
  };
  return q;
}

const db = {
  from: (table: string) => makeQuery(table),
  auth: { admin: { deleteUser } },
};

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => db,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { admin: { deleteUser } } },
}));
vi.mock("@/features/saas/usage-sync", () => ({
  syncTenantUsageForSchool: async () => ({}),
}));
vi.mock("@/features/saas/school-bootstrap", () => ({
  bootstrapSchoolDefaults: async () => ({ seeded: ["academic_year", "roles"] }),
}));
let existingAuthUser: { id: string; lastSignInAt: string | null } | null = null;
vi.mock("@/features/saas/admin-account", () => ({
  EMAIL_LINKED_TO_SCHOOL_MESSAGE: "Este e-mail já tem acesso a uma escola no SIGA Plus.",
  findAuthUserByEmail: async () => existingAuthUser,
  createSchoolAdminAccount: async (
    _db: unknown,
    input: { password?: string; existing?: { userId: string } | null },
  ) => ({
    userId: input.existing?.userId ?? "admin-user-id",
    passwordSet: Boolean(input.password),
    reusedAccount: Boolean(input.existing),
    loginUrl: input.password ? "https://portal.test/auth/magic-link?token_hash=t" : null,
    inviteDelivered: false,
    inviteChannel: null,
    setupUrl: null,
    deliveryError: null,
  }),
}));

let gaps: string[] = [];
vi.mock("@/features/saas/provisioning-verify", () => ({
  findProvisioningGaps: async () => gaps,
  describeProvisioningGaps: (list: string[]) => `faltou: ${list.join(", ")}`,
}));

const { provisionTenantCore, directorFromContact } =
  await import("@/features/saas/provisioning-core");

const INPUT = {
  name: "Colégio Teste",
  commercial_name: "Colégio Teste",
  slug: "colegio-teste",
  nif: "5417000000",
  address: "Rua X",
  city: "Luanda",
  phone: "+244912345678",
  email: "geral@colegio.ao",
  logo_url: null,
  contact_name: "Ana Diretora",
  contact_phone: "+244912345678",
  contact_email: "ana@colegio.ao",
  admin_name: "Ana Diretora",
  admin_email: "ana@colegio.ao",
  admin_password: "senha-forte-123",
  plan_code: "standard",
  trial_days: 14,
} as never;

type OpsEvent = Record<string, unknown>;

function eventsFrom(calls: unknown[][]): OpsEvent[] {
  return calls.map((call) => JSON.parse(String(call[0])) as OpsEvent);
}

/** O evento com este nome, ou um objecto vazio — para a asserção falhar no campo. */
function evento(calls: unknown[][], nome: string): OpsEvent {
  return eventsFrom(calls).find((e) => e.event === nome) ?? {};
}

describe("observabilidade do provisionamento", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    failAt = null;
    gaps = [];
    deletedTables.length = 0;
    insertedTables.length = 0;
    updates.length = 0;
    existingAuthUser = null;
    deleteUser.mockClear();
    for (const key of Object.keys(selectRows)) delete selectRows[key];
    selectRows["plans"] = { id: "plan-id", max_students: 500, max_storage_gb: 10 };
    selectRows["roles"] = { id: "role-id" };
    spy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("regista a criação bem-sucedida com duração e contexto", async () => {
    const result = await provisionTenantCore(INPUT, {
      auditUserId: null,
      source: "public_signup",
    });
    expect(result.success).toBe(true);

    const completed = evento(spy.mock.calls, "tenant.provisioning.completed");
    expect(completed.tenant_id).toBe("tenants-id");
    expect(completed.school_id).toBe("schools-id");
    expect(completed.source).toBe("public_signup");
    expect(completed.count).toBe(2);
    expect(typeof completed.duration_ms).toBe("number");
  });

  it("não emite alerta de convite quando a senha foi definida no registo", async () => {
    await provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" });
    expect(eventsFrom(spy.mock.calls).map((e) => e.event)).not.toContain(
      "tenant.provisioning.invite.failed",
    );
  });

  it("avisa quando a escola nasce sem caminho de entrada para o administrador", async () => {
    const semSenha = { ...(INPUT as object), admin_password: undefined } as never;
    await provisionTenantCore(semSenha, { auditUserId: null, source: "public_signup" });

    const invite = evento(spy.mock.calls, "tenant.provisioning.invite.failed");
    expect(
      invite.event,
      "sem senha definida e sem convite entregue, o administrador não tem forma de entrar — " +
        "é recuperável, mas só se alguém souber que aconteceu",
    ).toBe("tenant.provisioning.invite.failed");
    expect(invite.reason).toBe("no_password_and_no_invite");
  });

  it("diz em que passo parou quando o domínio falha", async () => {
    failAt = { table: "tenant_domains", op: "insert" };
    await expect(
      provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" }),
    ).rejects.toThrow();

    const failed = evento(spy.mock.calls, "tenant.provisioning.failed");
    expect(failed.stage).toBe("domain");
    expect(failed.tenant_id).toBe("tenants-id");
    expect(failed.school_id).toBeNull();
    expect(failed.error).toContain("Já existe um registo");
  });

  it("diz em que passo parou quando a escola falha", async () => {
    failAt = { table: "schools", op: "insert" };
    await expect(
      provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" }),
    ).rejects.toThrow();

    const failed = evento(spy.mock.calls, "tenant.provisioning.failed");
    expect(failed.stage).toBe("school");
    expect(failed.school_id).toBeNull();
  });

  it("regista a falha da verificação final com a escola já identificada", async () => {
    gaps = ["subscrição", "papel do administrador"];
    await expect(
      provisionTenantCore(INPUT, { auditUserId: null, source: "platform_admin" }),
    ).rejects.toThrow(/faltou/);

    const failed = evento(spy.mock.calls, "tenant.provisioning.failed");
    expect(failed.stage).toBe("verify");
    expect(failed.school_id).toBe("schools-id");
    expect(failed.source).toBe("platform_admin");
  });

  it("alerta quando a reversão deixa lixo para trás", async () => {
    // Duas falhas ao mesmo tempo: a escola não é criada e o tenant não é
    // apagado. O tenant órfão fica a ocupar o slug para sempre, e a escola
    // seguinte que tentar o mesmo endereço recebe "já está em uso".
    failAt = { table: "schools", op: "insert" };
    const original = db.from;
    db.from = (table: string) => {
      const q = makeQuery(table) as Record<string, unknown>;
      if (table === "tenants") {
        q.delete = () => ({
          eq: async () => ({ data: null, error: { code: "23503", message: "ainda referenciado" } }),
        });
      }
      return q;
    };
    try {
      await expect(
        provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" }),
      ).rejects.toThrow();
    } finally {
      db.from = original;
    }

    const rollback = evento(spy.mock.calls, "tenant.provisioning.rollback.failed");
    expect(rollback.entity).toBe("tenant");
    expect(rollback.tenant_id).toBe("tenants-id");
    // …e o slug fica livre: o tenant preso é marcado e renomeado.
    expect(updates).toContainEqual({
      table: "tenants",
      values: { status: "provisioning_failed", slug: "colegio-teste-falhou-tenants-" },
    });
    expect(rollback.reason).toBe("slug_released");
  });

  it("e-mail que já pertence a uma escola: recusa antes de escrever o que quer que seja", async () => {
    existingAuthUser = { id: "outro-user", lastSignInAt: "2026-09-01T00:00:00Z" };
    selectRows["school_memberships"] = { id: "membership-existente" };
    await expect(
      provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" }),
    ).rejects.toThrow(/já tem acesso a uma escola/);
    expect(insertedTables).toEqual([]);
    expect(evento(spy.mock.calls, "tenant.provisioning.failed").stage).toBe("preflight");
  });

  it("subdomínio já usado: recusa antes de escrever", async () => {
    selectRows["tenants"] = { id: "tenant-existente" };
    await expect(
      provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" }),
    ).rejects.toThrow(/subdomínio já está em uso/);
    expect(insertedTables).toEqual([]);
  });

  it("conta sem escola (ex.: Google) é ligada à escola nova em vez de recusada", async () => {
    existingAuthUser = { id: "conta-google", lastSignInAt: "2026-09-30T13:11:00Z" };
    const result = await provisionTenantCore(INPUT, {
      auditUserId: null,
      source: "public_signup",
    });
    expect(result.adminExistingAccount).toBe(true);
    expect(insertedTables).toContain("school_memberships");
  });

  it("reversão não apaga uma conta que já existia — só a desliga da escola", async () => {
    existingAuthUser = { id: "conta-google", lastSignInAt: "2026-09-30T13:11:00Z" };
    gaps = ["membership activa"];
    await expect(
      provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" }),
    ).rejects.toThrow(/faltou/);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(updates).toContainEqual({
      table: "profiles",
      values: { school_id: null, cargo: null },
    });
  });

  it("reversão apaga a conta criada e antes os registos que a referenciam", async () => {
    gaps = ["membership activa"];
    await expect(
      provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" }),
    ).rejects.toThrow(/faltou/);
    expect(deleteUser).toHaveBeenCalledWith("admin-user-id");
    // school_settings.changed_by e enrollment_forms.created_by bloqueavam o deleteUser.
    expect(deletedTables).toEqual(expect.arrayContaining(["school_settings", "enrollment_forms"]));
  });

  it("entrada directa só no registo público; o admin de plataforma nunca a recebe", async () => {
    const publico = await provisionTenantCore(INPUT, {
      auditUserId: null,
      source: "public_signup",
    });
    expect(publico.adminLoginUrl).toContain("token_hash=");
    const interno = await provisionTenantCore(INPUT, {
      auditUserId: "platform-admin",
      source: "platform_admin",
    });
    expect(interno.adminLoginUrl).toBeNull();
  });

  it("nenhum evento leva dados da escola ou do administrador", async () => {
    await provisionTenantCore(INPUT, { auditUserId: null, source: "public_signup" });
    const emitted = JSON.stringify(eventsFrom(spy.mock.calls));
    for (const leak of [
      "Colégio Teste",
      "Ana Diretora",
      "ana@colegio.ao",
      "+244912345678",
      "5417000000",
    ]) {
      expect(emitted, `o evento não pode arrastar "${leak}"`).not.toContain(leak);
    }
  });
});

describe("director(a) a partir do responsável do registo", () => {
  it("só quem se identifica como director(a) geral passa à ficha da escola", () => {
    for (const role of [
      "Director",
      "directora",
      "Diretor Geral",
      "A Directora Geral",
      " DIRECTOR ",
    ]) {
      expect(directorFromContact(role, "Ana Diretora"), role).toBe("Ana Diretora");
    }
    for (const role of ["Director Pedagógico", "Secretário", "Proprietário", "", undefined]) {
      expect(directorFromContact(role, "Ana Diretora"), String(role)).toBeNull();
    }
  });
});

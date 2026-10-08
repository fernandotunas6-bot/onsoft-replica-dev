import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISPATCH_MAX_RECIPIENTS,
  audienceDispatchRoles,
  listAudienceEmails,
  listAudienceUserIds,
  tooManyRecipientsReason,
  unsupportedAudienceReason,
} from "@/features/integrations/audience-recipients";
import { sendResendEmailEach } from "@/features/integrations/resend-client";

type Row = Record<string, unknown>;

/** Cliente falso: devolve as linhas da tabela, aplicando só `eq` e `in`. */
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let page: [number, number] | null = null;
      const builder = {
        select: () => builder,
        order: () => builder,
        is: () => builder,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        range(from: number, to: number) {
          page = [from, to];
          return builder;
        },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          let rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          if (page) rows = rows.slice(page[0], page[1] + 1);
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as never;
}

const ESCOLA = "escola-1";
const db = fakeDb({
  school_memberships: [
    { id: "m-prof", user_id: "u-prof", school_id: ESCOLA, status: "active" },
    { id: "m-sec", user_id: "u-sec", school_id: ESCOLA, status: "active" },
    { id: "m-enc", user_id: "u-enc", school_id: ESCOLA, status: "active" },
    { id: "m-aluno", user_id: "u-aluno", school_id: ESCOLA, status: "active" },
    { id: "m-saiu", user_id: "u-saiu", school_id: ESCOLA, status: "revoked" },
    { id: "m-outra", user_id: "u-outra", school_id: "escola-2", status: "active" },
  ],
  member_roles: [
    { school_id: ESCOLA, membership_id: "m-prof", role_id: "r-prof" },
    { school_id: ESCOLA, membership_id: "m-sec", role_id: "r-sec" },
    { school_id: ESCOLA, membership_id: "m-enc", role_id: "r-enc" },
    { school_id: ESCOLA, membership_id: "m-aluno", role_id: "r-aluno" },
    { school_id: ESCOLA, membership_id: "m-saiu", role_id: "r-prof" },
    { school_id: "escola-2", membership_id: "m-outra", role_id: "r-enc" },
  ],
  roles: [
    { id: "r-prof", code: "teacher" },
    { id: "r-sec", code: "secretary" },
    { id: "r-enc", code: "guardian" },
    { id: "r-aluno", code: "student" },
  ],
  people: [
    { school_id: ESCOLA, user_id: "u-enc", email: "enc@exemplo.ao" },
    { school_id: ESCOLA, user_id: "u-prof", email: "prof@exemplo.ao" },
    { school_id: "escola-2", user_id: "u-enc", email: "outra@exemplo.ao" },
  ],
});

describe("envio de comunicados: o público decide os destinatários", () => {
  it("corpo docente e envio avulso vão ao pessoal; encarregados só aos encarregados", () => {
    expect(audienceDispatchRoles("teaching_staff")).toEqual([
      "Administrador",
      "Secretaria",
      "Tesouraria",
      "Professor",
    ]);
    expect(audienceDispatchRoles(undefined)).toEqual(audienceDispatchRoles("teaching_staff"));
    expect(audienceDispatchRoles("all_guardians")).toEqual(["Encarregado"]);
  });

  it("públicos que os cargos não resolvem não têm envio automático", () => {
    for (const audience of [
      "guardians_with_debt",
      "students_secondary",
      "students_finalists",
      "alumni_all",
    ]) {
      expect(audienceDispatchRoles(audience)).toBeNull();
    }
    expect(unsupportedAudienceReason("guardians_with_debt")).toMatch(/Encarregados em dívida/);
    expect(unsupportedAudienceReason("alumni_events")).toMatch(/Antigos alunos/);
    expect(tooManyRecipientsReason(120)).toMatch(/120 contactos.*até 50: nada foi enviado/);
    expect(DISPATCH_MAX_RECIPIENTS).toBe(50);
  });

  it("só vínculos activos desta escola, pelo cargo nesta escola", async () => {
    const staff = await listAudienceUserIds(db, ESCOLA, audienceDispatchRoles("teaching_staff")!);
    expect(staff.sort()).toEqual(["u-prof", "u-sec"]);
    const guardians = await listAudienceUserIds(db, ESCOLA, ["Encarregado"]);
    expect(guardians).toEqual(["u-enc"]);
  });

  it("o e-mail vem da ficha da pessoa nesta escola", async () => {
    expect(await listAudienceEmails(db, ESCOLA, ["u-enc"])).toEqual(["enc@exemplo.ao"]);
  });
});

describe("e-mail: um por destinatário", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ninguém vê os endereços dos outros, e uma falha não pára o resto", async () => {
    const bodies: Array<{ to: string[] }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { to: string[] };
        bodies.push(body);
        if (body.to[0] === "falha@exemplo.ao") {
          return new Response(JSON.stringify({ message: "inválido" }), { status: 422 });
        }
        return new Response(JSON.stringify({ id: `id-${body.to[0]}` }), { status: 200 });
      }),
    );
    const result = await sendResendEmailEach({
      apiKey: "re_test",
      from: "SIGA <noreply@exemplo.ao>",
      to: ["a@exemplo.ao", "falha@exemplo.ao", "b@exemplo.ao", "A@exemplo.ao"],
      subject: "Reunião",
      text: "Texto",
    });
    expect(bodies.map((body) => body.to)).toEqual([
      ["a@exemplo.ao"],
      ["falha@exemplo.ao"],
      ["b@exemplo.ao"],
    ]);
    expect(result.sent).toBe(2);
    expect(result.errors).toEqual(["Resend: inválido"]);
  });
});

describe("envio de comunicados: servidor e ecrã", () => {
  const server = readFileSync(join(process.cwd(), "src/features/integrations/server.ts"), "utf8");
  const page = readFileSync(join(process.cwd(), "src/routes/comunicacoes.tsx"), "utf8");

  it("as três vias resolvem o público, e o e-mail sai um a um", () => {
    expect(server.match(/await resolveAudienceRecipients\(/g)?.length).toBe(3);
    expect(server).not.toMatch(/listSchoolStaff(Emails|Phones)/);
    expect(server).toMatch(/await sendResendEmailEach\(\{/);
    expect(server).not.toMatch(/await sendResendEmail\(\{/);
  });

  it("o ecrã de comunicados manda o público em todos os envios", () => {
    expect(page.match(/audience: values\.audience/g)?.length).toBe(3);
    expect(page).toMatch(/audience: c\.audience as Audience/);
  });
});

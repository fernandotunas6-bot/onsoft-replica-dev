import { describe, expect, it, vi } from "vitest";

/**
 * E-inscrição real: o website liga «Candidatura» ao formulário oficial
 * `/matricula/<campanha>` com as mesmas condições do formulário.
 */
const accept = vi.hoisted(() => ({ value: true }));
vi.mock("@/features/enrollment/public-acceptance", () => ({
  schoolAcceptsPublicEnrollment: async () => accept.value,
}));
const { resolveSchoolAdmissions, CLOSED_ADMISSIONS } =
  await import("@/features/school-website/admissions");

type Row = { school_id: string; slug: string; is_open: boolean; deleted_at: string | null };

function db(rows: Row[]) {
  return {
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let max = Infinity;
      const chain = {
        select: () => chain,
        eq: (key: keyof Row, value: unknown) => {
          filters.push((row) => row[key] === value);
          return chain;
        },
        is: (key: keyof Row, value: unknown) => {
          filters.push((row) => row[key] === value);
          return chain;
        },
        limit: (n: number) => {
          max = n;
          return chain;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: rows.filter((row) => filters.every((f) => f(row))).slice(0, max),
            error: null,
          }).then(resolve),
      };
      return chain;
    },
  } as never;
}

const open = (slug: string, school = "school-a"): Row => ({
  school_id: school,
  slug,
  is_open: true,
  deleted_at: null,
});

describe("resolveSchoolAdmissions", () => {
  it("sem campanha escolhida, usa a única campanha aberta da escola", async () => {
    accept.value = true;
    const rows = [open("inscricoes-2026"), open("outra-escola", "school-b")];
    await expect(resolveSchoolAdmissions(db(rows), "school-a", "")).resolves.toEqual({
      isOpen: true,
      path: "/matricula/inscricoes-2026",
    });
  });

  it("a campanha escolhida no editor prevalece; fechada ou apagada dá encerradas", async () => {
    accept.value = true;
    const rows = [
      open("a"),
      open("b"),
      { ...open("fechada"), is_open: false },
      { ...open("apagada"), deleted_at: "2026-10-01" },
    ];
    await expect(resolveSchoolAdmissions(db(rows), "school-a", "b")).resolves.toEqual({
      isOpen: true,
      path: "/matricula/b",
    });
    for (const slug of ["fechada", "apagada", "inexistente"])
      await expect(resolveSchoolAdmissions(db(rows), "school-a", slug)).resolves.toEqual(
        CLOSED_ADMISSIONS,
      );
  });

  it("com várias campanhas abertas e nenhuma escolhida não adivinha", async () => {
    accept.value = true;
    await expect(
      resolveSchoolAdmissions(db([open("a"), open("b")]), "school-a", null),
    ).resolves.toEqual(CLOSED_ADMISSIONS);
  });

  it("escola que não pode receber candidaturas não anuncia a campanha", async () => {
    accept.value = false;
    await expect(resolveSchoolAdmissions(db([open("a")]), "school-a")).resolves.toEqual(
      CLOSED_ADMISSIONS,
    );
  });
});

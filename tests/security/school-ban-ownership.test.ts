import { describe, expect, it } from "vitest";
import { planSchoolBan } from "@/features/access/server";

/**
 * O bloqueio de auth.users vale para todas as escolas. Antes, reactivar a conta
 * numa escola levantava-o sempre — também quando tinha sido posto pela plataforma
 * ou por outra escola. Na produção, a 2026-10-02, 83 contas estavam bloqueadas
 * sem ter sido por nenhuma escola.
 */
const A = "escola-a";
const B = "escola-b";
const futuro = "2999-12-31T00:00:00Z";

describe("quem levanta o bloqueio global", () => {
  it("suspender sem outra escola activa bloqueia e anota a escola", () => {
    expect(
      planSchoolBan({
        disabled: true,
        schoolId: A,
        hasOtherActiveSchools: false,
        bannedUntil: null,
        schoolBans: [],
      }),
    ).toMatchObject({ update: true, banDuration: "876000h", schoolBans: [A] });
  });

  it("suspender com outra escola activa não bloqueia a conta", () => {
    expect(
      planSchoolBan({
        disabled: true,
        schoolId: A,
        hasOtherActiveSchools: true,
        bannedUntil: null,
        schoolBans: [],
      }),
    ).toMatchObject({ update: false });
  });

  it("reactivar levanta o bloqueio quando foi só esta escola", () => {
    expect(
      planSchoolBan({
        disabled: false,
        schoolId: A,
        hasOtherActiveSchools: false,
        bannedUntil: futuro,
        schoolBans: [A],
      }),
    ).toMatchObject({ update: true, banDuration: "none", schoolBans: [], notice: null });
  });

  it("reactivar NÃO levanta um bloqueio que não é desta escola (plataforma)", () => {
    const plan = planSchoolBan({
      disabled: false,
      schoolId: A,
      hasOtherActiveSchools: false,
      bannedUntil: futuro,
      schoolBans: undefined,
    });
    expect(plan.banDuration).toBeUndefined();
    expect(plan.notice).toMatch(/continua bloqueada/);
  });

  it("reactivar NÃO levanta enquanto outra escola mantém o bloqueio", () => {
    const plan = planSchoolBan({
      disabled: false,
      schoolId: A,
      hasOtherActiveSchools: false,
      bannedUntil: futuro,
      schoolBans: [A, B],
    });
    expect(plan).toMatchObject({ update: true, schoolBans: [B] });
    expect(plan.banDuration).toBeUndefined();
  });
});

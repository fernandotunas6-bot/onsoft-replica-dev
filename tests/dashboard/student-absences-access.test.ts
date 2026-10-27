import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { getMyAbsencesBySubject } from "@/features/dashboard/student-absences";

const scope = vi.hoisted(() => vi.fn());
vi.mock("@/features/dashboard/student-access", () => ({ resolveVisibleStudent: scope }));
beforeEach(() => scope.mockReset());

describe("serviço de faltas mantém o âmbito do aluno", () => {
  it("não devolve dados quando o resolvedor recusa o educando", async () => {
    const student = "00000000-0000-0000-0000-0000000000c1";
    scope.mockResolvedValue(null);
    const summary = await getMyAbsencesBySubject("verified-user", { studentId: student });
    expect(scope).toHaveBeenCalledWith("verified-user", student);
    expect(summary.subjects).toEqual([]);
    expect(summary.totals.lessons).toBe(0);
  });

  it("identificador inválido é recusado antes de consultar o âmbito", async () => {
    await expect(
      getMyAbsencesBySubject("verified-user", { studentId: "invalid" }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(scope).not.toHaveBeenCalled();
  });
});

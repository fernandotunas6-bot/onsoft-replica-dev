import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  agenda: vi.fn(),
  attendance: vi.fn(),
  grades: vi.fn(),
  timetable: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown;
    const builder = {
      middleware: () => builder,
      validator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (input: object) => unknown) => (input: { data: unknown }) =>
        fn({ data: validate(input.data), context: { userId: "verified-user" } }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: mocks.membership,
}));
vi.mock("@/features/dashboard/student-agenda", () => ({
  getMyStudentAgenda: mocks.agenda,
  getMyStudentTimetable: mocks.timetable,
}));
vi.mock("@/features/academic/student-grades", () => ({ getMyStudentGrades: mocks.grades }));
vi.mock("@/features/pedagogica/attendance-server", () => ({
  getStudentAttendanceHistory: mocks.attendance,
}));
import {
  getStudentWebsitePage,
  studentWebsitePageInput,
} from "@/features/school-website/student-portal-server";
const schoolId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ appRole: "Aluno", schoolId });
  mocks.agenda.mockResolvedValue({ className: "Turma A" });
  mocks.attendance.mockResolvedValue({
    stats: { total: 2 },
    records: [{ private: "not returned" }],
  });
});
describe("API privada do portal do website", () => {
  it("a escola indicada nunca concede acesso e uma conta docente também é recusada", async () => {
    for (const membership of [
      null,
      { appRole: "Professor", schoolId },
      { appRole: "Aluno", schoolId: "other-school" },
    ]) {
      mocks.membership.mockResolvedValue(membership);
      await expect(getStudentWebsitePage({ data: { schoolId, section: "" } })).rejects.toThrow(
        /não tem acesso/,
      );
    }
    expect(mocks.agenda).not.toHaveBeenCalled();
  });
  it("reutiliza o âmbito do próprio estudante e só devolve o resumo necessário", async () => {
    const result = await getStudentWebsitePage({ data: { schoolId, section: "" } });
    expect(mocks.membership).toHaveBeenCalledWith("verified-user");
    expect(mocks.agenda).toHaveBeenCalledWith();
    expect(mocks.attendance).toHaveBeenCalledWith({ data: {} });
    expect(result).toEqual({
      agenda: { className: "Turma A" },
      attendance: { stats: { total: 2 } },
    });
    expect(() =>
      studentWebsitePageInput.parse({ schoolId, section: "", studentId: "other" }),
    ).toThrow();
  });
});

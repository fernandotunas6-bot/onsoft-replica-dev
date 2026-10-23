/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({
  role: "Aluno",
  agenda: vi.fn(),
  attendance: vi.fn(),
  timetable: vi.fn(),
  grades: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({
    id: "user-a",
    role: mocks.role,
    schoolId: "school-a",
    schoolSlug: "school-a",
    schoolName: "Escola A",
    activeStudentId: "student-a",
    name: "Ana Teste",
    email: "ana@example.invalid",
    profile: { isPending: false },
  }),
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ selectedYearLabel: "2026" }),
}));
vi.mock("@/features/auth/use-sign-out", () => ({ useSignOut: () => ({ signOut: mocks.signOut }) }));
vi.mock("@/features/school-website/student-portal-server", () => ({
  getStudentWebsitePage: mocks.agenda,
}));
import { StudentWebsitePortal } from "@/features/school-website/StudentWebsitePortal";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "Aluno";
  mocks.agenda.mockResolvedValue({
    agenda: { className: "Turma A", average: 14, upcomingAssessments: [] },
    attendance: { stats: { total: 0 } },
  });
  mocks.attendance.mockResolvedValue({ stats: { total: 0 } });
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StudentWebsitePortal />
    </QueryClientProvider>,
  );
}
const request = {
  type: "siga-student-request",
  version: 1,
  schoolSlug: "school-a",
  section: "",
  requestId: "12345678-1234-1234-1234-123456789012",
};
describe("dados do estudante no visual do website", () => {
  it("não pede dados de estudante para uma conta docente", () => {
    mocks.role = "Professor";
    mount();
    expect(screen.getByRole("heading").textContent).toMatch(/destina-se a estudantes/);
    expect(document.querySelector("iframe")).toBeNull();
    expect(mocks.agenda).not.toHaveBeenCalled();
  });
  it("só carrega as APIs após o pedido da janela da própria escola, sem enviar tokens ou identificadores escolhidos no frame", async () => {
    mount();
    const iframe = document.querySelector("iframe")!;
    const send = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          source: iframe.contentWindow,
          data: { ...request, schoolSlug: "school-b" },
        }),
      ),
    );
    expect(mocks.agenda).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          source: iframe.contentWindow,
          data: { ...request, studentId: "other", schoolId: "other" },
        }),
      ),
    );
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(mocks.agenda).toHaveBeenCalledWith({ data: { schoolId: "school-a", section: "" } });
    const payload = send.mock.calls[0][0];
    expect(payload).toMatchObject({
      ok: true,
      schoolSlug: "school-a",
      data: { name: "Ana Teste", agenda: { className: "Turma A" } },
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /access_token|refresh_token|other|student-a|user-a/,
    );
  });
  it("uma falha da API produz erro e nunca um perfil ou dados fictícios", async () => {
    mocks.agenda.mockRejectedValue(new Error("service unavailable"));
    mount();
    const iframe = document.querySelector("iframe")!;
    const send = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          source: iframe.contentWindow,
          data: request,
        }),
      ),
    );
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toMatchObject({ ok: false });
    expect(send.mock.calls[0][0]).not.toHaveProperty("data");
  });
});

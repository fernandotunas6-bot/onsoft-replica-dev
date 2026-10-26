// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { AttendanceWorkspaceModule } from "@/features/pedagogica/components/AttendanceWorkspaceModule";

/**
 * `/pedagogica?tab=presencas&professor=<id>` (menu do professor): as aulas do dia
 * pedem-se só desse professor; a turma da URL manda sobre ele.
 */

vi.setConfig({ testTimeout: 20_000 });

const server = vi.hoisted(() => ({
  sessions: vi.fn(async () => ({ sessions: [], date: "2026-10-26", pendingCount: 0 })),
  history: vi.fn(async () => ({ records: [] })),
}));
vi.mock("@/features/pedagogica/attendance-server", () => ({
  listTeacherAttendanceSessions: server.sessions,
  getStudentAttendanceHistory: server.history,
}));
vi.mock("@/features/pedagogica/components/AttendanceCallDialog", () => ({
  AttendanceCallDialog: () => null,
}));
vi.mock("@/features/pedagogica/components/AttendanceJustificationModal", () => ({
  ReviewAttendanceJustificationModal: () => null,
}));

const PROF = "66666666-6666-4666-8666-666666666666";
const TURMA = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  cleanup();
  server.sessions.mockClear();
});

function renderModule(props: ComponentProps<typeof AttendanceWorkspaceModule>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AttendanceWorkspaceModule initialDate="2026-10-26" {...props} />
    </QueryClientProvider>,
  );
}

describe("presenças de um professor", () => {
  it("pede só as aulas do professor da URL e diz de quem são", async () => {
    renderModule({ teacherId: PROF, teacherName: "João Neto" });
    await waitFor(() =>
      expect(server.sessions).toHaveBeenCalledWith({
        data: { date: "2026-10-26", teacherId: PROF },
      }),
    );
    expect(screen.getByText(/João Neto/)).toBeDefined();
  });

  it("sem professor, as aulas de todos, como antes", async () => {
    renderModule({});
    await waitFor(() =>
      expect(server.sessions).toHaveBeenCalledWith({ data: { date: "2026-10-26" } }),
    );
  });

  it("a turma da URL manda sobre o professor: só as aulas dessa turma", async () => {
    renderModule({ teacherId: PROF, initialClassGroupId: TURMA });
    await waitFor(() =>
      expect(server.sessions).toHaveBeenCalledWith({
        data: { date: "2026-10-26", classGroupId: TURMA },
      }),
    );
  });

  it("com a turma, o título das aulas do dia diz o nome dela", async () => {
    renderModule({ initialClassGroupId: TURMA, classGroupName: "10.ª A" });
    await waitFor(() =>
      expect(server.sessions).toHaveBeenCalledWith({
        data: { date: "2026-10-26", classGroupId: TURMA },
      }),
    );
    expect(screen.getByText("· 10.ª A")).toBeDefined();
  });
});

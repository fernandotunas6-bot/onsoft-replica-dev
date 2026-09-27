// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  routeComponentOf,
  currentAccountMock,
  setCurrentAccount,
  resetCurrentAccount,
  supabaseClientMock,
  resetRealtime,
} from "./_harness";
import { emptySchoolTodayOps } from "@/features/dashboard/school-today";

vi.setConfig({ testTimeout: 35_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/integrations/supabase/client", async () => supabaseClientMock());
vi.mock("@/features/auth/use-current-account", () => currentAccountMock());
vi.mock("@/lib/warm-charts", () => ({ warmDashboardCharts: vi.fn() }));
vi.mock("@/features/spotlight/SpotlightRail", () => ({
  SpotlightRail: () => <div data-testid="spotlight-rail" />,
}));

vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { id: "sch-1", name: "Complexo Escolar Teste", academic_year: "2025/2026" },
    selectedYearLabel: "Ano Lectivo 2025/2026",
  }),
}));

vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({
    hasCapability: () => false,
    isInstalled: () => false,
    granted: new Set(),
  }),
}));

const getDashboardOverviewMock = vi.fn().mockResolvedValue({
  role: "Aluno",
  academicYear: {
    name: "2025/2026",
    code: "2025/2026",
    starts_on: "2025-10-01",
    ends_on: "2026-07-31",
    status: "active",
  },
  yearProgress: 40,
  yearPhase: "in_progress",
  capabilities: { students: true, finance: false, documents: false, audit: false },
  productivityAudit: {
    systemHealth: "Operacional",
    periodLabel: "2025/2026",
    metrics: [],
  },
  totals: {
    students: 1,
    activeStudents: 1,
    applicants: 0,
    male: 1,
    female: 0,
    classGroups: 1,
    courses: 1,
    rooms: 1,
    attendanceAverage: 96,
  },
  upcomingEvents: [],
  announcements: [],
  finance: {
    revenue: 0,
    expenses: 0,
    balance: 0,
    totalOverdue: 0,
    collectionRate: 100,
    monthly: [],
  },
});

vi.mock("@/features/dashboard/server", () => ({
  getDashboardOverview: () => getDashboardOverviewMock(),
  getSchoolTodayOps: vi.fn().mockResolvedValue(emptySchoolTodayOps()),
}));

vi.mock("@/features/calendar/server", () => ({
  listCalendarEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/spotlight/server", () => ({
  listSpotlightConfig: vi.fn().mockResolvedValue([]),
}));

const getStudentAttendanceHistoryMock = vi.fn().mockResolvedValue({
  records: [
    {
      id: "rec-1",
      sessionId: "sess-1",
      date: "2026-09-10",
      time: "08:00",
      subject: "Matemática",
      status: "unexcused",
      notes: "Ausência",
    },
  ],
  stats: {
    total: 50,
    present: 48,
    absent: 2,
    excused: 1,
    late: 0,
    rate: 96,
  },
});

const listTeacherAttendanceSessionsMock = vi.fn().mockResolvedValue({
  sessions: [
    {
      id: "sess-1",
      class_group_id: "cls-1",
      class_group_name: "10ª Classe · Turma A",
      subject_id: "sub-1",
      subject_name: "Matemática",
      timetable_slot_id: "slot-1",
      starts_at: "08:00",
      ends_at: "09:30",
      status: "pending",
      total_students: 35,
      present_count: 0,
    },
    {
      id: "sess-2",
      class_group_id: "cls-2",
      class_group_name: "11ª Classe · Turma B",
      subject_id: "sub-2",
      subject_name: "Física",
      timetable_slot_id: "slot-2",
      starts_at: "10:00",
      ends_at: "11:30",
      status: "completed",
      total_students: 30,
      present_count: 28,
    },
  ],
  pendingCount: 1,
});

vi.mock("@/features/pedagogica/attendance-server", () => ({
  getStudentAttendanceHistory: () => getStudentAttendanceHistoryMock(),
  listTeacherAttendanceSessions: () => listTeacherAttendanceSessionsMock(),
}));

vi.mock("@/features/academic/server", () => ({
  listPedagogicalWorkspace: vi.fn().mockResolvedValue({
    classGroups: [
      { id: "cls-1", name: "10ª Classe · Turma A" },
      { id: "cls-2", name: "11ª Classe · Turma B" },
    ],
  }),
}));

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/index");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetCurrentAccount();
  resetRealtime();
});

describe("/ (painel principal) — Portais especializados por perfil", () => {
  it("monta o Portal do Aluno com indicadores académicos, menu de auto-serviço e cartão virtual", async () => {
    setCurrentAccount({
      role: "Aluno",
      name: "João Silva Manuel",
      firstName: "João",
      linkedEntities: {
        person_id: "per-1",
        student_id: "stu-1",
        teacher_id: null,
        guardian_person_id: null,
        linked_students: [],
      },
      activeStudent: {
        student_id: "stu-1",
        full_name: "João Silva Manuel",
        class_name: "11ª Classe · Turma B",
      },
    });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText(/João/)).toBeDefined();
      expect(screen.getByText(/11ª Classe · Turma B/)).toBeDefined();
    });

    expect(screen.getByText("A minha turma")).toBeDefined();
    expect(screen.getByText("Notas e boletim")).toBeDefined();
    expect(screen.getAllByText("Faltas e presenças").length).toBeGreaterThan(0);
    expect(screen.getByText("O meu perfil")).toBeDefined();
    expect(screen.getByText("Horário da semana")).toBeDefined();
    expect(screen.getByText("Cartão de acesso")).toBeDefined();

    expect(screen.getByRole("button", { name: /Cartão de acesso/i })).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText(/96%/).length).toBeGreaterThan(0);
      expect(screen.getByText(/48 presenças/)).toBeDefined();
    });
  });

  it("monta o Portal do Encarregado de Educação com dados do educando e canais de contacto", async () => {
    setCurrentAccount({
      role: "Encarregado",
      name: "Manuel da Costa",
      firstName: "Manuel",
      linkedEntities: {
        person_id: "per-enc",
        student_id: null,
        teacher_id: null,
        guardian_person_id: "grd-1",
        linked_students: [
          {
            student_id: "stu-filho",
            full_name: "Ana Manuel da Costa",
            class_name: "7ª Classe · Turma A",
          },
        ],
      },
      activeStudent: {
        student_id: "stu-filho",
        full_name: "Ana Manuel da Costa",
        class_name: "7ª Classe · Turma A",
      },
    });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: /Manuel/ })).toBeDefined();
      expect(screen.getAllByText(/Ana Manuel da Costa/).length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Boletim e notas")).toBeDefined();
    expect(screen.getAllByText(/Faltas e presenças/).length).toBeGreaterThan(0);
    expect(screen.getByText("Horário da semana")).toBeDefined();
    expect(screen.getByText("Contactar a escola")).toBeDefined();
  });

  it("monta o Portal do Professor com sessões de chamada, turmas atribuídas e atalhos de docência", async () => {
    setCurrentAccount({
      role: "Professor",
      name: "Teresa Gaspar",
      firstName: "Teresa",
      linkedEntities: {
        person_id: "per-prof",
        student_id: null,
        teacher_id: "prof-1",
        guardian_person_id: null,
        linked_students: [],
      },
    });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText(/Teresa/)).toBeDefined();
    });

    expect(screen.getAllByText("Assinar presença (QR)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fazer chamada").length).toBeGreaterThan(0);
    expect(screen.getByText("Lançar notas")).toBeDefined();
    expect(screen.getByText("Planos de aula")).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText(/Matemática/).length).toBeGreaterThan(0);
    });
  });
});

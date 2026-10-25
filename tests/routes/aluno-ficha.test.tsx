// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
  setRouteParams,
  setRouteSearch,
} from "./_harness";

/**
 * Render de `/alunos/$studentId` por secção (SIGA Context Engine, piloto Aluno).
 *
 * Fixa o que só o render decide: sem `?secao=` a ficha é a de sempre; com secção
 * mostra o cabeçalho do aluno e só os blocos dessa secção; o financeiro pedido
 * por quem o servidor não deixa ler devolve a ficha completa com um aviso.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());
vi.mock("@/integrations/supabase/client", async () =>
  (await import("./_harness")).supabaseClientMock(),
);
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock({ role: "Secretaria" }),
);

const STUDENT = "44444444-4444-4444-8444-444444444444";

const profile = {
  student: {
    id: STUDENT,
    registration_number: "2026-0142",
    full_name: "Ana Paula Silva",
    email: "ana.silva@email.ao",
    phone: "+244923456789",
    student_status: "active",
    payment_status: "pending",
    grade_name: "10.ª",
    class_name: "10.ª A",
    course_name: "Ciências Físicas e Biológicas",
    academic_year: "2026/2027",
    person_id: "pessoa-1",
    school_id: "escola-teste",
    person_version: 1,
    enrollment_id: "matricula-1",
    enrollment_status: "active",
    enrolled_on: "2026-09-01",
    class_group_id: "turma-1",
    academic_year_id: "ano-1",
    final_average: 14.2,
    attendance_rate: 93,
    gender: "Feminino",
    birth_date: "2010-03-14",
    photo_url: null,
    province: "Luanda",
    municipality: "Belas",
    commune: "Talatona",
    address: "Rua 12",
  },
  guardians: [
    {
      guardian_person_id: "pessoa-2",
      relationship: "mae",
      is_primary: true,
      guardian: { full_name: "Joana Silva", phone_primary: "+244912000111", email: null },
    },
  ],
};

const invoices = [
  {
    id: "fatura-1",
    student_id: STUDENT,
    number: "FT-2026/0311",
    description: "Propina de Outubro",
    total_amount: 45000,
    amount_paid: 0,
    status: "pending",
  },
];

vi.mock("@/features/students/server", () => ({
  getStudentProfile: () => Promise.resolve(profile),
  assignGuardian: vi.fn(),
  cancelEnrollment: vi.fn(),
  changeStudentStatus: vi.fn(),
  enrollStudentInClass: vi.fn(),
  removeGuardian: vi.fn(),
  updateEnrollmentAttendance: vi.fn(),
  updateStudentProfile: vi.fn(),
}));
vi.mock("@/features/finance/server", () => ({
  listInvoices: () => Promise.resolve(invoices),
  issueInvoice: vi.fn(),
  recordInvoicePayment: vi.fn(),
}));
vi.mock("@/features/finance/scholarship-server", () => ({
  getStudentScholarship: () => Promise.resolve({ percent: 10, enrolled: true }),
  setStudentScholarship: vi.fn(),
}));
vi.mock("@/features/finance/student-scholarship-server", () => ({
  getStudentScholarships: () => Promise.resolve({ available: true, canWrite: false, rows: [] }),
  grantScholarship: vi.fn(),
  revokeScholarship: vi.fn(),
}));
vi.mock("@/features/academic/server", () => ({
  listPedagogicalWorkspace: () =>
    Promise.resolve({ classGroups: [], subjects: [], classSubjects: [], termGrades: [] }),
  getStudentAcademicHistory: () => Promise.resolve({ years: [] }),
}));
vi.mock("@/features/documents/server", () => ({
  createDocumentRequest: vi.fn(),
  listDocumentWorkspace: () => Promise.resolve({ templates: [], requests: [] }),
}));
vi.mock("@/features/people/server", () => ({
  searchPeople: () => Promise.resolve([]),
}));
vi.mock("@/features/arquivos/server", () => ({
  listSchoolFiles: () => Promise.resolve({ files: [] }),
}));

let Ficha: ComponentType;

beforeAll(async () => {
  Ficha = routeComponentOf(await import("@/routes/alunos/$studentId"));
}, 60_000);

afterEach(() => {
  cleanup();
  resetRouteLocation();
  resetCurrentAccount();
});

const headings = () => screen.getAllByRole("heading").map((heading) => heading.textContent);

async function open(search: Record<string, unknown>, role = "Secretaria") {
  setRouteParams({ studentId: STUDENT });
  setRouteSearch(search);
  setCurrentAccount({ role, roles: [role] });
  renderRoute(Ficha);
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1, name: "Ana Paula Silva" })).toBeDefined();
  });
}

describe("/alunos/$studentId — secções", () => {
  it("sem secção, a ficha completa de sempre", async () => {
    await open({});
    await waitFor(() =>
      expect(screen.getByText("FT-2026/0311 · Propina de Outubro")).toBeDefined(),
    );
    expect(headings()).toEqual(
      expect.arrayContaining([
        "Arquivos do aluno",
        "Dados pessoais",
        "Encarregados de educação",
        "Matrícula e situação",
      ]),
    );
    expect(screen.getByText("Média final")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Ver ficha completa" })).toBeNull();
  });

  it("Financeiro mostra só o financeiro, com o caminho de volta à ficha", async () => {
    await open({ secao: "financeiro" });
    await waitFor(() =>
      expect(screen.getByText("FT-2026/0311 · Propina de Outubro")).toBeDefined(),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Financeiro" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Situação financeira" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver ficha completa" })).toBeDefined();
    expect(screen.queryByText("Dados pessoais")).toBeNull();
    expect(screen.queryByText("Média final")).toBeNull();
    expect(screen.queryByText("Arquivos do aluno")).toBeNull();
    expect(screen.queryByText("Curso")).toBeNull();
  });

  it("Identificação mostra os dados pessoais e os encarregados, sem faturas", async () => {
    await open({ secao: "identificacao" });
    expect(screen.getByText("Dados pessoais")).toBeDefined();
    expect(screen.getByText("Encarregados de educação")).toBeDefined();
    expect(screen.queryByText("Situação financeira")).toBeNull();
    expect(screen.queryByText("FT-2026/0311 · Propina de Outubro")).toBeNull();
    expect(screen.queryByText("Média final")).toBeNull();
  });

  it("Académico mostra os indicadores e a matrícula, sem a situação financeira", async () => {
    await open({ secao: "academico" });
    expect(screen.getByText("Média final")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Matrícula" })).toBeDefined();
    expect(screen.getByText("Curso")).toBeDefined();
    expect(screen.queryByText("Situação financeira")).toBeNull();
    expect(screen.queryByText("FT-2026/0311 · Propina de Outubro")).toBeNull();
  });

  it("Documentos mostra os arquivos do aluno", async () => {
    await open({ secao: "documentos" });
    expect(screen.getByText("Arquivos do aluno")).toBeDefined();
    expect(screen.queryByText("Dados pessoais")).toBeNull();
    expect(screen.queryByText("Média final")).toBeNull();
  });

  it("o financeiro pedido por quem o servidor não deixa ler devolve a ficha completa", async () => {
    await open({ secao: "financeiro" }, "Encarregado");
    const notice = screen
      .getAllByRole("status")
      .find((element) => element.textContent?.includes("Sem acesso a «Financeiro»"));
    expect(notice).toBeDefined();
    expect(screen.getByText("Dados pessoais")).toBeDefined();
    expect(screen.queryByRole("heading", { level: 2, name: "Financeiro" })).toBeNull();
  });
});

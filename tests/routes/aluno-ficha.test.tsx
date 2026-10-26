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
const baseInvoices = [...invoices];
const invoiceRow = (
  id: string,
  number: string,
  description: string,
  due_on: string,
  total_amount: number,
  amount_paid: number,
  status: string,
) => ({ id, student_id: STUDENT, number, description, due_on, total_amount, amount_paid, status });
const listInvoicesSpy = vi.fn(() => Promise.resolve(invoices));

// Anos lectivos que o servidor devolveria (o motor da Pauta Final), do mais antigo
// para o mais recente.
const history = { years: [] as unknown[] };
const subject = (subjectId: string, subjectName: string, mfd: number | null) => ({
  subjectId,
  subjectName,
  mt1: mfd,
  mt2: mfd,
  mt3: mfd,
  mfd,
});
const twoYears = [
  {
    academicYearId: "ano-0",
    academicYearName: "2025/2026",
    academicYearStartsOn: "2025-09-01",
    classGroupName: "9.ª B",
    gradeName: "9.ª",
    courseName: "",
    enrollmentStatus: "completed",
    cycle: "i_ciclo",
    subjects: [subject("mat", "Matemática", 12.4), subject("fis", "Física", 8.6)],
    overallMfd: 10.5,
    status: "TRANSITA",
    official: { outcome: "TRANSITA", finalAverage: 11 },
    passingValue: 10,
  },
  {
    academicYearId: "ano-1",
    academicYearName: "2026/2027",
    academicYearStartsOn: "2026-09-01",
    classGroupName: "10.ª A",
    gradeName: "10.ª",
    courseName: "Ciências Físicas e Biológicas",
    enrollmentStatus: "active",
    cycle: "ii_ciclo",
    subjects: [subject("mat", "Matemática", 14.2)],
    overallMfd: 14.2,
    status: "PENDENTE",
    official: null,
    passingValue: 10,
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
  listInvoices: () => listInvoicesSpy(),
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
  getStudentAcademicHistory: () => Promise.resolve({ years: history.years }),
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
  history.years = [];
  invoices.splice(0, invoices.length, ...baseInvoices);
  listInvoicesSpy.mockClear();
  resetRouteLocation();
  resetCurrentAccount();
});

const headings = () => screen.getAllByRole("heading").map((heading) => heading.textContent);

async function open(
  search: Record<string, unknown>,
  role = "Secretaria",
  grants: Record<string, string> = {},
) {
  setRouteParams({ studentId: STUDENT });
  setRouteSearch(search);
  setCurrentAccount({ role, roles: [role], grants });
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

  it("Financeiro mostra todas as faturas, por pagar e pagas, com a dívida", async () => {
    invoices.splice(
      0,
      invoices.length,
      invoiceRow("f-set", "FT-0301", "Propina de Setembro", "2026-09-05", 45000, 45000, "paid"),
      invoiceRow("f-out", "FT-0311", "Propina de Outubro", "2020-10-05", 45000, 15000, "partial"),
      invoiceRow("f-dez", "FT-0331", "Propina de Dezembro", "2099-12-05", 45000, 0, "pending"),
    );
    await open({ secao: "financeiro" });
    await waitFor(() => expect(screen.getByText("FT-0311 · Propina de Outubro")).toBeDefined());
    const porPagar = screen.getByRole("heading", { level: 3, name: "Por pagar · 2" });
    const pagas = screen.getByRole("heading", { level: 3, name: "Pagas · 1" });
    expect(porPagar.nextElementSibling?.textContent).toMatch(/FT-0311.*FT-0331/);
    expect(pagas.nextElementSibling?.textContent).toContain("FT-0301");
    expect(screen.getByText("Vencida · paga em parte")).toBeDefined();
    expect(screen.getByText(/Vence a 05\/10\/2020/)).toBeDefined();
    expect(screen.getByText("Falta pagar").nextElementSibling?.textContent).toMatch(
      /75[\s.]?000.*30[\s.]?000.*vencido/,
    );
  });

  it("a ficha completa mostra as cinco mais recentes e leva às restantes", async () => {
    invoices.splice(
      0,
      invoices.length,
      ...Array.from({ length: 6 }, (_, index) =>
        invoiceRow(`f-${index}`, `FT-0${index}`, "Propina", "2026-09-05", 45000, 0, "pending"),
      ),
    );
    await open({});
    await waitFor(() => expect(screen.getByText("FT-00 · Propina")).toBeDefined());
    expect(screen.queryByText("FT-05 · Propina")).toBeNull();
    expect(screen.getByRole("link", { name: "Ver as 6 faturas" })).toBeDefined();
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
    // Nem chega a pedir as faturas, que o servidor lhe recusaria.
    expect(listInvoicesSpy).not.toHaveBeenCalled();
  });
});

describe("/alunos/$studentId — botões de gestão", () => {
  // Alterar a foto, a turma, o estado, a matrícula, os dados, os encarregados ou a
  // presença passa pelo mesmo guarda do servidor: escrita em Pessoas.
  const buttons = [
    "Carregar nova foto de perfil",
    "Foto",
    "Biblioteca",
    "Editar ficha",
    "Estado",
    "Anular",
    "Associar",
    "Remover encarregado",
    "Registar",
  ];
  const visible = () => buttons.filter((name) => screen.queryByRole("button", { name }) !== null);

  it("a Secretaria vê os botões de gestão da ficha", async () => {
    await open({});
    expect(visible()).toEqual(buttons);
    expect(screen.getByRole("link", { name: "Criar turmas em Pedagógica" })).toBeDefined();
  });

  it("o encarregado vê a ficha sem os botões que o servidor lhe recusa", async () => {
    await open({}, "Encarregado");
    expect(screen.getByText("Dados pessoais")).toBeDefined();
    expect(screen.getByText("Joana Silva")).toBeDefined();
    expect(visible()).toEqual([]);
    expect(screen.queryByRole("link", { name: "Criar turmas em Pedagógica" })).toBeNull();
  });

  it("a Secretaria só com leitura em Pessoas também não os vê", async () => {
    await open({}, "Secretaria", { pessoas: "Leitura" });
    expect(visible()).toEqual([]);
  });

  it("a Tesouraria com escrita em Pessoas vê-os, como o servidor deixa", async () => {
    await open({}, "Tesouraria", { pessoas: "Escrita" });
    expect(visible()).toEqual(buttons);
  });
});

describe("/alunos/$studentId — Histórico", () => {
  it("mostra cada ano lectivo, o mais recente primeiro, com a média e a situação", async () => {
    history.years = twoYears;
    await open({ secao: "historico" });
    expect(screen.getByRole("heading", { level: 2, name: "Histórico" })).toBeDefined();
    const years = await screen.findAllByRole("heading", { level: 3 });
    expect(years.map((year) => year.textContent)).toEqual(["2026/2027", "2025/2026"]);
    const [current, previous] = screen.getAllByRole("listitem");
    // Sem resultado oficial, o cálculo das notas sai como provisório.
    expect(current?.textContent).toContain("10.ª Classe · Turma 10.ª A");
    expect(current?.textContent).toContain("14.2");
    expect(current?.textContent).toContain("PENDENTE(provisório)");
    // O resultado registado pela secretaria manda sobre o cálculo.
    expect(previous?.textContent).toContain("11.0");
    expect(previous?.textContent).toContain("TRANSITA");
    expect(previous?.textContent).not.toContain("provisório");
    expect(previous?.textContent).toContain("Disciplinas (2)");
    expect(screen.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual([
      "Matemática",
      "Matemática",
      "Física",
    ]);
    // Só o histórico: nem dados pessoais nem faturas.
    expect(screen.queryByText("Dados pessoais")).toBeNull();
    expect(screen.queryByText("Situação financeira")).toBeNull();
  });

  it("sem matrículas, diz que ainda não há histórico", async () => {
    await open({ secao: "historico" });
    expect(
      await screen.findByText("Ainda não há matrículas com histórico para este aluno."),
    ).toBeDefined();
  });

  it("o encarregado, a quem o servidor recusa o histórico, recebe a ficha completa", async () => {
    await open({ secao: "historico" }, "Encarregado");
    const notice = screen
      .getAllByRole("status")
      .find((element) => element.textContent?.includes("Sem acesso a «Histórico»"));
    expect(notice).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Histórico académico" })).toBeNull();
  });
});

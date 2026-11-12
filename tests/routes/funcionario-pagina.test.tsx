// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
  setRouteParams,
} from "./_harness";

/**
 * `/financeiro/rh/funcionarios` e `/financeiro/rh/funcionarios/<vínculo>` (SIGA
 * Context Engine, contexto RH): a lista dos funcionários e a ficha de cada um, como
 * o servidor as devolve.
 */

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock({ role: "Tesouraria" }),
);

const listHrEmployeesMock = vi.fn();
const getHrEmployeeDetailMock = vi.fn();
vi.mock("@/features/hr/server", () => ({
  listHrEmployees: () => listHrEmployeesMock(),
  getHrEmployeeDetail: (args: unknown) => getHrEmployeeDetailMock(args),
}));

const VINCULO = "55555555-5555-4555-8555-555555555555";
const PROFESSOR = "66666666-6666-4666-8666-666666666666";

const detail = {
  id: VINCULO,
  schoolId: "school-a",
  personName: "Rosa Mateus",
  employeeNumber: "F-012",
  position: "Professora",
  department: "Pedagógico",
  employmentType: "permanent",
  status: "active",
  hireDate: "2024-09-01",
  terminationDate: null,
  weeklyHours: 40,
  workLocation: null,
  teacherId: PROFESSOR,
  contracts: [
    {
      id: "c1",
      number: "2024/12",
      type: "permanent",
      salaryType: "monthly",
      baseSalaryKz: 250_000,
      hourlyRateKz: null,
      lessonHourRateKz: null,
      startsOn: "2024-09-01",
      endsOn: null,
      status: "active",
    },
  ],
  absences: [
    {
      id: "f1",
      date: "2026-10-02",
      type: "unjustified",
      durationMinutes: 480,
      reason: null,
      validationStatus: "pending",
    },
  ],
  payslips: [
    {
      id: "r1",
      payrollRunId: "folha-set",
      competenceYear: 2026,
      competenceMonth: 9,
      runStatus: "paid",
      grossKz: 250_000,
      deductionsKz: 20_000,
      netKz: 230_000,
    },
  ],
};

let ListPage: ComponentType;
let DetailPage: ComponentType;

beforeAll(async () => {
  ListPage = routeComponentOf(await import("@/routes/financeiro_.rh_.funcionarios"));
  DetailPage = routeComponentOf(
    await import("@/routes/financeiro_.rh_.funcionarios_.$employmentId"),
  );
}, 60_000);

afterEach(() => {
  cleanup();
  listHrEmployeesMock.mockReset();
  getHrEmployeeDetailMock.mockReset();
  resetRouteLocation();
  resetCurrentAccount();
});

function openDetail(role = "Tesouraria") {
  setRouteParams({ employmentId: VINCULO });
  setCurrentAccount({ role, roles: [role] });
  renderRoute(DetailPage);
}

describe("/financeiro/rh/funcionarios/<vínculo>", () => {
  it("mostra o vínculo, o contrato, as faltas e os recibos", async () => {
    getHrEmployeeDetailMock.mockResolvedValue(detail);
    openDetail();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Rosa Mateus" })).toBeDefined(),
    );
    expect(getHrEmployeeDetailMock).toHaveBeenCalledWith({ data: { employmentId: VINCULO } });
    expect(screen.getByText("Cargo").nextElementSibling?.textContent).toBe("Professora");
    const contracts = screen.getByRole("region", { name: "Contratos" });
    expect(contracts.textContent).toContain("Contrato 2024/12 · Mensal");
    expect(contracts.textContent).toMatch(/250[\s.]?000/);
    const absences = screen.getByRole("region", { name: "Faltas" });
    expect(absences.textContent).toContain("1 dia");
    expect(absences.textContent).toContain("Injustificada");
    expect(absences.textContent).toContain("1 falta por rever");
    const payslips = screen.getByRole("region", { name: "Recibos de vencimento" });
    expect(payslips.textContent).toContain("Setembro de 2026");
    expect(payslips.textContent).toContain("Paga");
    // A tesouraria não abre perfis de professores.
    expect(screen.queryByRole("link", { name: "Perfil do professor" })).toBeNull();
  });

  it("a administração vai da ficha ao perfil do professor", async () => {
    getHrEmployeeDetailMock.mockResolvedValue(detail);
    openDetail("Administrador");
    await waitFor(() => expect(screen.getByRole("region", { name: "Professor" })).toBeDefined());
    expect(screen.getByRole("link", { name: "Perfil do professor" })).toBeDefined();
  });

  it("sem contratos, faltas nem folhas, di-lo em cada secção", async () => {
    getHrEmployeeDetailMock.mockResolvedValue({
      ...detail,
      teacherId: null,
      contracts: [],
      absences: [],
      payslips: [],
    });
    openDetail();
    await waitFor(() => expect(screen.getByText("Sem faltas registadas.")).toBeDefined());
    expect(screen.getByText("Este funcionário ainda não tem contrato registado.")).toBeDefined();
    expect(
      screen.getByText("Este funcionário ainda não entrou numa folha salarial."),
    ).toBeDefined();
    expect(screen.getByText("Sem registo de professor.")).toBeDefined();
  });

  it("um vínculo que o servidor não devolve diz que não existe nesta escola", async () => {
    getHrEmployeeDetailMock.mockResolvedValue(null);
    openDetail();
    await waitFor(() => expect(screen.getByText("Funcionário não encontrado")).toBeDefined());
  });

  it("quem não abre o RH não faz o pedido", () => {
    openDetail("Secretaria");
    expect(screen.getByText("Sem acesso ao RH")).toBeDefined();
    expect(getHrEmployeeDetailMock).not.toHaveBeenCalled();
  });
});

describe("/financeiro/rh/funcionarios", () => {
  const rows = [
    {
      id: VINCULO,
      personName: "Rosa Mateus",
      employeeNumber: "F-012",
      position: "Professora",
      department: "Pedagógico",
      employmentType: "permanent",
      status: "active",
      hireDate: "2024-09-01",
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      personName: "Carlos Neto",
      employeeNumber: null,
      position: "Contabilista",
      department: null,
      employmentType: "fixed_term",
      status: "suspended",
      hireDate: null,
    },
  ];

  it("lista os funcionários com o cargo e o estado, e procura por nome ou cargo", async () => {
    listHrEmployeesMock.mockResolvedValue(rows);
    setCurrentAccount({ role: "Tesouraria", roles: ["Tesouraria"] });
    renderRoute(ListPage);
    await waitFor(() => expect(screen.getByText("Rosa Mateus")).toBeDefined());
    expect(screen.getByText("2 funcionários")).toBeDefined();
    expect(screen.getByText("N.º F-012 · Professora · Pedagógico · Efectivo")).toBeDefined();
    expect(screen.getByText("Suspenso")).toBeDefined();
    fireEvent.change(screen.getByRole("textbox", { name: "Procurar funcionários" }), {
      target: { value: "contab" },
    });
    expect(screen.queryByText("Rosa Mateus")).toBeNull();
    expect(screen.getByText("Carlos Neto")).toBeDefined();
    expect(screen.getByText("1 funcionário")).toBeDefined();
  });

  it("sem funcionários, leva à importação", async () => {
    listHrEmployeesMock.mockResolvedValue([]);
    renderRoute(ListPage);
    await waitFor(() => expect(screen.getByText("Ainda não há funcionários")).toBeDefined());
    expect(screen.getByRole("link", { name: "Importar funcionários" })).toBeDefined();
  });

  it("quem não abre o RH não pede a lista", () => {
    setCurrentAccount({ role: "Professor", roles: ["Professor"] });
    renderRoute(ListPage);
    expect(screen.getByText("Sem acesso ao RH")).toBeDefined();
    expect(listHrEmployeesMock).not.toHaveBeenCalled();
  });
});

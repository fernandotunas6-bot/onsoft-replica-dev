import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { App } from "../src/App";
import { ApiError } from "../src/services/api";
import { DemoGateway } from "../src/services/demo";
import type { Gateway, Workspace } from "../src/domain/model";
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  localStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("preserves first landing, four navigation actions and no school", () => {
  render(<App />);
  expect(screen.getByText("Como podemos ajudar?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Meu dia" })).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: /Seleccionar escola. Actual: Por seleccionar/,
    }),
  ).toBeTruthy();
});
it("completes attendance through school selector and service page", async () => {
  render(<App initialGateway={new DemoGateway("professor")} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Conta" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Meu dia" }));
  await screen.findByText("Professor de demonstração · professor");
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  fireEvent.click(screen.getByRole("button", { name: "Escola de teste A" }));
  fireEvent.click(screen.getByRole("button", { name: "Presenças" }));
  await screen.findByText("Aluno de teste 01");
  fireEvent.click(screen.getByRole("button", { name: "Confirmar chamada" }));
  await screen.findByText("Guardado no ambiente de teste.");
  expect(location.hash).toBe("#/presencas");
  fireEvent.click(screen.getByRole("button", { name: "Voltar a Meu dia" }));
  expect(screen.getByText("Meu dia", { selector: "h1" })).toBeTruthy();
});
it("renders user input as text without HTML execution", async () => {
  render(<App initialGateway={new DemoGateway("professor")} />);
  await waitFor(() => {});
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  await screen.findByRole("button", { name: "Escola de teste A" });
  fireEvent.click(screen.getByRole("button", { name: "Escola de teste A" }));
  fireEvent.change(screen.getByLabelText("Descreve o que pretendes fazer na escola"), {
    target: { value: "<img src=x onerror=alert(1)>" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Criar projecto local" }));
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  expect(document.querySelector(".name img")).toBeNull();
});
it("discards late school response after school switch", async () => {
  const demo = new DemoGateway("professor");
  let resolveA: (v: Workspace) => void = () => {};
  const gateway: Gateway = {
    session: () => demo.session(),
    workspace: (ctx) =>
      ctx.schoolId === "demo-a"
        ? new Promise((r) => {
            resolveA = r;
          })
        : demo.workspace(ctx),
    execute: () => Promise.resolve(),
    signOut: () => demo.signOut(),
  };
  render(<App initialGateway={gateway} />);
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  await screen.findByRole("button", { name: "Escola de teste A" });
  fireEvent.click(screen.getByRole("button", { name: "Escola de teste A" }));
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  fireEvent.click(screen.getByRole("button", { name: "Escola de teste B" }));
  const a = await demo.workspace({
    userId: "demo-teacher",
    schoolId: "demo-a",
    role: "professor",
  });
  a.lessons[0].topic = "Segredo escola A";
  resolveA(a);
  fireEvent.click(screen.getByRole("button", { name: "Meu dia" }));
  await screen.findByText("Escola de teste B", { selector: "h2" });
  expect(screen.queryByText("Segredo escola A")).toBeNull();
});
it("profile uses SIGA Plus brand, annual map and service footer links", async () => {
  render(<App initialGateway={new DemoGateway("professor", true)} />);
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  await screen.findByRole("button", { name: "Escola de teste A" });
  fireEvent.click(screen.getByRole("button", { name: "Escola de teste A" }));
  fireEvent.click(screen.getByRole("button", { name: "Conta" }));
  fireEvent.click(screen.getByRole("button", { name: "Perfil" }));
  await screen.findByText("Mapa de aulas no ano");
  expect(location.hash).toBe("#/perfil");
  expect(document.querySelector(".profile-cover")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Mapa de aulas" })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Mapa de aulas" }));
  expect(location.hash).toBe("#/calendario");
  expect(screen.getByText("Mapa de aulas", { selector: "h2" })).toBeTruthy();
});
it("full menu routes to dedicated services", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Conta" }));
  fireEvent.click(screen.getByRole("button", { name: "Menu de serviços" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelector(".full-menu")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Segurança" }));
  expect(location.hash).toBe("#/seguranca");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Segurança", { selector: "h1" })).toBeTruthy();
});
it("school chat opens contact and sends a message", async () => {
  render(<App initialGateway={new DemoGateway("aluno")} />);
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  await screen.findByRole("button", { name: "Escola de teste A" });
  fireEvent.click(screen.getByRole("button", { name: "Escola de teste A" }));
  fireEvent.click(screen.getByRole("button", { name: "Conversas" }));
  await screen.findByRole("button", { name: /Professor · Matemática/ });
  fireEvent.click(screen.getByRole("button", { name: /Professor · Matemática/ }));
  fireEvent.change(screen.getByLabelText("Mensagem"), {
    target: { value: "Dúvida de matemática" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  await screen.findByText("Dúvida de matemática", { selector: ".message-bubble p" });
});

const schoolId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
function institutionalGateway(role: "professor" | "aluno") {
  const catalog = {
    schoolId,
    role,
    classes: [
      {
        classSubjectId: "00000000-0000-4000-8000-000000000003",
        classGroupId: "00000000-0000-4000-8000-000000000004",
        academicYearId: "00000000-0000-4000-8000-000000000005",
        className: "Turma autorizada",
        subjectId: "00000000-0000-4000-8000-000000000006",
        subjectName: "Matemática institucional",
        teacher: {
          id: "00000000-0000-4000-8000-000000000007",
          name: "Professor autorizado",
          userId: role === "professor" ? userId : null,
        },
        students: [
          {
            studentId: "00000000-0000-4000-8000-000000000008",
            enrollmentId: "00000000-0000-4000-8000-000000000009",
            name: "Aluno autorizado",
            userId: role === "aluno" ? userId : null,
          },
        ],
      },
    ],
    timetable: [
      {
        slotId: "00000000-0000-4000-8000-000000000010",
        classSubjectId: "00000000-0000-4000-8000-000000000003",
        scheduleId: null,
        publication: "legacy" as const,
        validFrom: null,
        validTo: null,
        weekday: 7,
        startsAt: "08:00",
        endsAt: "09:00",
        room: null,
      },
    ],
    tasks: [
      {
        id: "00000000-0000-4000-8000-000000000011",
        classSubjectId: "00000000-0000-4000-8000-000000000003",
        slotId: null,
        kind: "tpc",
        title: "Trabalho publicado",
        instructions: null,
        due: null,
      },
    ],
  };
  const gateway: Gateway = {
    session: async () => ({
      userId,
      name: "Conta institucional",
      mode: "api",
      memberships: [
        {
          schoolId,
          schoolName: "Escola autorizada",
          roles: [role],
          permissions: ["academic.read"],
          active: true,
        },
      ],
    }),
    academicCatalog: vi.fn(async () => catalog),
    workspace: vi.fn(async () => {
      throw new Error("Full workspace must not be requested");
    }),
    execute: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  };
  return { gateway, catalog };
}
async function selectInstitutionalSchool() {
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Escola autorizada" }));
  fireEvent.click(screen.getByRole("button", { name: "Meu dia" }));
  await screen.findByText("1 períodos no horário semanal.");
}
it("teacher opens canonical roster, filters weekly slots and reads published tasks without requesting unfinished workspace", async () => {
  const { gateway } = institutionalGateway("professor");
  render(<App initialGateway={gateway} />);
  await selectInstitutionalSchool();
  fireEvent.click(screen.getByRole("button", { name: "Minhas turmas" }));
  await screen.findByText("Turma autorizada · Matemática institucional", { selector: "h2" });
  expect(screen.getByText("Aluno autorizado")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Pesquisar turma ou disciplina"), {
    target: { value: "inexistente" },
  });
  expect(screen.queryByText("Aluno autorizado")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Sem resultados");
  fireEvent.change(screen.getByLabelText("Pesquisar turma ou disciplina"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver horário" }));
  await screen.findByText(/Domingo · 08:00/);
  expect(screen.getByText("Sala não indicada.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Dia da semana"), { target: { value: "1" } });
  expect(screen.queryByText(/Domingo · 08:00/)).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Trabalhos" }));
  await screen.findByText("Trabalho publicado");
  expect(screen.getByText("Sem prazo indicado.")).toBeTruthy();
  expect(gateway.workspace).not.toHaveBeenCalled();
  expect(gateway.execute).not.toHaveBeenCalled();
});
it("student reads own disciplines and tasks; unintegrated grades show no empty results or write controls", async () => {
  const { gateway } = institutionalGateway("aluno");
  render(<App initialGateway={gateway} />);
  await selectInstitutionalSchool();
  fireEvent.click(screen.getByRole("button", { name: "Disciplinas" }));
  await screen.findByText("Matrícula activa nesta disciplina.");
  expect(screen.queryByText("Aluno autorizado")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ver trabalhos" }));
  await screen.findByText("Trabalho publicado");
  fireEvent.click(screen.getByRole("link", { name: "Notas" }));
  await screen.findByText("A consulta de notas ainda aguarda integração validada.");
  expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
  expect(gateway.workspace).not.toHaveBeenCalled();
  expect(gateway.execute).not.toHaveBeenCalled();
});
it("discards late institutional catalog after changing school", async () => {
  const { gateway, catalog } = institutionalGateway("professor");
  const nextSchool = "00000000-0000-4000-8000-000000000012";
  const session = await gateway.session();
  session!.memberships.push({
    ...session!.memberships[0],
    schoolId: nextSchool,
    schoolName: "Outra escola autorizada",
  });
  gateway.session = async () => session;
  let resolveFirst: (c: typeof catalog) => void = () => {};
  gateway.academicCatalog = async (ctx) =>
    ctx.schoolId === schoolId
      ? new Promise((r) => {
          resolveFirst = r;
        })
      : { ...catalog, schoolId: nextSchool, classes: [], timetable: [], tasks: [] };
  render(<App initialGateway={gateway} />);
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Escola autorizada" }));
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  fireEvent.click(screen.getByRole("button", { name: "Outra escola autorizada" }));
  resolveFirst(catalog);
  fireEvent.click(screen.getByRole("button", { name: "Meu dia" }));
  await screen.findByText("0 períodos no horário semanal.");
  fireEvent.click(screen.getByRole("button", { name: "Minhas turmas" }));
  await screen.findByText("Sem resultados para os filtros seleccionados.");
  expect(screen.queryByText("Aluno autorizado")).toBeNull();
});

it("keeps the authentication rejection visible while clearing the institutional school context", async () => {
  const { gateway } = institutionalGateway("professor");
  gateway.academicCatalog = async () => {
    throw new ApiError(403, "O acesso a esta escola foi revogado.");
  };
  render(<App initialGateway={gateway} />);
  fireEvent.click(screen.getByRole("button", { name: /Seleccionar escola. Actual/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Escola autorizada" }));
  await screen.findByText("O acesso a esta escola foi revogado.");
  expect(
    screen.getByRole("button", { name: "Seleccionar escola. Actual: Por seleccionar" }),
  ).toBeTruthy();
  expect(screen.queryByText("Aluno autorizado")).toBeNull();
  expect(gateway.execute).not.toHaveBeenCalled();
});

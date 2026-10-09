import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { App } from "../src/App";
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

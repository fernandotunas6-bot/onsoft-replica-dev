/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The school website uses native browser modules.
import { setupStudentPortal } from "../../painel/escolas/src/student-portal.mjs";
afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
  history.replaceState(null, "", "/");
});
describe("portal original e dados privados", () => {
  it("mantém a demonstração acessível e encaminha a conta institucional para a vista de estudante", () => {
    document.body.className = "portal-body";
    document.body.innerHTML =
      '<div class="demo-strip"></div><div class="sidebar-bottom"><a href="/signout-with-chatgpt">Sair</a></div>';
    setupStudentPortal({ portalUrl: "https://siga.example/portal?escola=a" });
    expect(document.querySelector(".demo-strip a")?.getAttribute("href")).toBe(
      "https://siga.example/portal?escola=a&vista=estudante",
    );
    expect(document.querySelector(".sidebar-bottom a")?.getAttribute("href")).toBe("/login/");
  });
  it("elimina os dados de exemplo antes de pedir dados e rejeita respostas de outra origem/escola/janela", () => {
    history.replaceState(null, "", "/portal/?connected=1");
    document.body.className = "portal-body";
    document.body.innerHTML =
      '<main>Joana Exemplo · 15,5</main><div class="sidebar-profile">Joana Exemplo</div><div class="demo-strip">Exemplo</div>';
    const listeners = new Map<string, (event: MessageEvent) => void>(),
      parent = { postMessage: vi.fn() };
    const win = {
      parent,
      location: { origin: location.origin },
      crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789012" },
      setTimeout: () => 0,
      addEventListener: (name: string, listener: (event: MessageEvent) => void) =>
        listeners.set(name, listener),
      removeEventListener: vi.fn(),
    };
    const dispose = setupStudentPortal(
      { schoolSlug: "a", portalUrl: "https://siga.example/portal?escola=a" },
      { connected: true, win },
    );
    expect(document.body.textContent).not.toMatch(/Joana|15,5/);
    expect(parent.postMessage).toHaveBeenCalled();
    const value = {
      type: "siga-student-response",
      version: 1,
      requestId: "12345678-1234-1234-1234-123456789012",
      schoolSlug: "a",
      section: "",
      ok: true,
      data: {
        name: "Ana <img src=x>",
        schoolName: "A",
        yearLabel: "2026",
        agenda: { upcomingAssessments: [] },
      },
    };
    listeners.get("message")!({
      source: parent,
      origin: "https://other.example",
      data: value,
    } as unknown as MessageEvent);
    expect(document.body.textContent).not.toContain("Ana");
    listeners.get("message")!({
      source: parent,
      origin: location.origin,
      data: { ...value, schoolSlug: "b" },
    } as unknown as MessageEvent);
    expect(document.body.textContent).not.toContain("Ana");
    listeners.get("message")!({
      source: parent,
      origin: location.origin,
      data: value,
    } as unknown as MessageEvent);
    expect(document.body.textContent).toContain("Ana");
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).not.toContain("15,5");
    dispose();
  });
});

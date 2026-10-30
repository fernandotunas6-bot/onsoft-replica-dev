// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModalSidebar } from "@/components/ui/modal-system/ModalSidebar";
import { Tabs, TabsContent, TabsList, TabsPanels, TabsTrigger } from "@/components/ui/tabs";

afterEach(cleanup);

function Workspace() {
  return (
    <Tabs layout="sidebar" defaultValue="classes">
      <TabsList aria-label="Secções académicas">
        <TabsTrigger value="classes">Turmas</TabsTrigger>
        <TabsTrigger value="hidden" disabled>
          Indisponível
        </TabsTrigger>
        <TabsTrigger value="grades">Notas</TabsTrigger>
      </TabsList>
      <TabsPanels>
        <TabsContent value="classes">Lista de turmas</TabsContent>
        <TabsContent value="grades">
          <Tabs defaultValue="term">
            <TabsList aria-label="Período">
              <TabsTrigger value="term">Trimestral</TabsTrigger>
              <TabsTrigger value="year">Anual</TabsTrigger>
            </TabsList>
            <TabsContent value="term">Pauta trimestral</TabsContent>
            <TabsContent value="year">Pauta anual</TabsContent>
          </Tabs>
        </TabsContent>
      </TabsPanels>
    </Tabs>
  );
}

describe("Navegação vertical das secções", () => {
  it("liga cada botão ao painel e preserva separadores compactos dentro da página", () => {
    render(<Workspace />);
    const list = screen.getByRole("tablist", { name: "Secções académicas" });
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Notas" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("tabpanel", { name: "Notas" }).textContent).toContain(
      "Pauta trimestral",
    );
    expect(screen.queryByText("Lista de turmas")).toBeNull();
    expect(screen.getByRole("tablist", { name: "Período" }).getAttribute("aria-orientation")).toBe(
      "horizontal",
    );
    expect(screen.getByRole("tab", { name: "Notas" }).getAttribute("aria-controls")).toBe(
      screen.getByRole("tabpanel", { name: "Notas" }).id,
    );
  });

  it("usa as setas verticais, salta destinos desactivados e revela o destino focado", async () => {
    render(<Workspace />);
    const first = screen.getByRole("tab", { name: "Turmas" });
    const next = screen.getByRole("tab", { name: "Notas" });
    const reveal = vi.fn();
    next.scrollIntoView = reveal;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(next));
    expect(reveal).not.toHaveBeenCalled();
    expect(next.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(next, { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(first));
  });
});

describe("Revelação do destino externo", () => {
  it("desloca apenas o menu quando a secção muda sem foco e preserva o ref público", async () => {
    const { createRef } = await import("react");
    const ref = createRef<HTMLDivElement>();
    const view = (value: string) => (
      <Tabs layout="sidebar" value={value}>
        <TabsList ref={ref} aria-label="Menu longo">
          <TabsTrigger value="first">Primeira</TabsTrigger>
          <TabsTrigger value="last">Última</TabsTrigger>
        </TabsList>
        <TabsPanels>
          <TabsContent value="first">Primeiro painel</TabsContent>
          <TabsContent value="last">Último painel</TabsContent>
        </TabsPanels>
      </Tabs>
    );
    const { rerender } = render(view("first"));
    const list = screen.getByRole("tablist", { name: "Menu longo" });
    expect(ref.current).toBe(list);
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 100 });
    list.getBoundingClientRect = () => ({ top: 100, bottom: 200 }) as DOMRect;
    const last = screen.getByRole("tab", { name: "Última" });
    last.getBoundingClientRect = () => ({ top: 230, bottom: 270 }) as DOMRect;
    const documentScroll = document.documentElement.scrollTop;
    rerender(view("last"));
    await waitFor(() => expect(list.scrollTop).toBe(70));
    expect(document.documentElement.scrollTop).toBe(documentScroll);
    expect(document.activeElement).not.toBe(last);
  });
});

it("preserva a navegação vertical da ficha de Pessoas com o menu partilhado", async () => {
  render(
    <Tabs orientation="vertical" defaultValue="dados">
      <ModalSidebar
        items={[
          { value: "dados", label: "Dados pessoais" },
          { value: "historico", label: "Histórico" },
        ]}
      />
      <TabsContent value="dados">Ficha</TabsContent>
      <TabsContent value="historico">Histórico da pessoa</TabsContent>
    </Tabs>,
  );
  const list = screen.getByRole("tablist", { name: "Secções da ficha" });
  expect(list.getAttribute("aria-orientation")).toBe("vertical");
  const first = screen.getByRole("tab", { name: "Dados pessoais" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowDown" });
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Histórico" }).getAttribute("aria-selected")).toBe(
      "true",
    ),
  );
  expect(screen.getByRole("tabpanel", { name: "Histórico" }).textContent).toBe(
    "Histórico da pessoa",
  );
});

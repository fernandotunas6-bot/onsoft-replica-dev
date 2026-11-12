// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

afterEach(cleanup);

describe("navegação entre secções", () => {
  it("salta separadores indisponíveis e activa o conteúdo pelo teclado", async () => {
    render(
      <Tabs defaultValue="turmas">
        <TabsList aria-label="Secções académicas">
          <TabsTrigger value="turmas">Turmas</TabsTrigger>
          <TabsTrigger value="notas" disabled>
            Notas
          </TabsTrigger>
          <TabsTrigger value="horarios">Horários</TabsTrigger>
        </TabsList>
        <TabsContent value="turmas">Lista de turmas</TabsContent>
        <TabsContent value="notas">Notas indisponíveis</TabsContent>
        <TabsContent value="horarios">Horários das turmas</TabsContent>
      </Tabs>,
    );
    const first = screen.getByRole("tab", { name: "Turmas" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Horários" }).getAttribute("aria-selected")).toBe(
        "true",
      );
    });
    expect(screen.getByRole("tabpanel").textContent).toBe("Horários das turmas");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    await waitFor(() => expect(first.getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("tabpanel").textContent).toBe("Lista de turmas");
  });

  it("identifica a página actual sem a apresentar como um link sem destino", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/portal">Início</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>Turmas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("href")).toBe("/portal");
    expect(screen.getByText("Turmas").getAttribute("aria-current")).toBe("page");
  });
});

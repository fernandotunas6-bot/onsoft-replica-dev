import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

describe("paginação institucional", () => {
  it("usa rótulos legíveis em português sem modificar os links", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Pagination,
        null,
        React.createElement(PaginationPrevious, { href: "/alunos?page=1" }),
        React.createElement(PaginationNext, { href: "/alunos?page=3" }),
        React.createElement(PaginationEllipsis),
      ),
    );
    expect(html).toContain('aria-label="Paginação"');
    expect(html).toContain('aria-label="Ir para a página anterior"');
    expect(html).toContain('aria-label="Ir para a página seguinte"');
    expect(html).toContain("Anterior");
    expect(html).toContain("Seguinte");
    expect(html).toContain("Mais páginas");
    expect(html).toContain('href="/alunos?page=1"');
    expect(html).toContain('href="/alunos?page=3"');
  });

  it("mantém a listagem de páginas deslocável em ecrãs estreitos", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Pagination,
        null,
        React.createElement(PaginationContent, null, React.createElement(PaginationEllipsis)),
      ),
    );
    expect(html).toContain("max-w-full");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("overscroll-x-contain");
  });

  it("anuncia a existência de mais páginas sem ler o ícone", () => {
    const html = renderToStaticMarkup(React.createElement(PaginationEllipsis));
    expect(html).not.toMatch(/<span[^>]*aria-hidden/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain("Mais páginas");
  });

  it("mantém o rótulo acessível personalizado pelos módulos consumidores", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaginationPrevious, {
        href: "/pautas?page=2",
        "aria-label": "Voltar à página de pautas anterior",
      }),
    );
    expect(html).toContain('aria-label="Voltar à página de pautas anterior"');
    expect(html).toContain('href="/pautas?page=2"');
  });
});

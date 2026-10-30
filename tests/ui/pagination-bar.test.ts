import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ListPaginationBar } from "@/components/filters/ListPaginationBar";

describe("ListPaginationBar", () => {
  it("should render correct showing interval and total counts", () => {
    const html = renderToString(
      React.createElement(ListPaginationBar, {
        page: 2,
        pageSize: 25,
        totalItems: 100,
        onPageChange: vi.fn(),
      }),
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, "");

    expect(cleanHtml).toContain("26–50");
    expect(cleanHtml).toContain("100");
    expect(cleanHtml).toContain("2 / 4");
  });

  it("should return null if total items <= pageSize and no onPageSizeChange", () => {
    const html = renderToString(
      React.createElement(ListPaginationBar, {
        page: 1,
        pageSize: 50,
        totalItems: 30,
        onPageChange: vi.fn(),
      }),
    );

    expect(html).toBe("");
  });

  it("should render selector if onPageSizeChange provided", () => {
    const html = renderToString(
      React.createElement(ListPaginationBar, {
        page: 1,
        pageSize: 10,
        totalItems: 10,
        onPageChange: vi.fn(),
        onPageSizeChange: vi.fn(),
      }),
    );
    const cleanHtml = html.replace(/<!--.*?-->/g, "");

    expect(cleanHtml).toContain("Por página:");
    expect(cleanHtml).toContain("1–10");
  });

  it("anuncia a contagem como região de estado (SC 4.1.3)", () => {
    // A contagem muda ao filtrar, pesquisar e paginar sem que o foco se mova.
    // Sem role="status" nenhum leitor de ecrã diz que a lista mudou.
    const html = renderToString(
      React.createElement(ListPaginationBar, {
        page: 1,
        pageSize: 25,
        totalItems: 100,
        onPageChange: vi.fn(),
      }),
    );

    expect(html).toMatch(/<span[^>]*role="status"[^>]*>/);
    expect(html).toMatch(/<span[^>]*aria-atomic="true"[^>]*>/);
    // a região anunciada tem de conter a frase inteira, não só o número
    const regiao = html.match(/<span[^>]*role="status"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "";
    expect(regiao).toContain("Mostrando");
    expect(regiao).toContain("100");
  });
});

import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListFilterBar } from "@/components/filters/ListFilterBar";

/**
 * Filtrar troca a lista sem mover o foco. Sem região anunciada, quem usa leitor
 * de ecrã não tem como saber que o conjunto mudou — e em 11 dos 14 ecrãs com
 * filtro não existe sequer contagem visível a que se agarrar.
 *
 * A região é invisível por desenho: anunciar não pode acrescentar interface.
 */

const base = {
  fields: [{ name: "q", type: "search" as const, label: "Pesquisar" }],
  values: { q: "" },
  onChange: vi.fn(),
  onReset: vi.fn(),
  activeCount: 0,
};

const regiao = (html: string) =>
  html.match(/<span[^>]*role="status"[^>]*>([\s\S]*?)<\/span>/)?.[0] ?? "";

describe("ListFilterBar — anúncio de resultados", () => {
  it("não anuncia nada quando o ecrã não fornece contagem", () => {
    const html = renderToString(React.createElement(ListFilterBar, base));
    expect(html).not.toContain('role="status"');
  });

  it("anuncia a contagem numa região invisível quando é fornecida", () => {
    const html = renderToString(React.createElement(ListFilterBar, { ...base, resultCount: 23 }));
    const r = regiao(html);
    expect(r, "região de estado ausente").toBeTruthy();
    expect(r).toContain('aria-live="polite"');
    expect(r).toContain('aria-atomic="true"');
    expect(r).toContain("sr-only");
    expect(r.replace(/<[^>]+>/g, "")).toMatch(/23\s*resultados/);
  });

  it("concorda o singular e aceita outro substantivo", () => {
    const um = renderToString(React.createElement(ListFilterBar, { ...base, resultCount: 1 }));
    expect(regiao(um).replace(/<[^>]+>/g, "")).toMatch(/1\s*resultado(?!s)/);

    const zero = renderToString(
      React.createElement(ListFilterBar, {
        ...base,
        resultCount: 0,
        resultNoun: "documento",
      }),
    );
    expect(regiao(zero).replace(/<[^>]+>/g, "")).toMatch(/0\s*documentos/);
  });

  it("a região não desenha nada visível", () => {
    const html = renderToString(React.createElement(ListFilterBar, { ...base, resultCount: 5 }));
    // sr-only é o único mecanismo: nada de texto visível acrescentado
    expect(regiao(html)).toContain('class="sr-only"');
  });

  it("aceita plural irregular — «comunicação» não vira «comunicaçãos»", () => {
    const html = renderToString(
      React.createElement(ListFilterBar, {
        ...base,
        resultCount: 4,
        resultNoun: "comunicação",
        resultNounPlural: "comunicações",
      }),
    );
    const texto = regiao(html).replace(/<[^>]+>/g, "");
    expect(texto).toMatch(/4\s*comunicações/);
    expect(texto).not.toContain("comunicaçãos");
  });
});

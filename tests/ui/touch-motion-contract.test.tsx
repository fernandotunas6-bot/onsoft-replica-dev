// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { DebouncedSearchInput, SEARCH_DEBOUNCE_MS } from "@/components/filters/debounced-search-input";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("interacção dos componentes partilhados", () => {
  it("dá ao fecho do diálogo uma área de toque de 44px sem ampliar o ícone", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Editar aluno</DialogTitle>
          <DialogDescription>Actualizar os dados de matrícula</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(close.className).toContain("size-11");
    expect(close.className).toContain("focus-visible:ring-2");
    expect(close.querySelector("svg")?.classList.contains("h-4")).toBe(true);
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mantém fecho do painel acessível e anima apenas quando há movimento permitido", () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetTitle>Navegação</SheetTitle>
          <SheetDescription>Opções da escola activa</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog", { name: "Navegação" });
    expect(panel.className).toContain("motion-safe:data-[state=open]:duration-200");
    expect(panel.className).toContain("motion-reduce:transition-none");
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(close.className).toContain("size-11");
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("pesquisa sem atrasos artificiais durante a composição", () => {
  it("não envia pedidos incompletos de um teclado IME", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <DebouncedSearchInput
        field={{ name: "q", label: "Pesquisar aluno" }}
        value=""
        onChange={onChange}
      />,
    );
    const search = screen.getByRole("textbox", { name: "Pesquisar aluno" });
    fireEvent.compositionStart(search);
    fireEvent.change(search, { target: { value: "学生" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 50));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.compositionEnd(search);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("q", "学生");
  });

  it("preserva a pesquisa normal com o debounce existente", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <DebouncedSearchInput
        field={{ name: "q", label: "Pesquisar" }}
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Pesquisar" }), {
      target: { value: "Ana" },
    });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("q", "Ana");
  });
});

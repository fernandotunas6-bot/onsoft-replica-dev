// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { InlineLoading } from "@/components/ui/inline-loading";
import { PageLoading } from "@/components/ui/page-loading";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ModalFooter } from "@/components/ui/modal-system/ModalFooter";
import { SaveBar } from "@/components/mobile/SaveBar";
import { MobileErrorState } from "@/components/mobile/states";

afterEach(() => {
  act(() => toast.dismiss());
  cleanup();
});

describe("feedback nos contextos do SIGA", () => {
  it("bloqueia nova submissão durante o processo e mantém o nome do botão", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(
      button.querySelector('svg[data-feedback-state="processing"]')?.getAttribute("aria-hidden"),
    ).toBe("true");
    rerender(<Button onClick={onClick}>Guardar</Button>);
    expect(button.querySelector("svg")).toBeNull();
    expect(button.hasAttribute("aria-busy")).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("o modal tem um só indicador e não permite cancelar enquanto guarda", () => {
    render(<ModalFooter onSubmit={() => {}} onCancel={() => {}} isSubmitting />);
    const submit = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.querySelectorAll("svg")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("a gravação automática troca o processo pela confirmação sem perder o texto", () => {
    const { rerender } = render(<SaveBar onSave={() => {}} autosaveState="saving" saving />);
    expect(screen.getByRole("status").textContent).toContain("A guardar");
    rerender(<SaveBar onSave={() => {}} autosaveState="saved" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Guardado");
    expect(status.querySelector('svg[data-feedback-state="success"]')).toBeTruthy();
    expect(status.querySelector('svg[data-feedback-state="processing"]')).toBeNull();
  });

  it.each(["approved", "rejected", "failed", "processing", "paid"])(
    "o estado guardado %s tem rótulo e ícone estático",
    (status) => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByRole("status");
      expect(badge.textContent).toBeTruthy();
      expect(badge.querySelector("svg")?.getAttribute("data-feedback-motion")).toBe("off");
    },
  );

  it("um estado desconhecido e a opção sem ícone continuam legíveis", () => {
    const { rerender } = render(<StatusBadge status="estado externo" />);
    expect(screen.getByRole("status").textContent).toBe("estado externo");
    rerender(<StatusBadge status="approved" showIcon={false} />);
    expect(screen.getByRole("status").textContent).toBe("Aprovado");
    expect(screen.getByRole("status").querySelector("svg")).toBeNull();
  });

  it("os três contextos de carregamento anunciam a operação", () => {
    render(
      <>
        <InlineLoading label="A consultar propinas…" />
        <PageLoading message="A abrir alunos…" />
        <LoadingSpinner />
      </>,
    );
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.getByText("A consultar propinas…")).toBeTruthy();
    expect(screen.getByText("A abrir alunos…")).toBeTruthy();
    expect(screen.getByText("A carregar…")).toBeTruthy();
  });

  it("o erro mantém a explicação e a acção de recuperação", () => {
    const retry = vi.fn();
    render(<MobileErrorState what="as turmas" onRetry={retry} />);
    expect(screen.getByText("Não foi possível carregar as turmas.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it.each(["success", "error", "warning", "info"] as const)(
    "as mensagens globais de %s usam o SVG partilhado",
    async (state) => {
      render(<Toaster />);
      act(() => {
        toast[state](`Resultado ${state}`);
      });
      const message = await screen.findByText(`Resultado ${state}`);
      expect(
        message
          .closest("[data-sonner-toast]")
          ?.querySelector(`svg[data-feedback-state="${state}"]`),
      ).toBeTruthy();
    },
  );

  it.each(["success", "error"] as const)(
    "uma mensagem de processamento passa a %s sem manter o spinner visível",
    async (result) => {
      render(<Toaster />);
      let id: string | number = "";
      act(() => {
        id = toast.loading("A processar pedido");
      });
      const loading = await screen.findByText("A processar pedido");
      expect(
        loading
          .closest("[data-sonner-toast]")
          ?.querySelector('svg[data-feedback-state="processing"]'),
      ).toBeTruthy();
      act(() => {
        toast[result]("Pedido terminado", { id });
      });
      await waitFor(() => {
        const item = screen.getByText("Pedido terminado").closest("[data-sonner-toast]");
        expect(item?.getAttribute("data-type")).toBe(result);
        expect(item?.querySelector(`svg[data-feedback-state="${result}"]`)).toBeTruthy();
        expect(item?.querySelector('.sonner-loader[data-visible="true"]')).toBeNull();
      });
    },
  );

  it("respeita um ícone específico fornecido pelo contexto", async () => {
    render(<Toaster icons={{ warning: <span data-testid="custom-icon">!</span> }} />);
    act(() => {
      toast.warning("Aviso específico");
    });
    expect(await screen.findByTestId("custom-icon")).toBeTruthy();
  });
});

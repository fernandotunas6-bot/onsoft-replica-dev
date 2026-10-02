/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuickFormModal } from "@/components/modals/QuickFormModal";

vi.mock("@/components/forms/AngolaIdentityField", () => ({ AngolaIdentityField: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(cleanup);

function openForm(onSubmit: (values: Record<string, string>) => Promise<void>) {
  render(
    <QuickFormModal
      title="Criar período"
      fields={[{ name: "nome", label: "Nome" }]}
      trigger={(open) => <button onClick={open}>Abrir</button>}
      onSubmit={onSubmit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  return screen.getByRole("textbox", { name: "Nome" }) as HTMLInputElement;
}

describe("Formulário rápido", () => {
  it("associa Guardar ao formulário e respeita a validação nativa", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const input = openForm(save);
    const button = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(button.form).toBe(input.form);
    expect(button.form).not.toBeNull();
    fireEvent.click(button);
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "  Primeiro trimestre  " } });
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledWith({ nome: "Primeiro trimestre" }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("a submissão do formulário funciona sem clicar no rodapé e evita pedidos simultâneos", async () => {
    let finish!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const input = openForm(save);
    fireEvent.change(input, { target: { value: "Primeiro trimestre" } });
    fireEvent.submit(input.form!);
    fireEvent.submit(input.form!);
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("preserva os dados após falha e permite repetir", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Falha temporária"))
      .mockResolvedValueOnce(undefined);
    const input = openForm(save);
    fireEvent.change(input, { target: { value: "Primeiro trimestre" } });
    fireEvent.submit(input.form!);
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(input.value).toBe("Primeiro trimestre");
    fireEvent.submit(input.form!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(save).toHaveBeenCalledTimes(2);
  });
});

/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ load: vi.fn(), submit: vi.fn() }));
vi.mock("@/features/enrollment/server", () => ({
  getPublicEnrollmentForm: api.load,
  submitPublicEnrollment: api.submit,
}));
vi.mock("@/components/workflows/EducationWorkflowVisual", () => ({
  EducationWorkflowVisual: () => <div>Orientação académica</div>,
}));
vi.mock("@/features/documents/print-issue-loader", () => ({ printBundledTemplate: vi.fn() }));
import { PublicEnrollmentForm } from "@/routes/matricula/$slug";

beforeEach(() => {
  vi.clearAllMocks();
  api.load.mockResolvedValue({
    title: "Candidatura",
    school_name: "ISPAB",
    visible_fields: ["email"],
    programs: [],
    admissionFeeAmount: 24000,
  });
});
afterEach(cleanup);
const mount = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PublicEnrollmentForm slug="ispab-2026" />
    </QueryClientProvider>,
  );
describe("envio público com revisão", () => {
  it("não envia ao rever, preserva dados ao corrigir e só confirma após resposta do servidor", async () => {
    let finish!: (value: unknown) => void;
    api.submit.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    fireEvent.change(await screen.findByLabelText("Nome completo"), {
      target: { value: "Ana Exemplo" },
    });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Rever candidatura" }));
    expect(api.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Confirme a sua candidatura" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir dados" }));
    expect((screen.getByLabelText("Nome completo") as HTMLInputElement).value).toBe("Ana Exemplo");
    fireEvent.click(screen.getByRole("button", { name: "Rever candidatura" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e enviar" }));
    fireEvent.submit(screen.getByRole("button", { name: "A enviar…" }).closest("form")!);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Candidatura enviada" })).toBeNull();
    expect(api.submit.mock.calls[0][0].data).toMatchObject({
      slug: "ispab-2026",
      person: { full_name: "Ana Exemplo", email: "ana@example.invalid" },
    });
    expect(api.submit.mock.calls[0][0].data).not.toHaveProperty("admissionFeeAmount");
    await act(async () => {
      finish({ ok: true, processNumber: "CAND-20261021-ABCDEF" });
    });
    expect(await screen.findByRole("heading", { name: "Candidatura enviada" })).toBe(
      document.activeElement,
    );
    expect(screen.getByText(/CAND-20261021-ABCDEF/)).toBeTruthy();
    expect(screen.getByText(/nenhum pagamento foi efectuado/)).toBeTruthy();
  });
  it("conserva a revisão quando o servidor rejeita o envio", async () => {
    api.submit.mockRejectedValue(Error("Campanha encerrada."));
    mount();
    fireEvent.change(await screen.findByLabelText("Nome completo"), {
      target: { value: "Ana Exemplo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rever candidatura" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e enviar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Candidatura enviada" })).toBeNull();
    expect(screen.getByRole("button", { name: "Corrigir dados" })).toBeTruthy();
  });
});

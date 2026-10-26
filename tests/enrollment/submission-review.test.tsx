/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EnrollmentSubmissionReview } from "@/features/enrollment/EnrollmentSubmissionReview";

afterEach(cleanup);
const reviewData = () => {
  const data = new FormData();
  data.set("full_name", "Ana Exemplo");
  data.set("email", "ana@example.invalid");
  data.set("desired_program", "private-program-id");
  data.set("notes", '<script>alert("unsafe")</script>');
  return data;
};
describe("revisão antes do envio oficial", () => {
  it("exige confirmação, apresenta curso e taxa, permite corrigir e não interpreta os dados como HTML", () => {
    const onConfirm = vi.fn(),
      onBack = vi.fn();
    const { container, rerender } = render(
      <EnrollmentSubmissionReview
        data={reviewData()}
        programName="Enfermagem"
        fee={24000}
        busy={false}
        error={null}
        onBack={onBack}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("heading").textContent).toBe("Confirme a sua candidatura");
    expect(document.activeElement).toBe(screen.getByRole("heading"));
    expect(screen.getByText("Enfermagem")).toBeTruthy();
    expect(container.textContent).not.toContain("private-program-id");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toMatch(/24\D000 Kz/);
    const button = screen.getByRole("button", { name: "Confirmar e enviar" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Corrigir dados" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender(
      <EnrollmentSubmissionReview
        data={reviewData()}
        busy={true}
        error={null}
        onBack={onBack}
        onConfirm={onConfirm}
      />,
    );
    expect((screen.getByRole("button", { name: "A enviar…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("A confirmar pela escola")).toBeTruthy();
  });
  it("torna um erro visível e não anuncia matrícula ou pagamento concluído", () => {
    render(
      <EnrollmentSubmissionReview
        data={reviewData()}
        fee={0}
        busy={false}
        error="Não foi possível enviar."
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Não foi possível enviar.");
    expect(screen.getByText("0 Kz")).toBeTruthy();
    expect(screen.getByText(/pagamento online ainda não está disponível/)).toBeTruthy();
  });
});

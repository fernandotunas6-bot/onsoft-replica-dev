// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PageActionMenu } from "@/components/layout/PageActionMenu";
afterEach(cleanup);
function DraftAction() {
  const [value, setValue] = useState("");
  return <input aria-label="Rascunho" value={value} onChange={(e) => setValue(e.target.value)} />;
}
describe("acções ocasionais", () => {
  it("conserva callbacks, destinos e controlos desactivados", () => {
    const exportFile = vi.fn();
    render(
      <PageActionMenu>
        <button onClick={exportFile}>Exportar</button>
        <a href="/relatorios/financeiros">Relatório</a>
        <button disabled>Anular</button>
      </PageActionMenu>,
    );
    fireEvent.click(screen.getByText("Mais opções"));
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(exportFile).toHaveBeenCalledOnce();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/relatorios/financeiros");
    expect(screen.getByRole("button", { name: "Anular" }).hasAttribute("disabled")).toBe(true);
  });
  it("preserva rascunhos ao recolher e reabrir e fecha por Escape", () => {
    const view = render(
      <PageActionMenu>
        <DraftAction />
      </PageActionMenu>,
    );
    const summary = screen.getByText("Mais opções");
    fireEvent.click(summary);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Conservar" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(view.container.querySelector("details")?.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    fireEvent.click(summary);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Conservar");
  });
});

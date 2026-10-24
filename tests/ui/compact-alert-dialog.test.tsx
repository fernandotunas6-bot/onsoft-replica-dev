// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

afterEach(cleanup);

describe("confirmações Radix compactas", () => {
  it("preserva semântica e contraste da confirmação destrutiva", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar registo?</AlertDialogTitle>
            <AlertDialogDescription>A operação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Eliminar registo?" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("shadow-sm");
    expect(dialog.className).not.toContain("zoom-in-95");
    expect(screen.getByText("A operação não pode ser desfeita.")).toBeTruthy();
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    const footer = confirm.parentElement!;
    expect(footer).toBe(cancel.parentElement);
    expect(footer.className).toContain("[&>button]:min-h-11");
    expect(footer.className).toContain("sm:[&>button]:min-h-9");
  });
});

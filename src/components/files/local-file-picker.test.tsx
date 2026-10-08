import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocalFilePicker } from "@/components/files/local-file-picker";

describe("LocalFilePicker", () => {
  it("opens the native input when clicked", () => {
    const { container } = render(<LocalFilePicker onSelect={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Escolher ficheiro" }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("passes selected files to callback", async () => {
    const onSelect = vi.fn();
    const { container } = render(<LocalFilePicker onSelect={onSelect} multiple />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [new File(["abc"], "a.txt", { type: "text/plain" }), new File(["def"], "b.txt")];
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(files));
  });

  it("rejects oversized files before calling onSelect", async () => {
    const onSelect = vi.fn();
    const onError = vi.fn();
    const { container } = render(<LocalFilePicker onSelect={onSelect} onError={onError} maxBytes={2} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["abc"], "large.txt")] } });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("reports callback errors", async () => {
    const onError = vi.fn();
    const { container } = render(<LocalFilePicker onSelect={async () => { throw new Error("Falha de rede"); }} onError={onError} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["abc"], "a.txt")] } });
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Falha de rede"));
  });
});

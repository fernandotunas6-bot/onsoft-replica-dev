// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, toastError } = vi.hoisted(() => ({
  invoke: vi.fn(async () => "/home/ana/Documentos/alunos.csv"),
  toastError: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

import {
  MAX_SAVE_BYTES,
  fileNameFromAnchor,
  installDesktopDownloads,
  saveBlobNative,
} from "@/lib/desktop-downloads";
import { exportCsv } from "@/lib/export-csv";

describe("desktop — exportações pelo diálogo nativo", () => {
  let uninstall: () => void;
  beforeEach(() => {
    invoke.mockClear();
    toastError.mockClear();
    // O Blob do jsdom não tem arrayBuffer() (os webviews têm).
    Blob.prototype.arrayBuffer ??= function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(this);
      });
    };
    // jsdom não implementa os URLs de blob.
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:http://localhost/${++n}`);
    URL.revokeObjectURL = vi.fn();
    uninstall = installDesktopDownloads();
  });
  afterEach(() => uninstall());

  it("o CSV do SIGA chega ao save_file com nome e bytes, mesmo revogado logo a seguir", async () => {
    exportCsv(
      "alunos",
      [{ label: "Nome", value: (row: { nome: string }) => row.nome }],
      [{ nome: "Ana" }],
    );
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [command, bytes, options] = invoke.mock.calls[0] as unknown as [
      string,
      Uint8Array,
      { headers: Record<string, string> },
    ];
    expect(command).toBe("save_file");
    expect(decodeURIComponent(options.headers["x-file-name"]!)).toBe("alunos.csv");
    expect(new TextDecoder().decode(bytes)).toContain('"Ana"');
  });

  it("um <a download> fora do documento (jsPDF) também é apanhado", async () => {
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const a = document.createElement("a");
    a.download = "pauta 10ª A.pdf";
    a.href = URL.createObjectURL(blob);
    a.dispatchEvent(new MouseEvent("click"));
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const options = (
      invoke.mock.calls[0] as unknown as [string, Uint8Array, { headers: Record<string, string> }]
    )[2];
    expect(decodeURIComponent(options.headers["x-file-name"]!)).toBe("pauta 10ª A.pdf");
  });

  it("links normais continuam a funcionar", () => {
    const a = document.createElement("a");
    a.href = "/alunos";
    const original = vi.fn();
    uninstall();
    HTMLAnchorElement.prototype.click = original;
    uninstall = installDesktopDownloads();
    a.click();
    expect(original).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("nome do ficheiro: atributo download, senão o fim do caminho", () => {
    const a = document.createElement("a");
    a.href = "https://x.supabase.co/storage/v1/object/sign/docs/declaracao%20final.pdf?token=1";
    a.setAttribute("download", "");
    expect(fileNameFromAnchor(a)).toBe("declaracao final.pdf");
    a.setAttribute("download", "recibo.pdf");
    expect(fileNameFromAnchor(a)).toBe("recibo.pdf");
  });

  it("acima do limite do Rust não envia nada e explica porquê", async () => {
    const big = { size: MAX_SAVE_BYTES + 1 } as Blob;
    await expect(saveBlobNative(big, "enorme.pdf")).rejects.toThrow("50 MB");
    expect(invoke).not.toHaveBeenCalled();
  });
});

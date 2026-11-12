import { describe, expect, it } from "vitest";
import {
  formatBytes,
  matchesSignature,
  safeAttachmentName,
} from "@/features/academic/task-attachments";

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

describe("anexos das entregas", () => {
  it("confere a assinatura real de cada tipo", () => {
    expect(matchesSignature(bytes("%PDF-1.7"), "application/pdf")).toBe(true);
    expect(matchesSignature(bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg")).toBe(true);
    expect(matchesSignature(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a), "image/png")).toBe(true);
    expect(matchesSignature(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "), "image/webp")).toBe(true);
  });

  it("recusa bytes que não são do tipo declarado", () => {
    // Um HTML ou um executável com o tipo de PDF não passa.
    expect(matchesSignature(bytes("<html>"), "application/pdf")).toBe(false);
    expect(matchesSignature(bytes("MZ", 0x90, 0x00), "image/jpeg")).toBe(false);
    expect(matchesSignature(bytes("%PDF-1.7"), "image/png")).toBe(false);
    expect(matchesSignature(bytes("RIFF", 0, 0, 0, 0, "WAVE"), "image/webp")).toBe(false);
    expect(matchesSignature(new Uint8Array(), "application/pdf")).toBe(false);
  });

  it("o nome perde o caminho e os caracteres perigosos; a extensão vem do tipo", () => {
    expect(safeAttachmentName("../../etc/passwd", "application/pdf")).toBe("passwd.pdf");
    expect(safeAttachmentName("C:\\fotos\\caderno.HEIC", "image/jpeg")).toBe("caderno.jpg");
    expect(safeAttachmentName("tpc<script>.exe", "image/png")).toBe("tpcscript.png");
    expect(safeAttachmentName("   ", "application/pdf")).toBe("trabalho.pdf");
    expect(safeAttachmentName(`${"a".repeat(300)}.pdf`, "application/pdf")).toHaveLength(114);
  });

  it("tamanho legível", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});

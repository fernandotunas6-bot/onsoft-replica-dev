import { describe, expect, it } from "vitest";
import { canChangeDocumentRequestStatus } from "@/features/documents/server";

/** Antes, qualquer estado ia para qualquer outro (um cancelado voltava a aprovado). */
describe("estados dos pedidos de documentos", () => {
  it("avança um passo de cada vez", () => {
    expect(canChangeDocumentRequestStatus("submitted", "in_review")).toBe(true);
    expect(canChangeDocumentRequestStatus("in_review", "approved")).toBe(true);
    expect(canChangeDocumentRequestStatus("approved", "fulfilled")).toBe(true);
    expect(canChangeDocumentRequestStatus("submitted", "approved")).toBe(false);
    expect(canChangeDocumentRequestStatus("in_review", "fulfilled")).toBe(false);
  });

  it("recusa ou cancela só enquanto está aberto", () => {
    expect(canChangeDocumentRequestStatus("submitted", "rejected")).toBe(true);
    expect(canChangeDocumentRequestStatus("approved", "cancelled")).toBe(true);
    expect(canChangeDocumentRequestStatus("fulfilled", "cancelled")).toBe(false);
  });

  it("fechado não reabre", () => {
    for (const closed of ["fulfilled", "rejected", "cancelled"]) {
      for (const to of ["submitted", "in_review", "approved", "fulfilled"]) {
        expect(canChangeDocumentRequestStatus(closed, to), `${closed}→${to}`).toBe(false);
      }
    }
  });
});

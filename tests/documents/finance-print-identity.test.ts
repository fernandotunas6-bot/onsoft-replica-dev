import { describe, expect, it } from "vitest";
import { overlayServico } from "@/features/documents/print-overlays";

const service = {
  name: "Recibo de pagamento",
  reference: "REC-2026/0001",
  status: "Emitido",
  parties: [{ label: "Escola", value: "Escola Exemplo" }],
  sections: [{ title: "Pagamento", rows: [{ label: "Valor", value: "2 000 Kz" }] }],
};

describe("identidade escolar nos recibos financeiros", () => {
  it("não apresenta brasão, bandeira nem identificação governamental", () => {
    const overlay = overlayServico(service);
    expect(overlay.school).toEqual({
      ministry: "",
      ministryLine: "",
      emblemUrl: "",
      flagUrl: "",
    });
    expect(overlay.service.reference).toBe("REC-2026/0001");
  });
  it("não modifica a identidade dos documentos pedagógicos", () => {
    const overlay = overlayServico({
      ...service,
      name: "Declaração escolar",
      areaLabel: "Secretaria",
    });
    expect("school" in overlay).toBe(false);
  });
});

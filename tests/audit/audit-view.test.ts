import { describe, expect, it } from "vitest";
import {
  ACADEMIC_ENTITY_TYPES,
  NOISY_ENTITY_TYPES,
  auditChangedFields,
  auditReason,
  describeAuditAction,
} from "@/features/audit/audit-view";

describe("leitura da auditoria", () => {
  it("descreve registos automáticos e acções do servidor", () => {
    expect(describeAuditAction("grade_scores.update", "grade_scores")).toBe("Alterou nota");
    expect(describeAuditAction("access_request.approve", "school_access_request")).toBe(
      "Aprovou pedido de acesso",
    );
    expect(describeAuditAction("grades.assessment_score_changed", "x_y")).toBe(
      "x y: grades assessment score changed",
    );
  });

  it("mostra o motivo quando existe", () => {
    expect(auditReason({ note: "  Documento ilegível " })).toBe("Documento ilegível");
    expect(auditReason({ reason: "Erro de digitação" })).toBe("Erro de digitação");
    expect(auditReason({ operation: "update" })).toBeNull();
    expect(auditReason(null)).toBeNull();
  });

  it("lista os campos alterados sem o carimbo de hora", () => {
    expect(auditChangedFields({ changed_fields: ["score", "updated_at"] })).toEqual(["score"]);
    expect(auditChangedFields({})).toEqual([]);
  });

  it("a vista académica não se cruza com o ruído", () => {
    const academic = new Set<string>(ACADEMIC_ENTITY_TYPES);
    expect(NOISY_ENTITY_TYPES.filter((t) => academic.has(t))).toEqual([]);
  });
});

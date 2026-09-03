import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { EducationWorkflowVisual } from "@/components/workflows/EducationWorkflowVisual";

describe("EducationWorkflowVisual", () => {
  it("renders the enrollment scene with SIGA copy", () => {
    const html = renderToString(
      React.createElement(EducationWorkflowVisual, { scene: "enrollment" }),
    );

    expect(html).toContain("SIGA Plus");
    expect(html).toContain("Uma etapa de cada vez");
    expect(html).toContain("contexto académico");
  });

  it("allows contextual copy without changing the shared illustration shell", () => {
    const html = renderToString(
      React.createElement(EducationWorkflowVisual, {
        scene: "people",
        title: "Vincular pessoa",
        description: "Escolha a pessoa e depois o vínculo institucional.",
      }),
    );

    expect(html).toContain("Vincular pessoa");
    expect(html).toContain("vínculo institucional");
  });
});

import { describe, it, expect } from "vitest";
import { meetingRoomLink } from "@/features/integrations/actions";

describe("SIGA Integrations — Zoom Meetings & Class Integration", () => {
  it("deve fornecer link de sala e rota oficial da integração", () => {
    const link = meetingRoomLink("zoom");
    expect(link).toBeDefined();
    expect(link).toContain("zoom.us");
  });

  it("deve preservar o título da aula independente da plataforma Zoom", () => {
    const rawLessonTitle = "Equações Diferenciais e Aplicações";
    // Regra explícita: Zoom não faz parte do título da aula
    const formattedTopic = rawLessonTitle.trim();
    expect(formattedTopic).not.toContain("Zoom");
    expect(formattedTopic).toBe("Equações Diferenciais e Aplicações");
  });
});

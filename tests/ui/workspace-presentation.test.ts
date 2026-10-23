import { describe, expect, it } from "vitest";
import { workspacePresentation } from "@/lib/workspace-presentation";

describe("padrão visual por escola", () => {
  it.each([undefined, null, [], "legacy", 1, {}])(
    "usa página e menu compacto sem preferência válida (%j)",
    (value) => {
      expect(workspacePresentation(value)).toEqual({
        expandedSidebar: false,
        settingsModal: false,
      });
    },
  );
  it("aceita apenas escolhas booleanas explícitas da escola", () => {
    expect(workspacePresentation({ expandedSidebar: "true", settingsModal: 1 })).toEqual({
      expandedSidebar: false,
      settingsModal: false,
    });
    expect(workspacePresentation({ expandedSidebar: true, settingsModal: true })).toEqual({
      expandedSidebar: true,
      settingsModal: true,
    });
  });
  it("não conserva preferências de outra escola nem altera o objecto de origem", () => {
    const schoolA = Object.freeze({ settingsModal: true });
    expect(workspacePresentation(schoolA).settingsModal).toBe(true);
    expect(workspacePresentation({}).settingsModal).toBe(false);
    expect(schoolA).toEqual({ settingsModal: true });
  });
});

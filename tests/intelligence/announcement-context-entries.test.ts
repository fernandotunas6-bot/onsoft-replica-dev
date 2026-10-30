import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT_CONTEXT_ENTRIES } from "@/features/intelligence/announcement-context-entries";
import { contextEntryLink, getContextEntries } from "@/features/intelligence/context-registry";
import type { ContextFrame, ResolvedContext } from "@/features/intelligence/types";

const COMUNICADO = "44444444-4444-4444-8444-444444444444";
const frame: ContextFrame = { type: "announcement", id: COMUNICADO, label: "Reunião de pais" };

function context(role: string): ResolvedContext {
  return {
    userId: "u",
    role,
    grants: {},
    pathname: `/comunicacoes/${COMUNICADO}`,
    focusedEntity: null,
    schoolId: "school-a",
    academicYearId: null,
    trail: [frame],
    activeView: null,
    key: "k",
  };
}

describe("entradas do contexto Comunicado", () => {
  it("o comunicado e a lista, onde se gere", () => {
    const ctx = context("Secretaria");
    const entries = getContextEntries(ctx, ANNOUNCEMENT_CONTEXT_ENTRIES);
    expect(entries.map((entry) => entry.id)).toEqual([
      "announcement.overview",
      "announcement.list",
    ]);
    expect(entries.map((entry) => contextEntryLink(entry, ctx))).toEqual([
      { to: `/comunicacoes/${COMUNICADO}`, search: {} },
      { to: "/comunicacoes", search: {} },
    ]);
  });

  it("a Tesouraria, sem as Comunicações, não recebe entradas", () => {
    expect(getContextEntries(context("Tesouraria"), ANNOUNCEMENT_CONTEXT_ENTRIES)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  initialsFromName,
  matchesColleagueQuery,
  RECENT_CONTACT_LIMIT,
} from "@/features/messages/recent-contacts";

describe("mensagens internas", () => {
  it("mostra mais de 4 contactos frequentes", () => {
    expect(RECENT_CONTACT_LIMIT).toBeGreaterThan(4);
  });

  it("gera iniciais a partir do nome", () => {
    expect(initialsFromName("Canguele Valentino")).toBe("CV");
  });

  it("pesquisa colegas por nome ou cargo", () => {
    const row = { full_name: "Maria Silva", cargo: "Secretaria" };
    expect(matchesColleagueQuery(row, "maria")).toBe(true);
    expect(matchesColleagueQuery(row, "secret")).toBe(true);
    expect(matchesColleagueQuery(row, "tesouraria")).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("candidacyProcessNumber wiring", () => {
  it("submitPublicEnrollment returns the real process number instead of a placeholder", () => {
    const server = source("src/features/enrollment/server.ts");

    expect(server).toMatch(/return\s*\{\s*ok:\s*true,\s*processNumber:\s*candidacyProcessNumber/);
  });

  it("listEnrollmentApplications exposes processNumber for every candidacy row", () => {
    const server = source("src/features/enrollment/server.ts");

    expect(server).toMatch(/processNumber:\s*candidacyProcessNumber\(row\.id,\s*row\.created_at\)/);
  });

  it("the public talão prints the real process number, not the literal CAND placeholder", () => {
    const route = source("src/routes/matricula/$slug.tsx");

    expect(route).toContain("academicNumber: receipt.processNumber");
    expect(route).not.toContain('academicNumber: "CAND"');
  });

  it("the secretariat talão prints candidacyProcessNumber, not a truncated raw id", () => {
    const panel = source("src/features/enrollment/EnrollmentCampaignPanel.tsx");

    expect(panel).toContain("candidacyProcessNumber");
    expect(panel).not.toContain("row.id.slice(0, 8)");
  });
});

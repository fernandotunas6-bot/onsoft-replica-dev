import { describe, expect, it } from "vitest";
import { brandedLauncherIds } from "@/features/integrations/app-marks";
import {
  academicIntegrationCatalog,
  groupCatalogItems,
  integrationFieldHints,
  isCatalogIntegrationId,
} from "@/features/integrations/catalog";
import {
  appsForHubSection,
  canOpenLauncherApp,
  compactLauncherSections,
  filterAccessibleApps,
  hrefForLauncherApp,
  integrationStatusLabel,
  launcherAppPath,
  launcherHubSections,
  launcherIntegrationApps,
  launcherWorkspaceApps,
  isLauncherAppCurrent,
  matchesLauncherQuery,
  searchLauncherApps,
  sortIntegrationsByStatus,
  teachingBundleApps,
} from "@/features/integrations/launcher";

describe("app launcher catalog", () => {
  it("includes every configured integration with a mark and target", () => {
    const ids = launcherIntegrationApps.map((app) => app.catalogId);
    expect(ids).toEqual(academicIntegrationCatalog.map((item) => item.id));
    expect(launcherIntegrationApps.every((app) => app.mark && app.target)).toBe(true);
    expect(academicIntegrationCatalog.map((item) => item.id).sort()).toEqual(
      [...brandedLauncherIds].sort(),
    );
  });

  it("organizes the waffle into workspace, school services and teaching", () => {
    const compact = compactLauncherSections({ role: "Administrador" });
    expect(compact.map((section) => section.id)).toEqual(["workspace", "payments", "academic"]);
    expect(compact[0]?.apps.map((app) => app.id)).toContain("siga-alunos");
    expect(compact[0]?.apps.map((app) => app.id)).toContain("siga-arquivos");
    expect(compact[1]?.apps.map((app) => app.id).sort()).toEqual([
      "agt",
      "multicaixa_express",
      "resend_email",
      "unitel_money",
      "whatsapp_business",
    ]);
    expect(compact[2]?.apps.map((app) => app.id)).toEqual(
      expect.arrayContaining(["zoom", "teams", "google_classroom", "moodle", "turnitin", "sige"]),
    );
    expect(appsForHubSection("academic").map((app) => app.id)).toEqual(
      expect.arrayContaining(["zoom", "teams", "moodle"]),
    );
    expect(appsForHubSection("workspace").length).toBe(launcherWorkspaceApps.length);
  });

  it("hides finance apps from a teacher in the compact waffle", () => {
    const compact = compactLauncherSections({ role: "Professor" });
    const ids = compact.flatMap((section) => section.apps.map((app) => app.id));
    expect(ids).toContain("siga-pedagogica");
    expect(ids).not.toContain("siga-financeiro");
    expect(ids).not.toContain("multicaixa_express");
    expect(ids).not.toContain("agt");
  });

  it("opens payment apps in tesouraria and LMS apps in pedagógica", () => {
    const multicaixa = launcherIntegrationApps.find((app) => app.id === "multicaixa_express");
    const moodle = launcherIntegrationApps.find((app) => app.id === "moodle");
    expect(multicaixa && launcherAppPath(multicaixa)).toBe("/financeiro");
    expect(moodle && hrefForLauncherApp(moodle)).toBe("/pedagogica?tab=turmas");
    const whatsapp = launcherIntegrationApps.find((app) => app.id === "whatsapp_business");
    const calendar = launcherIntegrationApps.find((app) => app.id === "google_calendar");
    expect(whatsapp && hrefForLauncherApp(whatsapp)).toBe("/pedagogica?tab=turmas");
    expect(calendar && hrefForLauncherApp(calendar)).toBe("/calendario");
    const agt = launcherIntegrationApps.find((app) => app.id === "agt");
    expect(agt && launcherAppPath(agt)).toBe("/faturas");
    expect(appsForHubSection("state").map((app) => app.id)).toEqual(
      expect.arrayContaining(["sige", "agt"]),
    );
  });

  it("labels integration status and sorts connected apps first", () => {
    expect(integrationStatusLabel("connected")).toBe("Ligado");
    expect(integrationStatusLabel("disconnected")).toBe("Não ligado");
    const sorted = sortIntegrationsByStatus(launcherIntegrationApps, new Map([["zoom", "connected"]]));
    expect(sorted[0]?.id).toBe("zoom");
  });

  it("filters by search and by access grants", () => {
    expect(matchesLauncherQuery(launcherWorkspaceApps[0]!, "iníc")).toBe(true);
    expect(canOpenLauncherApp(launcherWorkspaceApps[0]!, "Professor")).toBe(true);
    const teacherFinance = filterAccessibleApps(launcherWorkspaceApps, "Professor");
    expect(teacherFinance.map((app) => app.id)).not.toContain("siga-financeiro");
  });

  it("searches across modules and marks the current pedagógica tab", () => {
    const hits = searchLauncherApps("whats", "Administrador");
    expect(hits.map((app) => app.id)).toContain("whatsapp_business");
    const classroom = launcherIntegrationApps.find((app) => app.id === "google_classroom");
    expect(classroom && isLauncherAppCurrent(classroom, "/pedagogica", "tab=turmas")).toBe(true);
    expect(classroom && isLauncherAppCurrent(classroom, "/pedagogica", "tab=horarios")).toBe(false);
    expect(teachingBundleApps().map((app) => app.id)).toContain("moodle");
  });

  it("groups the catalog and uses AGT fiscal field labels", () => {
    const groups = groupCatalogItems(academicIntegrationCatalog);
    expect(groups.map((entry) => entry.group)).toEqual([
      "Pagamentos",
      "Comunicação",
      "Académico",
      "Aulas",
      "Calendário",
      "Estado",
    ]);
    expect(groups.at(-1)?.items.map((item) => item.id)).toEqual(["sige", "agt"]);
    expect(integrationFieldHints.agt.merchant).toMatch(/NIF/i);
    expect(isCatalogIntegrationId("agt")).toBe(true);
    expect(isCatalogIntegrationId("unknown")).toBe(false);
    expect(launcherHubSections.map((section) => section.id)).not.toContain("integrations");
    expect(searchLauncherApps("faturação", "Administrador").map((app) => app.id)).toContain("agt");
  });

  it("keeps Zoom and Teams in the teaching waffle even when disconnected", () => {
    const compact = compactLauncherSections({ role: "Administrador" });
    const teaching = compact.find((section) => section.id === "academic")?.apps.map((app) => app.id);
    expect(teaching).toContain("zoom");
    expect(teaching).toContain("teams");
  });
});

import modulesCatalog from "../../scripts/siga/modules.json";
import { describe, expect, it } from "vitest";
import { canAccessPath } from "@/features/auth/access-policy";
import { sigaModuleMarks } from "@/features/integrations/app-marks";
import { launcherWorkspaceApps } from "@/features/integrations/launcher";
import { getPortalNavigation } from "@/features/auth/portal-engine";
import {
  ADMIN_NAV_PATH_COVERAGE,
  WORKSPACE_MODULE_SPECS,
  collectNavPaths,
  inventoryNavPaths,
  missingAdminNavPaths,
} from "@/features/auth/navigation-catalog";
import {
  SIGA_AUTHENTICATED_ROUTE_PREFIXES,
  isKnownSigaRoute,
} from "@/features/auth/route-inventory";
import { spotlightInternalTargets } from "@/features/spotlight/schemas";

const fullPlan = {
  id: "p1",
  name: "Enterprise",
  code: "enterprise" as const,
  description: "Test",
  max_students: 9999,
  max_staff: 999,
  max_storage_gb: 100,
  price_aoa_monthly: 0,
  price_aoa_yearly: 0,
  features: {
    academic: true,
    finance: true,
    attendance: true,
    documents: true,
    api: true,
  },
  is_active: true,
};

describe("navigation catalog", () => {
  it("keeps launcher workspace apps aligned with the catalog", () => {
    expect(launcherWorkspaceApps.map((app) => app.id).sort()).toEqual(
      WORKSPACE_MODULE_SPECS.map((spec) => spec.id).sort(),
    );
  });

  it("defines a premium icon for every workspace module mark", () => {
    for (const spec of WORKSPACE_MODULE_SPECS) {
      expect(sigaModuleMarks[spec.mark], `missing icon for ${spec.mark}`).toBeTruthy();
    }
  });

  it("exposes every admin module path in the sidebar for Administrador", () => {
    const groups = getPortalNavigation("Administrador", {}, fullPlan);
    const paths = collectNavPaths(groups);
    const missing = missingAdminNavPaths(paths);
    expect(missing, `paths missing from sidebar: ${missing.join(", ")}`).toEqual([]);
    expect(ADMIN_NAV_PATH_COVERAGE.every((path) => paths.has(path))).toBe(true);
  });

  /**
   * Um módulo adormecido existe, tem ficheiros e as rotas funcionam — mas não está
   * em navegação nenhuma, nem no lançador nem no menu. A 25/10/2026 são o Alumni, o
   * RH e as Catracas: zero registos em produção, medidos por `count(*)`.
   *
   * Até aqui este teste exigia `paths.has("/alumni")`. A regra passou a ser a
   * inversa, e vigiada: enquanto o módulo estiver marcado, não volta ao menu por
   * descuido. Para o acordar, tirar `dormant` do `modules.json` — e então as duas
   * asserções abaixo obrigam a pôr-lhe navegação outra vez.
   */
  const modulosAdormecidos = modulesCatalog.modules.filter(
    (mod) => "dormant" in mod && mod.dormant,
  );

  it("declara os módulos adormecidos com a razão escrita", () => {
    expect(modulosAdormecidos.map((mod) => mod.id).sort()).toEqual(["alumni", "catracas", "rh"]);
    for (const mod of modulosAdormecidos) {
      expect("dormantReason" in mod && mod.dormantReason, `${mod.id} sem razão`).toBeTruthy();
      // Adormecido e navegável ao mesmo tempo não existe.
      expect("navPath" in mod && mod.navPath, `${mod.id} tem navPath`).toBeFalsy();
      expect(
        "secondaryNavPaths" in mod && mod.secondaryNavPaths?.length,
        `${mod.id} tem caminhos secundários`,
      ).toBeFalsy();
    }
  });

  it("nenhum módulo adormecido aparece no menu de qualquer papel", () => {
    const papeis = ["Administrador", "Secretaria", "Tesouraria", "Professor"] as const;
    const caminhosAdormecidos = ["/alumni", "/financeiro/rh", "/catracas"];
    for (const papel of papeis) {
      const paths = collectNavPaths(getPortalNavigation(papel, {}, fullPlan));
      for (const caminho of caminhosAdormecidos) {
        expect(paths.has(caminho), `${papel} ainda vê ${caminho}`).toBe(false);
      }
    }
  });

  it("maps inventory modules with navPath to workspace catalog", () => {
    const catalogPaths = new Set(WORKSPACE_MODULE_SPECS.map((spec) => spec.navPath));
    for (const mod of modulesCatalog.modules) {
      if (!("navPath" in mod) || !mod.navPath) continue;
      expect(catalogPaths.has(mod.navPath), `${mod.id} → ${mod.navPath}`).toBe(true);
    }
  });

  it("covers every inventory nav path in workspace specs or secondary routes", () => {
    const workspacePaths = new Set(WORKSPACE_MODULE_SPECS.map((spec) => spec.navPath));
    for (const path of inventoryNavPaths(modulesCatalog.modules)) {
      const inWorkspace = workspacePaths.has(path);
      const isSecondary = modulesCatalog.modules.some(
        (mod) => "secondaryNavPaths" in mod && mod.secondaryNavPaths?.includes(path),
      );
      expect(inWorkspace || isSecondary, `inventory path ${path} not mapped`).toBe(true);
    }
  });

  it("exposes secondary inventory routes in the admin sidebar", () => {
    const paths = collectNavPaths(getPortalNavigation("Administrador", {}, fullPlan));
    for (const mod of modulesCatalog.modules) {
      const secondary = "secondaryNavPaths" in mod ? mod.secondaryNavPaths : undefined;
      if (!secondary?.length) continue;
      for (const route of secondary) {
        expect(paths.has(route), `${mod.id} secondary → ${route}`).toBe(true);
      }
    }
  });

  it("hides finance and settings from teacher while keeping pedagógica", () => {
    const groups = getPortalNavigation("Professor", {}, fullPlan);
    const paths = collectNavPaths(groups);
    expect(paths.has("/pedagogica")).toBe(true);
    expect(paths.has("/planos-aula")).toBe(true);
    expect(paths.has("/calendario")).toBe(true);
    expect(paths.has("/arquivos")).toBe(true);
    expect(paths.has("/professor/presenca")).toBe(true);
    expect(paths.has("/financeiro")).toBe(false);
    expect(paths.has("/financeiro/rh")).toBe(false);
    expect(paths.has("/configuracoes")).toBe(false);
  });

  it("shows import and secretaria modules for Secretaria", () => {
    const paths = collectNavPaths(getPortalNavigation("Secretaria", {}, fullPlan));
    expect(paths.has("/importar")).toBe(true);
    expect(paths.has("/pessoas")).toBe(true);
    expect(paths.has("/alunos")).toBe(true);
    // O /alumni saiu do menu (módulo adormecido) — ver o teste dos adormecidos acima.
    expect(paths.has("/configuracoes")).toBe(false);
  });

  it("shows the protected Alumni self-service entry only to students who finished", () => {
    const alumni = collectNavPaths(getPortalNavigation("Aluno", {}, fullPlan, { isAlumni: true }));
    expect(alumni.has("/alumni/portal")).toBe(true);
    expect(alumni.has("/alumni")).toBe(false);
    // Quem ainda estuda não vê o portal de antigos alunos.
    const current = collectNavPaths(getPortalNavigation("Aluno", {}, fullPlan));
    expect(current.has("/alumni/portal")).toBe(false);
  });

  it("o encarregado não tem ligações para páginas que lhe estão fechadas", () => {
    const paths = collectNavPaths(getPortalNavigation("Encarregado", {}, fullPlan));
    expect(paths.has("/faturas")).toBe(false);
    expect(paths.has("/financeiro")).toBe(true);
  });

  it("shows finance modules for Tesouraria without secretaria-only routes", () => {
    const paths = collectNavPaths(getPortalNavigation("Tesouraria", {}, fullPlan));
    expect(paths.has("/financeiro")).toBe(true);
    // O /financeiro/rh saiu do menu (módulo adormecido) — ver o teste dos adormecidos acima.
    expect(paths.has("/faturas")).toBe(true);
    expect(paths.has("/relatorios/financeiros")).toBe(true);
    expect(paths.has("/importar")).toBe(true);
    expect(paths.has("/pessoas")).toBe(false);
    expect(paths.has("/alumni")).toBe(false);
    expect(paths.has("/configuracoes")).toBe(false);
  });

  it("allows administrators into every authenticated route prefix", () => {
    for (const prefix of SIGA_AUTHENTICATED_ROUTE_PREFIXES) {
      expect(canAccessPath(prefix, "Administrador"), prefix).toBe(true);
    }
  });

  it("maps inventory nav paths to known route inventory", () => {
    for (const path of inventoryNavPaths(modulesCatalog.modules)) {
      expect(isKnownSigaRoute(path), `unknown route ${path}`).toBe(true);
    }
  });

  it("derives spotlight internal targets from workspace catalog", () => {
    const catalogPaths = new Set(WORKSPACE_MODULE_SPECS.map((spec) => spec.navPath));
    for (const target of spotlightInternalTargets) {
      expect(
        catalogPaths.has(target.to) || target.to === "/perfil",
        `spotlight target ${target.to}`,
      ).toBe(true);
    }
    expect(spotlightInternalTargets.length).toBe(WORKSPACE_MODULE_SPECS.length + 1);
  });
});

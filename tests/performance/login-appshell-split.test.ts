import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");

describe("carregamento do painel após autenticação", () => {
  it("não importa a estrutura administrativa no bloco inicial de login", () => {
    expect(source).not.toContain('import { AppShell } from "@/components/layout/AppShell"');
    expect(source).toContain('const AppShell = lazy(() =>');
    expect(source).toContain('import("@/components/layout/AppShell")');
  });

  it("mantém um fallback de carregamento para o painel assíncrono", () => {
    expect(source).toMatch(/<Suspense fallback=\{<PortalDashboardSkeleton \/>\}>\s*<AppShell>/);
    expect(source).toContain("<StudentPortalDashboard />");
    expect(source).toContain("<GuardianPortalDashboard />");
    expect(source).toContain("<TeacherPortalDashboard />");
    expect(source).toContain("<AdminPortalDashboard");
  });
});

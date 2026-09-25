import { describe, expect, it } from "vitest";
import { actionIcons, moduleIcons, statusIcons } from "@/lib/app-icons";
import { applicationRoles } from "@/features/auth/access-policy";
import { getPortalNavigation } from "@/features/auth/portal-engine";

const nameOf = (icon: unknown) => (icon as { displayName?: string }).displayName ?? String(icon);

describe("catálogo de ícones — um conceito, um ícone", () => {
  it("nenhum ícone de módulo serve dois conceitos", () => {
    const seen = new Map<unknown, string>();
    const clashes: string[] = [];
    for (const [key, icon] of Object.entries(moduleIcons)) {
      const other = seen.get(icon);
      if (other) clashes.push(`${other} e ${key} usam ${nameOf(icon)}`);
      seen.set(icon, key);
    }
    expect(clashes).toEqual([]);
  });

  it("acções e estados não reutilizam ícones de módulo", () => {
    const modules = new Set<unknown>(Object.values(moduleIcons));
    const reused = [...Object.entries(actionIcons), ...Object.entries(statusIcons)]
      .filter(([, icon]) => modules.has(icon))
      .map(([key]) => key);
    expect(reused).toEqual([]);
  });

  it("todos os ícones do menu, em todos os papéis, vêm do catálogo", () => {
    const conceptOf = new Map<unknown, string>(
      Object.entries(moduleIcons).map(([key, icon]) => [icon, key]),
    );
    for (const role of applicationRoles) {
      const items = getPortalNavigation(role).flatMap((group) => group.items);
      for (const item of items) {
        // Todo o ícone de topo vem do catálogo — nada importado à parte.
        expect(conceptOf.has(item.icon), `${role}: "${item.label}" fora do catálogo`).toBe(true);
      }
    }
  });
});

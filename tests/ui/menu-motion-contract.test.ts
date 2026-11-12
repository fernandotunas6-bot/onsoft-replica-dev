import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function componentSource(name: string) {
  return readFileSync(resolve(process.cwd(), "src/components/ui", name), "utf8");
}

describe("animações dos menus partilhados", () => {
  it("abre e fecha popovers apenas quando o movimento é permitido", () => {
    const source = componentSource("popover.tsx");
    expect(source).toContain("siga-menu-motion");
    expect(source).toContain("motion-safe:data-[state=open]:animate-in");
    expect(source).toContain("motion-safe:data-[state=closed]:animate-out");
  });

  it("mantém tooltips discretos sem obrigar animações a quem reduz o movimento", () => {
    const source = componentSource("tooltip.tsx");
    expect(source).toContain("siga-menu-motion");
    expect(source).toContain("motion-safe:animate-in");
    expect(source).toContain("motion-safe:data-[state=closed]:animate-out");
  });
});

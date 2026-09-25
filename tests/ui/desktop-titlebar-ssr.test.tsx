// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DesktopTitleBar } from "@/components/layout/DesktopTitleBar";

describe("DesktopTitleBar — hidratação", () => {
  it("no servidor não desenha a barra, tal como o primeiro render do browser", () => {
    // Antes, sem `window` no servidor, a barra aparecia no HTML e desaparecia no
    // cliente: erro React #418 em todas as páginas e o SSR deitado fora.
    expect(renderToString(<DesktopTitleBar />)).toBe("");
  });
});

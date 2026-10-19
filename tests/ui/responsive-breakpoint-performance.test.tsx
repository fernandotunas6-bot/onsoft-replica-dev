// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useBreakpoint } from "@/hooks/use-breakpoint";

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

afterEach(() => {
  cleanup();
  setWidth(1024);
});

describe("detector de ecrã SIGA", () => {
  it("não cria novos estados em cada pixel de resize dentro do mesmo degrau", () => {
    setWidth(375);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toEqual({ breakpoint: "mobile", ready: true });
    const initial = result.current;

    act(() => {
      setWidth(390);
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("orientationchange"));
    });
    expect(result.current).toBe(initial);
  });

  it("muda de telemóvel para tablet e desktop nos limiares exactos", () => {
    setWidth(767);
    const { result } = renderHook(() => useBreakpoint());
    const mobile = result.current;
    expect(mobile.breakpoint).toBe("mobile");

    act(() => {
      setWidth(768);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.breakpoint).toBe("tablet");
    expect(result.current).not.toBe(mobile);
    const tablet = result.current;

    act(() => {
      setWidth(1023);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(tablet);

    act(() => {
      setWidth(1024);
      window.dispatchEvent(new Event("orientationchange"));
    });
    expect(result.current.breakpoint).toBe("desktop");
  });
});

describe("barra inferior adaptável sem novos destinos", () => {
  it("limita a largura dos ícones e dos rótulos nos ecrãs mais estreitos", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/mobile/BottomNavigation.tsx", "utf8");
    expect(source).toContain("w-full max-w-[48px]");
    expect(source).toContain("max-w-full truncate text-[11px]");
    expect(source).toContain("lg:hidden");
    expect(source).toContain("aria-label=\"Navegação principal\"");
  });
});

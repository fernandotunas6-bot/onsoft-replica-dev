// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBreakpoint, useIsCompactViewport, useIsMobileViewport } from "@/hooks/use-breakpoint";

function resize(width: number, event = "resize") {
  act(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    window.dispatchEvent(new Event(event));
  });
}
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("não volta a desenhar consumidores durante 100 redimensionamentos no mesmo degrau", () => {
  const committed = vi.fn();
  function Probe() {
    const value = useBreakpoint();
    useEffect(() => {
      committed(value);
    });
    return null;
  }
  render(<Probe />);
  committed.mockClear();
  for (let width = 1100; width < 1200; width++) resize(width);
  expect(committed).not.toHaveBeenCalled();
});
it("mantém os limites exactos de 768 e 1024 px, incluindo orientação", () => {
  const { result } = renderHook(useBreakpoint);
  expect(result.current).toEqual({ breakpoint: "desktop", ready: true });
  resize(1023);
  expect(result.current.breakpoint).toBe("tablet");
  resize(768);
  expect(result.current.breakpoint).toBe("tablet");
  resize(767, "orientationchange");
  expect(result.current.breakpoint).toBe("mobile");
  resize(1024);
  expect(result.current.breakpoint).toBe("desktop");
});
it("preserva o primeiro HTML e os atalhos mobile/compacto depois de hidratar", () => {
  function Probe() {
    return <span>{JSON.stringify(useBreakpoint())}</span>;
  }
  resize(390);
  expect(renderToString(<Probe />)).toContain(
    "&quot;breakpoint&quot;:&quot;desktop&quot;,&quot;ready&quot;:false",
  );
  const { result } = renderHook(() => ({
    mobile: useIsMobileViewport(),
    compact: useIsCompactViewport(),
  }));
  expect(result.current).toEqual({ mobile: true, compact: true });
  resize(900);
  expect(result.current).toEqual({ mobile: false, compact: true });
  resize(1440);
  expect(result.current).toEqual({ mobile: false, compact: false });
});
it("remove os listeners ao desmontar", () => {
  const remove = vi.spyOn(window, "removeEventListener");
  const { unmount } = renderHook(useBreakpoint);
  unmount();
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("orientationchange", expect.any(Function));
});

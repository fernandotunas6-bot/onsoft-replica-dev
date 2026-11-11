/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioHistory } from "@/features/school-website/studio/use-studio-history";
import { readWebsiteState } from "@/features/school-website/content-model";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("agrupa a digitação, separa os âmbitos e elimina o futuro depois de uma nova edição", () => {
  let time = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => time);
  const initial = readWebsiteState(null).draft;
  const { result } = renderHook(() => useStudioHistory(initial));
  act(() => result.current.change({ ...initial, websiteUrl: "https://first.example" }, "page-a"));
  time += 100;
  act(() => result.current.change({ ...initial, websiteUrl: "https://second.example" }, "page-a"));
  act(() => result.current.undo());
  expect(result.current.draft).toBe(initial);
  act(() => result.current.redo());
  expect(result.current.draft.websiteUrl).toBe("https://second.example");
  act(() => result.current.change({ ...initial, websiteUrl: "https://third.example" }, "page-b"));
  act(() => result.current.undo());
  expect(result.current.draft.websiteUrl).toBe("https://second.example");
  act(() => result.current.change({ ...initial, websiteUrl: "https://new.example" }, "page-b"));
  expect(result.current.canRedo).toBe(false);
});
it("limita o histórico e limpar o contexto elimina todas as versões anteriores", () => {
  const initial = readWebsiteState(null).draft;
  const { result } = renderHook(() => useStudioHistory(initial));
  for (let n = 1; n <= 25; n++)
    act(() =>
      result.current.change({ ...initial, websiteUrl: `https://school${n}.example` }, String(n)),
    );
  for (let n = 0; n < 20; n++) act(() => result.current.undo());
  expect(result.current.canUndo).toBe(false);
  expect(result.current.draft.websiteUrl).toBe("https://school5.example");
  act(() => result.current.reset(initial));
  expect(result.current.draft).toBe(initial);
  expect(result.current.canRedo).toBe(false);
});

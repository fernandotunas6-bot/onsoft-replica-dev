// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePersistedSidebar } from "@/hooks/use-persisted-sidebar";

afterEach(() => window.localStorage.clear());

describe("preferência pessoal da sidebar", () => {
  it("começa expandida e mantém cada clique, incluindo após voltar a montar", () => {
    const view = renderHook(() => usePersistedSidebar("user-a", "school-a"));
    expect(view.result.current.collapsed).toBe(false);
    act(() => view.result.current.toggleCollapsed());
    expect(view.result.current.collapsed).toBe(true);
    view.unmount();

    const nextSession = renderHook(() => usePersistedSidebar("user-a", "school-a"));
    expect(nextSession.result.current.collapsed).toBe(true);
    act(() => nextSession.result.current.toggleCollapsed());
    expect(nextSession.result.current.collapsed).toBe(false);
    nextSession.unmount();

    const thirdSession = renderHook(() => usePersistedSidebar("user-a", "school-a"));
    expect(thirdSession.result.current.collapsed).toBe(false);
  });

  it("não herda o estado de outra escola ou conta", () => {
    const view = renderHook(({ user, school }) => usePersistedSidebar(user, school), {
      initialProps: { user: "user-a", school: "school-a" },
    });
    act(() => view.result.current.toggleCollapsed());
    expect(view.result.current.collapsed).toBe(true);
    view.rerender({ user: "user-a", school: "school-b" });
    expect(view.result.current.collapsed).toBe(false);
    view.rerender({ user: "user-b", school: "school-a" });
    expect(view.result.current.collapsed).toBe(false);
    view.rerender({ user: "user-a", school: "school-a" });
    expect(view.result.current.collapsed).toBe(true);
  });
});

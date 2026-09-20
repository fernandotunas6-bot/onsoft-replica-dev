import { beforeEach, describe, expect, it } from "vitest";
import {
  itemKey,
  labelForPath,
  readFavoriteNav,
  readRecentNav,
  toggleFavoriteNav,
  touchRecentNav,
} from "@/lib/navigation-memory";

function installMemoryStorage() {
  const store = new Map<string, string>();
  const memory = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memory,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: memory },
    configurable: true,
  });
}

describe("navigation-memory", () => {
  const userId = "test-user-nav-memory";

  beforeEach(() => {
    installMemoryStorage();
  });

  it("labels known paths in Portuguese", () => {
    expect(labelForPath("/calendario")).toBe("Calendário");
    expect(labelForPath("/alunos")).toBe("Alunos");
  });

  it("tracks recent pages without duplicates", () => {
    touchRecentNav(userId, { path: "/alunos", label: "Alunos" });
    touchRecentNav(userId, { path: "/calendario", label: "Calendário" });
    touchRecentNav(userId, { path: "/alunos", label: "Alunos" });
    const recent = readRecentNav(userId);
    expect(recent[0]?.path).toBe("/alunos");
    expect(recent.filter((item) => item.path === "/alunos")).toHaveLength(1);
  });

  it("toggles favorites by path+search key", () => {
    const entry = { path: "/pedagogica", label: "Área Pedagógica", search: "tab=notas" };
    expect(itemKey(entry)).toBe("/pedagogica?tab=notas");
    toggleFavoriteNav(userId, entry);
    expect(readFavoriteNav(userId).some((item) => itemKey(item) === itemKey(entry))).toBe(true);
    toggleFavoriteNav(userId, entry);
    expect(readFavoriteNav(userId).some((item) => itemKey(item) === itemKey(entry))).toBe(false);
  });
});

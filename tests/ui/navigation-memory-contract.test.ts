import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRecentNav,
  itemKey,
  labelForPath,
  migrateLegacyNavMemory,
  navItemHasEntityId,
  navMemoryOwner,
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
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
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

describe("navigation-memory por escola (SIGA Context Engine)", () => {
  const user = "user-1";
  const escolaA = navMemoryOwner(user, "school-a");
  const escolaB = navMemoryOwner(user, "school-b");
  const ALUNO = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    installMemoryStorage();
  });

  it("a mesma conta tem recentes e favoritos separados em cada escola", () => {
    touchRecentNav(escolaA, { path: `/alunos/${ALUNO}`, label: "Aluno" });
    toggleFavoriteNav(escolaA, { path: "/faturas", label: "Faturas" });
    expect(readRecentNav(escolaB)).toEqual([]);
    expect(readFavoriteNav(escolaB)).toEqual([]);
    expect(readRecentNav(escolaA).map((item) => item.path)).toEqual([`/alunos/${ALUNO}`]);
  });

  it("sem escola activa, fica numa memória à parte", () => {
    expect(navMemoryOwner(user, null)).toBe("user-1:sem-escola");
    expect(navMemoryOwner(user, "")).toBe("user-1:sem-escola");
  });

  it("reconhece destinos que apontam para uma entidade pelo id", () => {
    expect(navItemHasEntityId({ path: `/alunos/${ALUNO}` })).toBe(true);
    expect(navItemHasEntityId({ path: "/pedagogica", search: `tab=notas&turma=${ALUNO}` })).toBe(
      true,
    );
    expect(navItemHasEntityId({ path: "/pedagogica", search: "tab=notas" })).toBe(false);
  });

  it("a memória antiga, só por utilizador, passa sem recentes nem entidades", () => {
    touchRecentNav(user, { path: "/faturas", label: "Faturas" });
    toggleFavoriteNav(user, { path: "/pedagogica", label: "Área Pedagógica", search: "tab=notas" });
    toggleFavoriteNav(user, { path: `/alunos/${ALUNO}`, label: "Aluno" });
    migrateLegacyNavMemory(user, escolaA);
    expect(readFavoriteNav(escolaA).map(itemKey)).toEqual(["/pedagogica?tab=notas"]);
    expect(readRecentNav(escolaA)).toEqual([]);
    // A memória antiga sai: a outra escola não a herda depois.
    expect(readFavoriteNav(user)).toEqual([]);
    expect(readRecentNav(user)).toEqual([]);
    migrateLegacyNavMemory(user, escolaB);
    expect(readFavoriteNav(escolaB)).toEqual([]);
  });

  it("migrar não duplica um favorito que a escola já tem", () => {
    toggleFavoriteNav(escolaA, { path: "/faturas", label: "Faturas" });
    toggleFavoriteNav(user, { path: "/faturas", label: "Faturas" });
    migrateLegacyNavMemory(user, escolaA);
    expect(readFavoriteNav(escolaA).map(itemKey)).toEqual(["/faturas"]);
  });

  it("terminar sessão apaga os recentes de todas as escolas e contas, e guarda os favoritos", () => {
    touchRecentNav(escolaA, { path: "/faturas", label: "Faturas" });
    touchRecentNav(navMemoryOwner("user-2", "school-a"), { path: "/alunos", label: "Alunos" });
    toggleFavoriteNav(escolaA, { path: "/calendario", label: "Calendário" });
    clearRecentNav();
    expect(readRecentNav(escolaA)).toEqual([]);
    expect(readRecentNav(navMemoryOwner("user-2", "school-a"))).toEqual([]);
    expect(readFavoriteNav(escolaA).map(itemKey)).toEqual(["/calendario"]);
  });
});

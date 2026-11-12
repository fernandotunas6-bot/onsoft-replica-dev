import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cookieSessionStorage,
  platformCookieDomain,
  SESSION_COOKIE_CHUNK,
} from "@/integrations/supabase/shared-session-storage";

/**
 * Cada escola tem o seu subdomínio e o `localStorage` é de cada origem: mudar de
 * escola pedia outra vez início de sessão e código 2FA. A sessão passa a viver num
 * cookie do domínio-pai, partilhado por todos os subdomínios.
 */

/** Cookies de um domínio, como o browser os guarda (vários subdomínios, um só pote). */
function fakeJar() {
  const store = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    store,
    jar: {
      get: () => [...store].map(([k, v]) => `${k}=${v}`).join("; "),
      set: (cookie: string) => {
        writes.push(cookie);
        const [pair, ...attrs] = cookie.split(";").map((part) => part.trim());
        const index = pair!.indexOf("=");
        const name = pair!.slice(0, index);
        const value = pair!.slice(index + 1);
        if (attrs.some((a) => a === "Max-Age=0")) store.delete(name);
        else store.set(name, value);
      },
    },
  };
}

function fakeLocalStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    } as unknown as Storage,
  };
}

const KEY = "sb-xodgfmxiaunpamctfeea-auth-token";
const session = JSON.stringify({
  access_token: "a".repeat(1400),
  refresh_token: "r".repeat(40),
  user: { id: "u1", email: "ana@escola.ao", user_metadata: { nome: "Ana Domingos — «Direcção»" } },
});

describe("sessão partilhada pelos subdomínios", () => {
  it("só nos domínios da plataforma", () => {
    expect(platformCookieDomain("escola-a.portal-siga.com")).toBe("portal-siga.com");
    expect(platformCookieDomain("app.portal-siga.com")).toBe("portal-siga.com");
    expect(platformCookieDomain("portal-siga.com")).toBe("portal-siga.com");
    expect(platformCookieDomain("localhost")).toBeNull();
    expect(platformCookieDomain("projeto.lovable.app")).toBeNull();
    expect(platformCookieDomain("portal-siga.com.evil.example")).toBeNull();
  });

  it("uma escola grava, a outra lê a mesma sessão", () => {
    const { jar } = fakeJar();
    const escolaA = cookieSessionStorage("portal-siga.com", { jar, fallback: null });
    const escolaB = cookieSessionStorage("portal-siga.com", { jar, fallback: null });
    escolaA.setItem(KEY, session);
    expect(escolaB.getItem(KEY)).toBe(session);
  });

  it("divide em vários cookies com o domínio-pai, Secure e SameSite", () => {
    const { jar, writes, store } = fakeJar();
    cookieSessionStorage("portal-siga.com", { jar, fallback: null }).setItem(KEY, session);
    expect(store.size).toBeGreaterThan(0);
    for (const value of store.values())
      expect(value.length).toBeLessThanOrEqual(SESSION_COOKIE_CHUNK);
    expect(writes[0]).toContain("Domain=portal-siga.com; Path=/; Secure; SameSite=Lax");
    // Nome próprio, para não colidir com os cookies do painel ADMIN (@supabase/ssr).
    expect([...store.keys()].every((name) => name.startsWith(`siga-${KEY}.`))).toBe(true);
  });

  it("terminar a sessão apaga-a em todas as escolas", () => {
    const { jar, store } = fakeJar();
    const escolaA = cookieSessionStorage("portal-siga.com", { jar, fallback: null });
    escolaA.setItem(KEY, session);
    escolaA.removeItem(KEY);
    expect(store.size).toBe(0);
    expect(
      cookieSessionStorage("portal-siga.com", { jar, fallback: null }).getItem(KEY),
    ).toBeNull();
  });

  it("uma sessão mais curta não deixa pedaços da anterior", () => {
    const { jar } = fakeJar();
    const storage = cookieSessionStorage("portal-siga.com", { jar, fallback: null });
    storage.setItem(KEY, session);
    storage.setItem(KEY, '{"curta":true}');
    expect(storage.getItem(KEY)).toBe('{"curta":true}');
  });

  it("a sessão que estava no localStorage é adoptada: o deploy não termina sessões", () => {
    const { jar } = fakeJar();
    const local = fakeLocalStorage({ [KEY]: session });
    const storage = cookieSessionStorage("portal-siga.com", { jar, fallback: local.storage });
    expect(storage.getItem(KEY)).toBe(session);
    expect(local.map.has(KEY)).toBe(false);
    expect(cookieSessionStorage("portal-siga.com", { jar, fallback: null }).getItem(KEY)).toBe(
      session,
    );
  });

  it("com os cookies bloqueados, fica no localStorage como antes", () => {
    const local = fakeLocalStorage();
    const blocked = { get: () => "", set: () => {} };
    const storage = cookieSessionStorage("portal-siga.com", {
      jar: blocked,
      fallback: local.storage,
    });
    storage.setItem(KEY, session);
    expect(local.map.get(KEY)).toBe(session);
    expect(storage.getItem(KEY)).toBe(session);
  });

  it("o cliente do browser usa-a", () => {
    const client = readFileSync("src/integrations/supabase/client.ts", "utf8");
    expect(client).toContain("sharedSessionStorage(brokeredPreviewStorage())");
  });
});

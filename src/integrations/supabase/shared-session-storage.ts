/**
 * Uma só sessão para todos os subdomínios da plataforma.
 *
 * O Supabase guardava a sessão no `localStorage`, que é de cada origem: cada escola
 * tem o seu subdomínio (`escola.portal-siga.com`), e mudar de escola ou abrir outro
 * painel era entrar numa origem sem sessão — novo início de sessão e novo código 2FA,
 * com a sessão anterior ainda válida no servidor. Leitura de 22/10: uma conta teve 6
 * códigos em 7 dias, quase todos com uma sessão 2FA viva noutra origem.
 *
 * Como nas grandes plataformas (um cookie do domínio-pai para todos os serviços), a
 * sessão passa a viver num cookie de `Domain=<domínio da plataforma>`: entra-se uma
 * vez e vale em todos os subdomínios; terminar a sessão termina-a em todos. Tem os
 * mesmos dados e o mesmo acesso por JavaScript que o `localStorage` tinha (o
 * cliente precisa de os ler), com `Secure` e `SameSite=Lax`. O servidor não usa este
 * cookie para autenticar (continua a ser o cabeçalho `Authorization`), por isso não
 * abre caminho a pedidos forjados de outro site.
 *
 * Fora dos domínios da plataforma (desenvolvimento, pré-visualização) fica o
 * armazenamento de antes. A sessão que já estava no `localStorage` é adoptada na
 * primeira leitura: o deploy não termina sessões.
 */
import { getPlatformDomain, LEGACY_PLATFORM_DOMAIN } from "@/lib/saas/platform-domain";

export interface SessionStorageLike {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

/** Caracteres por cookie (já codificados), abaixo dos ~4096 bytes que os browsers aceitam. */
export const SESSION_COOKIE_CHUNK = 3000;
/** O máximo que os browsers guardam um cookie (400 dias); o Supabase renova-o a cada hora. */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const MAX_CHUNKS = 10;

/** Domínio-pai da plataforma a que este endereço pertence, ou null. */
export function platformCookieDomain(hostname: string): string | null {
  const host = hostname.toLowerCase();
  for (const domain of [getPlatformDomain(), LEGACY_PLATFORM_DOMAIN]) {
    const root = domain.toLowerCase();
    if (host === root || host.endsWith(`.${root}`)) return root;
  }
  return null;
}

type CookieJar = { get: () => string; set: (cookie: string) => void };

const browserJar: CookieJar = {
  get: () => document.cookie,
  set: (cookie) => {
    document.cookie = cookie;
  },
};

function readCookies(jar: CookieJar): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of jar.get().split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) map.set(name, part.slice(index + 1).trim());
  }
  return map;
}

export function cookieSessionStorage(
  domain: string,
  options: { jar?: CookieJar; fallback?: Storage | null } = {},
): SessionStorageLike {
  const jar = options.jar ?? browserJar;
  const fallback = options.fallback === undefined ? safeLocalStorage() : options.fallback;
  const attributes = `Domain=${domain}; Path=/; Secure; SameSite=Lax`;
  // Prefixo próprio: o painel ADMIN (@supabase/ssr) usa `sb-<ref>-auth-token.N` em
  // cookies do seu subdomínio, e o mesmo nome no domínio-pai baralhava os dois.
  const chunkName = (key: string, index: number) => `siga-${key}.${index}`;

  const clearChunks = (key: string, from: number) => {
    const cookies = readCookies(jar);
    for (let i = from; i < MAX_CHUNKS; i += 1) {
      if (cookies.has(chunkName(key, i))) {
        jar.set(`${chunkName(key, i)}=; ${attributes}; Max-Age=0`);
      }
    }
  };

  const readCookieValue = (key: string): string | null => {
    const cookies = readCookies(jar);
    const parts: string[] = [];
    for (let i = 0; i < MAX_CHUNKS; i += 1) {
      const part = cookies.get(chunkName(key, i));
      if (part === undefined) break;
      parts.push(part);
    }
    if (!parts.length) return null;
    try {
      return decodeURIComponent(parts.join(""));
    } catch {
      return null;
    }
  };

  const writeCookieValue = (key: string, value: string): boolean => {
    const encoded = encodeURIComponent(value);
    const chunks: string[] = [];
    for (let i = 0; i < encoded.length; i += SESSION_COOKIE_CHUNK) {
      chunks.push(encoded.slice(i, i + SESSION_COOKIE_CHUNK));
    }
    if (!chunks.length || chunks.length > MAX_CHUNKS) return false;
    chunks.forEach((chunk, index) => {
      jar.set(`${chunkName(key, index)}=${chunk}; ${attributes}; Max-Age=${MAX_AGE_SECONDS}`);
    });
    clearChunks(key, chunks.length);
    // O browser pode recusar (cookies bloqueados, tamanho): confirma-se a leitura.
    return readCookieValue(key) === value;
  };

  return {
    getItem(key) {
      const fromCookie = readCookieValue(key);
      if (fromCookie !== null) return fromCookie;
      // Sessão de antes desta mudança (ou cookies bloqueados): adopta-se.
      const legacy = fallback?.getItem(key) ?? null;
      if (legacy !== null && writeCookieValue(key, legacy)) fallback?.removeItem(key);
      return legacy;
    },
    setItem(key, value) {
      if (writeCookieValue(key, value)) {
        fallback?.removeItem(key);
        return;
      }
      clearChunks(key, 0);
      fallback?.setItem(key, value);
    },
    removeItem(key) {
      clearChunks(key, 0);
      fallback?.removeItem(key);
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Nos domínios da plataforma, a sessão partilhada; fora deles, o armazenamento dado
 * (o `localStorage`, ou o mediador da pré-visualização do Lovable).
 */
export function sharedSessionStorage(
  otherwise: SessionStorageLike | undefined,
): SessionStorageLike | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return otherwise;
  if (window.location.protocol !== "https:") return otherwise;
  const domain = platformCookieDomain(window.location.hostname);
  return domain ? cookieSessionStorage(domain) : otherwise;
}

import { useEffect, useState } from "react";

/** A escolha é pessoal e isolada por escola; sem escolha, a barra começa expandida. */
export function usePersistedSidebar(userId: string, schoolId: string | null | undefined) {
  const key = userId ? `siga:sidebar:${userId}:${schoolId ?? "no-school"}` : null;
  const [preference, setPreference] = useState<{ key: string; collapsed: boolean } | null>(null);

  useEffect(() => {
    if (!key) {
      setPreference(null);
      return;
    }
    let collapsed = false;
    try {
      collapsed = window.localStorage.getItem(key) === "collapsed";
    } catch {
      // Modo privado ou storage bloqueado: manter a alternância nesta sessão.
    }
    setPreference({ key, collapsed });
  }, [key]);

  // A escola/conta anterior nunca determina a largura durante a troca de contexto.
  const collapsed = preference?.key === key ? preference.collapsed : false;
  const toggleCollapsed = () => {
    if (!key) return;
    const next = !collapsed;
    setPreference({ key, collapsed: next });
    try {
      window.localStorage.setItem(key, next ? "collapsed" : "expanded");
    } catch {
      // A interface continua funcional mesmo sem persistência disponível.
    }
  };

  return { collapsed, toggleCollapsed };
}

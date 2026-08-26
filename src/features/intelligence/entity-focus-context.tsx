import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EntityFocus } from "./types";

const COLLAPSE_KEY = "siga:context-panel-collapsed";

type EntityFocusContextValue = {
  focusedEntity: EntityFocus | null;
  setFocusedEntity: (entity: EntityFocus) => void;
  clearFocusedEntity: () => void;
  panelCollapsed: boolean;
  setPanelCollapsed: (collapsed: boolean) => void;
};

const EntityFocusContext = createContext<EntityFocusContextValue | null>(null);

export function EntityFocusProvider({ children }: { children: ReactNode }) {
  const [focusedEntity, setFocusedEntity] = useState<EntityFocus | null>(null);
  const [panelCollapsed, setPanelCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  });

  const clearFocusedEntity = useCallback(() => setFocusedEntity(null), []);

  const setPanelCollapsed = useCallback((collapsed: boolean) => {
    setPanelCollapsedState(collapsed);
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, []);

  const value = useMemo<EntityFocusContextValue>(
    () => ({
      focusedEntity,
      setFocusedEntity,
      clearFocusedEntity,
      panelCollapsed,
      setPanelCollapsed,
    }),
    [focusedEntity, clearFocusedEntity, panelCollapsed, setPanelCollapsed],
  );

  return <EntityFocusContext.Provider value={value}>{children}</EntityFocusContext.Provider>;
}

export function useEntityFocus() {
  const context = useContext(EntityFocusContext);
  if (!context) {
    return {
      focusedEntity: null,
      setFocusedEntity: () => {},
      clearFocusedEntity: () => {},
      panelCollapsed: true,
      setPanelCollapsed: () => {},
    } satisfies EntityFocusContextValue;
  }
  return context;
}

/**
 * `entity` deve ser estável por referência (ex.: construído com `useMemo`) e só mudar de
 * identidade quando o seu conteúdo relevante muda — caso contrário o painel nunca reflecte
 * dados que chegam depois da primeira declaração (ex.: queries que resolvem mais tarde).
 */
export function useDeclareEntityFocus(entity: EntityFocus | null) {
  const { setFocusedEntity, clearFocusedEntity } = useEntityFocus();
  useEffect(() => {
    if (!entity) return;
    setFocusedEntity(entity);
    return () => clearFocusedEntity();
  }, [entity, setFocusedEntity, clearFocusedEntity]);
}

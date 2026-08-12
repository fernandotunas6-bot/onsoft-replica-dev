import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "siga:list-filters:";
const URL_PARAM = "lf";

export type ListFilterBag = Record<string, string>;

export function parseFilterBag(raw: string | null | undefined): ListFilterBag {
  if (!raw) return {};
  try {
    const params = new URLSearchParams(raw);
    const bag: ListFilterBag = {};
    for (const [key, value] of params.entries()) {
      if (key) bag[key] = value;
    }
    return bag;
  } catch {
    return {};
  }
}

export function serializeFilterBag(filters: ListFilterBag, defaults: ListFilterBag): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const fallback = defaults[key] ?? "";
    if (String(value ?? "") !== String(fallback)) {
      params.set(key, String(value ?? ""));
    }
  }
  return params.toString();
}

export function mergeFilterSources<T extends ListFilterBag>(
  defaults: T,
  stored: ListFilterBag,
  url: ListFilterBag | null,
): T {
  if (url) {
    return { ...defaults, ...pickKnown(defaults, url) } as T;
  }
  return { ...defaults, ...pickKnown(defaults, stored) } as T;
}

export function countActiveFilters(filters: ListFilterBag, defaults: ListFilterBag): number {
  return Object.entries(filters).filter(([key, value]) => {
    const fallback = defaults[key] ?? "";
    return String(value ?? "") !== String(fallback);
  }).length;
}

export function hasActiveFilters(filters: ListFilterBag, defaults: ListFilterBag): boolean {
  return countActiveFilters(filters, defaults) > 0;
}

export function dateInRange(value: string | null | undefined, from: string, to: string): boolean {
  const day = String(value ?? "").slice(0, 10);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function pickKnown<T extends ListFilterBag>(defaults: T, source: ListFilterBag): Partial<T> {
  const next: ListFilterBag = {};
  for (const key of Object.keys(defaults)) {
    if (typeof source[key] === "string") next[key] = source[key];
  }
  return next as Partial<T>;
}

function readStored(key: string): ListFilterBag {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string")
        .map(([field, value]) => [field, value as string]),
    );
  } catch {
    return {};
  }
}

function writeStored(key: string, value: ListFilterBag) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
}

function readUrlBag(): ListFilterBag | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(URL_PARAM);
  if (raw === null) return null;
  return parseFilterBag(raw);
}

function writeUrlBag(filters: ListFilterBag, defaults: ListFilterBag) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const serialized = serializeFilterBag(filters, defaults);
  if (serialized) url.searchParams.set(URL_PARAM, serialized);
  else url.searchParams.delete(URL_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(window.history.state, "", next);
  }
}

/**
 * Filtros de lista com persistência em localStorage e na URL (`lf`).
 * Mantém critérios ao navegar entre rotas premium e ao recarregar a página.
 */
export function usePersistedListFilters<T extends ListFilterBag>(
  storageKey: string,
  defaults: T,
  options?: { persistUrl?: boolean },
) {
  const persistUrl = options?.persistUrl !== false;
  const [filters, setFiltersState] = useState<T>(() =>
    mergeFilterSources(defaults, readStored(storageKey), persistUrl ? readUrlBag() : null),
  );

  useEffect(() => {
    writeStored(storageKey, filters);
    if (persistUrl) writeUrlBag(filters, defaults);
  }, [defaults, filters, persistUrl, storageKey]);

  useEffect(() => {
    if (!persistUrl) return;
    const onPopState = () => {
      setFiltersState(mergeFilterSources(defaults, readStored(storageKey), readUrlBag()));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [defaults, persistUrl, storageKey]);

  const setFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setFilters = useCallback((patch: Partial<T>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaults);
  }, [defaults]);

  const activeCount = useMemo(() => countActiveFilters(filters, defaults), [defaults, filters]);

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    activeCount,
    hasActive: activeCount > 0,
  };
}

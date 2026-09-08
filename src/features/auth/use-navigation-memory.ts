import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  isFavoriteNav,
  labelForPath,
  readFavoriteNav,
  readRecentNav,
  toggleFavoriteNav,
  touchRecentNav,
  type NavMemoryItem,
} from "@/lib/navigation-memory";

export function useNavigationMemory() {
  const currentUser = useCurrentAccount();
  const userId = currentUser.id || currentUser.email || "anon";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const searchStr = useRouterState({
    select: (r) => {
      const search = r.location.search;
      if (!search || typeof search !== "object") return "";
      return new URLSearchParams(
        Object.entries(search as Record<string, unknown>)
          .filter(([, value]) => value != null && value !== "")
          .map(([key, value]) => [key, String(value)]),
      ).toString();
    },
  });

  const [recents, setRecents] = useState<NavMemoryItem[]>([]);
  const [favorites, setFavorites] = useState<NavMemoryItem[]>([]);

  useEffect(() => {
    setRecents(readRecentNav(userId));
    setFavorites(readFavoriteNav(userId));
  }, [userId]);

  useEffect(() => {
    if (!pathname) return;
    const label = labelForPath(pathname);
    const next = touchRecentNav(userId, {
      path: pathname,
      label,
      search: searchStr || undefined,
    });
    setRecents(next);
  }, [pathname, searchStr, userId]);

  const current = { path: pathname, search: searchStr || undefined, label: labelForPath(pathname) };
  const favorited = isFavoriteNav(userId, current);

  const toggleFavorite = (entry?: { path: string; label: string; search?: string }) => {
    const target = entry ?? current;
    const next = toggleFavoriteNav(userId, target);
    setFavorites(next);
    return next;
  };

  const refresh = () => {
    setRecents(readRecentNav(userId));
    setFavorites(readFavoriteNav(userId));
  };

  return {
    recents,
    favorites,
    favorited,
    current,
    toggleFavorite,
    refresh,
  };
}

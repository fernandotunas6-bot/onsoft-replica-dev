import { useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useTenant } from "@/features/saas/tenant-context";
import {
  isFavoriteNav,
  labelForPath,
  migrateLegacyNavMemory,
  navMemoryOwner,
  readFavoriteNav,
  readRecentNav,
  toggleFavoriteNav,
  touchRecentNav,
  type NavMemoryItem,
} from "@/lib/navigation-memory";

export function useNavigationMemory() {
  const currentUser = useCurrentAccount();
  const userId = currentUser.id || currentUser.email || "anon";
  // Por utilizador e escola: trocar de escola troca de memória.
  const owner = navMemoryOwner(userId, currentUser.schoolId);
  const { activePlan } = useTenant();
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

  const [storedRecents, setRecents] = useState<NavMemoryItem[]>([]);
  const [storedFavorites, setFavorites] = useState<NavMemoryItem[]>([]);

  useEffect(() => {
    migrateLegacyNavMemory(userId, owner);
    setRecents(readRecentNav(owner));
    setFavorites(readFavoriteNav(owner));
  }, [userId, owner]);

  useEffect(() => {
    if (!pathname) return;
    const label = labelForPath(pathname);
    const next = touchRecentNav(owner, {
      path: pathname,
      label,
      search: searchStr || undefined,
    });
    setRecents(next);
  }, [pathname, searchStr, owner]);

  // Uma página que a conta deixou de poder abrir (cargo, permissão ou plano) não se oferece.
  const { role, grants } = currentUser;
  const [recents, favorites] = useMemo(() => {
    const canOpen = (item: NavMemoryItem) => canAccessPath(item.path, role, grants, activePlan);
    return [storedRecents.filter(canOpen), storedFavorites.filter(canOpen)];
  }, [storedRecents, storedFavorites, role, grants, activePlan]);

  const current = { path: pathname, search: searchStr || undefined, label: labelForPath(pathname) };
  const favorited = isFavoriteNav(owner, current);

  const toggleFavorite = (entry?: { path: string; label: string; search?: string }) => {
    const target = entry ?? current;
    const next = toggleFavoriteNav(owner, target);
    setFavorites(next);
    return next;
  };

  const refresh = () => {
    setRecents(readRecentNav(owner));
    setFavorites(readFavoriteNav(owner));
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
